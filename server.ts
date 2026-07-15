import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import next from 'next';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logger, requestContext } from '@/lib/utils/logger';
import { getMarketScanner } from '@/lib/trading-engine/scanner';
import { getQueueManager } from '@/lib/redis/queue';
import { healthCheckEngine } from '@/lib/observability/health-check';
import { validateEnvironment } from '@/lib/security/env-validator';
import { getIngestionService } from '@/lib/services/ingestion_service';
import crypto from 'crypto';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
const turbopack = dev;

let pyProcess: ChildProcess | null = null;

function startPythonEngine() {
  const externalUrl = process.env.PYTHON_ENGINE_URL;
  const pythonPort = process.env.PYTHON_PORT || '8181';
  
  if (externalUrl && !externalUrl.includes('127.0.0.1') && !externalUrl.includes('localhost')) {
    logger.info(`External Python Engine configured (${externalUrl}), skipping local spawn.`);
    return;
  }
  
  logger.info('Starting Python Engine locally...');
  
  // Nixpacks puts the venv at /app/venv or relative venv
  // When running locally, it might be in python-engine/venv
  const rootVenv = path.join(process.cwd(), "venv", "bin", "python3");
  const localVenv = path.join(process.cwd(), "python-engine", "venv", "bin", "python3");
  const systemPython = "python3";
  
  let pythonExec = systemPython;
  if (fs.existsSync(rootVenv)) {
      pythonExec = rootVenv;
  } else if (fs.existsSync(localVenv)) {
      pythonExec = localVenv;
  }

  try {
    if (pythonExec !== systemPython && fs.existsSync(pythonExec)) {
      try {
        fs.chmodSync(pythonExec, '755');
      } catch (e: any) {
        logger.warn(`Could not chmod python3 executable: ${e.message}`);
      }
    }
    
    pyProcess = spawn(pythonExec, [
      '-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', pythonPort
    ], {
      cwd: path.join(process.cwd(), 'python-engine'),
      stdio: 'inherit',
      env: { ...process.env, PYTHON_PORT: pythonPort, PYTHONPATH: '.' }
    });

    pyProcess.on('error', (err: any) => {
      logger.error(`Failed to start local Python Engine: ${err.message}. Running in DEGRADED mode.`);
      pyProcess = null;
    });

    pyProcess.on('close', (code: any) => {
      if (isShuttingDown) return;
      if (code !== 0 && code !== null) {
        logger.error(`Local Python Engine exited unexpectedly with code ${code}. Running in DEGRADED mode.`);
      } else {
        logger.info('Local Python Engine exited normally.');
      }
      pyProcess = null;
    });
  } catch (err: any) {
    logger.error(`Failed to spawn Python Engine: ${err.message}. Running in DEGRADED mode.`);
    pyProcess = null;
  }
}

