import { AsyncLocalStorage } from 'async_hooks';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogPayload {
  correlation_id?: string;
  schema_version?: string;
  source_timestamp?: string;
  signal_key?: string;
  strategy_id?: string;
  service_name?: string;
  status?: string;
  reason?: string;
  [key: string]: any;
}

const globalAny: any = globalThis;
if (!globalAny.__logBuffer) {
  globalAny.__logBuffer = [];
}
export const logBuffer: any[] = globalAny.__logBuffer;

export const requestContext = new AsyncLocalStorage<{ correlationId?: string }>();

export const logger = {
  log: (level: LogLevel, message: string, payload?: LogPayload) => {
    const context = requestContext.getStore();
    const correlation_id = payload?.correlation_id || context?.correlationId;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(correlation_id ? { correlation_id } : {}),
      ...payload
    };
    
    // Add to buffer
    logBuffer.unshift(logEntry);
    if (logBuffer.length > 200) {
        logBuffer.pop();
    }
    
    // Logs are directed to console. In a production environment, this would integrate with an external APM/observability platform.
    console.log(JSON.stringify(logEntry));
  },
  info: (message: string, payload?: LogPayload) => logger.log('info', message, payload),
  warn: (message: string, payload?: LogPayload) => logger.log('warn', message, payload),
  error: (message: string, payload?: LogPayload) => logger.log('error', message, payload),
  debug: (message: string, payload?: LogPayload) => logger.log('debug', message, payload),
};
