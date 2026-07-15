import { logger } from '../utils/logger';
import * as os from 'os';

export interface MetricsSnapshot {
  marketDataLatencyMs: number;
  aiValidationLatencyMs: number;
  signalThroughput: number;
  dedupeRate: number;
  errorRate: number;
  notificationDeliveryRate: number;
  queueDepth: number;
  scannerDurationMs: number;
  cacheHitRatio: number;
  streamConnectionCount: number;
  reconnectCount: number;
  cpuPressure: number;
  ramPressure: number;
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
    queueDepth: 0,
    scannerDurationMs: 0,
    cacheHitRatio: 0,
    streamConnectionCount: 0,
    reconnectCount: 0,
    cpuPressure: 0,
    ramPressure: 0,
    timestamp: new Date().toISOString()
  };

  private cacheHits = 0;
  private cacheMisses = 0;

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

  public recordCacheAccess(hit: boolean) {
      if (hit) this.cacheHits++;
      else this.cacheMisses++;
      const total = this.cacheHits + this.cacheMisses;
      if (total > 0) {
          this.currentMetrics.cacheHitRatio = this.cacheHits / total;
      }
  }

  public updateQueueDepth(depth: number) {
      this.currentMetrics.queueDepth = depth;
  }

  public recordScannerDuration(durationMs: number) {
      this.currentMetrics.scannerDurationMs = durationMs;
  }

  public updateStreamConnections(count: number) {
      this.currentMetrics.streamConnectionCount = count;
  }

  public recordReconnect() {
      this.currentMetrics.reconnectCount++;
  }

  private updateSystemMetrics() {
      const cpus = os.cpus();
      const load = os.loadavg()[0]; // 1 minute load average
      this.currentMetrics.cpuPressure = Math.min((load / cpus.length) * 100, 100);
      
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      this.currentMetrics.ramPressure = ((totalMem - freeMem) / totalMem) * 100;
  }

  public getMetrics(): MetricsSnapshot {
    this.updateSystemMetrics();
    this.currentMetrics.timestamp = new Date().toISOString();
    return this.currentMetrics;
  }
}

export const metricsEngine = new MetricsEngine();
