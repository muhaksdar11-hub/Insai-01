import { logger } from '../utils/logger';

export interface MetricsSnapshot {
  marketDataLatencyMs: number;
  aiValidationLatencyMs: number;
  signalThroughput: number;
  dedupeRate: number;
  errorRate: number;
  notificationDeliveryRate: number;
  timestamp: string;
}

class MetricsEngine {
  private currentMetrics: MetricsSnapshot = {
    marketDataLatencyMs: 0,
    aiValidationLatencyMs: 0,
    signalThroughput: 0,
    dedupeRate: 0,
    errorRate: 0,
    notificationDeliveryRate: 0,
    timestamp: new Date().toISOString()
  };

  public recordMarketDataLatency(latencyMs: number) {
    this.currentMetrics.marketDataLatencyMs = latencyMs;
    // Log if exceeds budget (e.g., 500ms)
    if (latencyMs > 500) {
        logger.warn('Market data latency exceeded budget', {
            service_name: 'MetricsEngine',
            latencyMs,
            threshold: 500,
            status: 'degraded'
        });
    }
  }

  public recordAiValidationLatency(latencyMs: number) {
      this.currentMetrics.aiValidationLatencyMs = latencyMs;
       if (latencyMs > 2000) {
        logger.warn('AI validation latency exceeded budget', {
            service_name: 'MetricsEngine',
            latencyMs,
            threshold: 2000,
            status: 'degraded'
        });
    }
  }

  public recordSignalProcessed(isDeduped: boolean, isError: boolean) {
    this.currentMetrics.signalThroughput++;
    if (isDeduped) {
        // running average logic
        this.currentMetrics.dedupeRate = (this.currentMetrics.dedupeRate + 1) / 2;
    }
    if (isError) {
        this.currentMetrics.errorRate = (this.currentMetrics.errorRate + 1) / 2;
    }
  }

  public recordNotification(success: boolean) {
      if (success) {
           this.currentMetrics.notificationDeliveryRate = (this.currentMetrics.notificationDeliveryRate + 1) / 2;
      } else {
           this.currentMetrics.notificationDeliveryRate = (this.currentMetrics.notificationDeliveryRate) / 2;
      }
  }

  public getMetrics(): MetricsSnapshot {
    this.currentMetrics.timestamp = new Date().toISOString();
    return this.currentMetrics;
  }
}

export const metricsEngine = new MetricsEngine();