let isReady = false;
let isShuttingDown = false;
const app = next({ dev, hostname, port, turbopack });
const handle = app.getRequestHandler();

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.headers['x-request-id'] = correlationId;
  res.setHeader('X-Request-ID', correlationId);

  requestContext.run({ correlationId }, () => {
    // Request timeout to prevent hanging connections
    req.setTimeout(30000, () => {
      logger.warn(`Request timeout: ${req.url}`);
      if (!res.headersSent) {
        res.writeHead(408, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request Timeout' }));
      } else {
        req.destroy();
      }
    });

    res.setTimeout(30000, () => {
      logger.warn(`Response timeout: ${req.url}`);
      if (!res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Service Unavailable' }));
      } else {
        req.destroy();
      }
    });

    try {
      const parsedUrl = parse(req.url!, true);
      const { pathname } = parsedUrl;

      // Health checks endpoints (before Next.js handle)
      if (pathname === '/health/liveness') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        return;
      }
      
      if (pathname === '/health/readiness') {
        if (isShuttingDown) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'not_ready', isShuttingDown, timestamp: new Date().toISOString() }));
          return;
        }
        if (!isReady) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'starting', timestamp: new Date().toISOString() }));
          return;
        }

        healthCheckEngine.runHealthChecks().then(health => {
           if (health.status === 'UNAVAILABLE') {
               res.writeHead(503, { 'Content-Type': 'application/json' });
               res.end(JSON.stringify({ status: 'not_ready', reason: 'UNAVAILABLE', services: health.services, timestamp: new Date().toISOString() }));
           } else {
               res.writeHead(200, { 'Content-Type': 'application/json' });
               res.end(JSON.stringify({ status: 'ready', timestamp: new Date().toISOString() }));
           }
        }).catch(err => {
           res.writeHead(503, { 'Content-Type': 'application/json' });
           res.end(JSON.stringify({ status: 'not_ready', error: err.message, timestamp: new Date().toISOString() }));
        });
        return;
      }

      if (isShuttingDown) {
        res.writeHead(503, { 'Content-Type': 'application/json', 'Connection': 'close' });
        res.end(JSON.stringify({ error: 'Server is shutting down' }));
        return;
      }

      // Pass to Next.js
      handle(req, res, parsedUrl).catch((err: any) => {
        logger.error(`Error handling ${req.url}: ${err.message}`, { stack: err.stack });
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
      });
    } catch (err: any) {
      logger.error(`Server catch block error handling ${req.url}: ${err.message}`, { stack: err.stack });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    }
  });
});

// Setup graceful shutdown
const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  isShuttingDown = true;
  
  // Cleanup Python Process
  if (pyProcess && !pyProcess.killed) {
    logger.info('Shutting down local Python Engine...');
    pyProcess.kill('SIGTERM');
  }

  // Stop scanner
  try {
    const scanner = getMarketScanner();
    if (scanner) {
      scanner.stop();
    }
  } catch (e: any) {
    logger.warn(`Error stopping scanner during shutdown: ${e.message}`);
  }

  // Close Redis Queue
  try {
    await getQueueManager().close();
  } catch (e: any) {
    logger.warn(`Error stopping queue during shutdown: ${e.message}`);
  }

  // Give existing connections up to 5 seconds to finish
  const shutdownTimeout = setTimeout(() => {
    logger.warn('Forcing server shutdown after timeout');
    process.exit(1);
  }, 5000);

  server.close(() => {
    logger.info('Server successfully closed.');
    clearTimeout(shutdownTimeout);
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

app.prepare()
  .then(() => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      logger.error(`Server error: ${err.message}`, { stack: err.stack });
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use`);
        process.exit(1);
      }
    });

    server.listen(port, hostname, () => {
      logger.info(`> Ready on http://${hostname}:${port}`);
      
      // Initialize systems asynchronously to avoid blocking startup
      Promise.resolve().then(async () => {
        try {
          try {
            validateEnvironment();
          } catch (envErr: any) {
            logger.warn(`Environment validation warning: ${envErr.message}`);
          }

          startPythonEngine();
          logger.info('Services initialized asynchronously.');
          
          try {
            getMarketScanner().start().catch(err => logger.error(`marketScanner error: ${err.message}`));
          } catch (e: any) {
            logger.error(`Failed to start market scanner: ${e.message}`);
          }
          
          try {
             getIngestionService().start('XAUUSD');
          } catch (e: any) {
             logger.error(`Failed to start Ingestion Service: ${e.message}`);
          }
          
          // Wait for a brief moment for async startups like Redis to connect before declaring ready
          setTimeout(() => {
             isReady = true;
             logger.info('Server marked as ready for healthchecks.');
          }, 3000);
          
        } catch (initErr: any) {
          logger.error(`Critical error during backend initialization: ${initErr.message}`);
          isReady = true; // Still true so health check can report UNAVAILABLE
        }
      });
    });
  })
  .catch((err: any) => {
    logger.error(`Failed to prepare Next.js app: ${err.message}`, { stack: err.stack });
    process.exit(1);
  });
