import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { getMarketScanner } from './lib/trading-engine/scanner';
import { logger } from './lib/utils/logger';
import { validateEnvironment } from './lib/security/env-validator';
import { spawn } from 'child_process';
import * as path from 'path';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
const turbopack = process.argv.includes('--turbopack');

const app = next({ dev, hostname, port, turbopack });
const handle = app.getRequestHandler();

let pyProcess: import('child_process').ChildProcess;
function startPythonEngine() {
  const externalUrl = process.env.PYTHON_ENGINE_URL;
  const pythonPort = process.env.PYTHON_PORT || '8181';
  const expectedLocalUrl = `http://127.0.0.1:${pythonPort}`;
  const expectedLocalUrlAlt = `http://localhost:${pythonPort}`;

  if (externalUrl && externalUrl !== expectedLocalUrl && externalUrl !== expectedLocalUrlAlt) {
    logger.info(`External Python Engine configured (${externalUrl}), skipping local spawn.`);
    return;
  }

  logger.info('Starting Python Engine locally...');
  
  let pythonExec = 'python3';
  if (process.env.VIRTUAL_ENV) {
    pythonExec = path.join(process.env.VIRTUAL_ENV, 'bin', 'python');
  } else if (require('fs').existsSync(path.join(process.cwd(), 'venv', 'bin', 'python3'))) {
    pythonExec = path.join(process.cwd(), 'venv', 'bin', 'python3');
  } else if (require('fs').existsSync(path.join(process.cwd(), 'python-engine', '.venv', 'bin', 'python3'))) {
    pythonExec = path.join(process.cwd(), 'python-engine', '.venv', 'bin', 'python3');
  }

  try {
    pyProcess = spawn(pythonExec, [
      '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', pythonPort
    ], {
      cwd: path.join(process.cwd(), 'python-engine'),
      stdio: 'inherit',
      env: { ...process.env, PYTHON_PORT: pythonPort }
    });

    pyProcess.on('error', (err: any) => {
      logger.error(`Failed to start local Python Engine (this is okay if python is not installed locally): ${err.message}`);
    });

    pyProcess.on('close', (code: any) => {
      if (code !== 0 && code !== null) {
        logger.warn(`Local Python Engine exited with code ${code}.`);
      } else {
        logger.info('Local Python Engine exited normally.');
      }
    });

    // Cleanup python process on exit
    const cleanup = () => {
      if (pyProcess && !pyProcess.killed) {
        logger.info('Shutting down local Python Engine...');
        pyProcess.kill('SIGTERM');
      }
    };
    process.on('exit', cleanup);
    process.on('SIGINT', () => { cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { cleanup(); process.exit(0); });

  } catch (err: any) {
    logger.error(`Failed to spawn Python Engine: ${err.message}`);
  }
}



app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      
      // Proxy requests to Python engine if needed, or handle via Next.js API route using fetch
      await handle(req, res, parsedUrl);
    } catch (err: any) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  })
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      logger.info(`> Ready on http://${hostname}:${port}`);
      
      // Initialize systems asynchronously after server starts listening
      Promise.resolve().then(async () => {
        try {
          // Validate environment variables first
          validateEnvironment();

          startPythonEngine();

          // We no longer eagerly connect Queue, MCP, or Scanner here.
          // They will lazily initialize when a strategy is activated or an API is called.
          logger.info('Lazy initialization configured. Services will start when required.');
          
          // Background workers (scanner, sync) will only start if enabled in DB/Config, 
          // or we can start the polling loop here but it will immediately abort if not configured.
          // For now, we will start the scanner loop so it's ready, but it shouldn't connect to WS unless active.
          try {
            // Interval set to 60 seconds (60000ms) for scanning XAUUSD
            getMarketScanner().start().catch(err => logger.error(`marketScanner error: ${err.message}`));
          } catch (e: any) {
            logger.error(`Failed to start market scanner: ${e.message}`);
          }
        } catch (initErr: any) {
          logger.error(`Critical error during backend initialization: ${initErr.message}`);
        }
      });
    });
});
