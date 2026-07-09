import { logger } from '../utils/logger';
import { alertEngine } from '../notifications/alert-engine';

export interface ErrorEvent {
  component: string;
  error: Error;
  context?: any;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

class ErrorTracker {
  private recentErrors: { timestamp: string, event: ErrorEvent }[] = [];

  public trackError(event: ErrorEvent) {
    const errorRecord = {
      timestamp: new Date().toISOString(),
      event
    };
    
    this.recentErrors.unshift(errorRecord);
    // Keep only last 50
    if (this.recentErrors.length > 50) {
      this.recentErrors.pop();
    }

    logger.error(`[${event.severity.toUpperCase()}] ${event.component}: ${event.error.message}`, {
      stack: event.error.stack,
      context: event.context
    });

    if (event.severity === 'critical') {
       alertEngine.raiseAlert({
          severity: 'critical',
          component: event.component,
          message: event.error.message,
          details: { stack: event.error.stack, context: event.context }
       });
    } else if (event.severity === 'high') {
       alertEngine.raiseAlert({
          severity: 'error',
          component: event.component,
          message: event.error.message,
          details: { stack: event.error.stack, context: event.context }
       });
    }
  }

  public getRecentErrors() {
    return this.recentErrors;
  }
  
  public getErrorCountInLast24h(): number {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return this.recentErrors.filter(e => new Date(e.timestamp) >= yesterday).length;
  }
}

export const errorTracker = new ErrorTracker();
