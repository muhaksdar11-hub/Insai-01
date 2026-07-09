import { logger } from '../utils/logger';
import { getTelegramBot } from './telegram-bot';

export interface NotificationPayload {
  signal_key: string;
  correlationId?: string;
  strategyName: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number[];
  checklist?: any[];
  reason: string;
  timestamp: string;
  status: 'sent' | 'queued' | 'deduped' | 'suppressed' | 'failed' | 'retrying';
  chartData?: number[]; // Array of last N close prices
}

export class NotificationEngine {
  private notifiedSignals: Set<string> = new Set();
  private maxHistorySize = 1000;

  public async notifyNewSignal(payload: NotificationPayload): Promise<void> {
    if (this.notifiedSignals.has(payload.signal_key)) {
      payload.status = 'deduped';
      return;
    }
    if (payload.status === 'suppressed') {
        return;
    }
    
    const message = this.formatMessage(payload);
    let chartUrl = undefined;
    
    // Generate Chart Screenshot URL if chartData is available
    if (payload.chartData && payload.chartData.length > 0) {
        chartUrl = this.generateChartUrl(payload);
    }
    
    try {
      let success = false;
      if (chartUrl) {
          success = await getTelegramBot().sendPhoto(chartUrl, message);
      } else {
          success = await getTelegramBot().sendNotification(message);
      }
      
      if (success) {
        payload.status = 'sent';
        this.notifiedSignals.add(payload.signal_key);
        // Prevent unbounded memory growth
        if (this.notifiedSignals.size > this.maxHistorySize) {
            const iterator = this.notifiedSignals.values();
            const firstValue = iterator.next().value;
            if (firstValue) {
                this.notifiedSignals.delete(firstValue);
            }
        }
      } else {
        payload.status = 'failed';
      }
    } catch (error) {
      payload.status = 'failed';
      logger.error('Error sending notification', { 
         signal_key: payload.signal_key,
         reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private generateChartUrl(payload: NotificationPayload): string {
      // Create a simplified line chart using QuickChart.io
      const data = payload.chartData!;
      const labels = data.map((_, i) => i.toString());
      
      const entryLine = data.map(() => payload.entry);
      const slLine = data.map(() => payload.sl);
      const tpLine = data.map(() => payload.tp[0] || payload.entry);

      const chartConfig = {
          type: 'line',
          data: {
              labels: labels,
              datasets: [
                  { label: 'Price', data: data, borderColor: 'blue', fill: false, borderWidth: 2, pointRadius: 0 },
                  { label: 'Entry', data: entryLine, borderColor: 'black', fill: false, borderWidth: 1, borderDash: [5, 5], pointRadius: 0 },
                  { label: 'SL', data: slLine, borderColor: 'red', fill: false, borderWidth: 1, borderDash: [5, 5], pointRadius: 0 },
                  { label: 'TP', data: tpLine, borderColor: 'green', fill: false, borderWidth: 1, borderDash: [5, 5], pointRadius: 0 }
              ]
          },
          options: {
              title: { display: true, text: `${payload.symbol} - ${payload.direction} Signal` },
              legend: { display: true, position: 'bottom' }
          }
      };
      
      const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
      return `https://quickchart.io/chart?c=${encodedConfig}&w=800&h=400&bkg=white`;
  }

  private formatMessage(payload: NotificationPayload): string {
    const passedChecks = payload.checklist ? payload.checklist.filter((i: any) => i.status === 'PASS').length : 0;
    const totalChecks = payload.checklist ? payload.checklist.length : 0;
    const checklistStr = payload.checklist && totalChecks > 0 ? `\n*AI Checklist:* ${passedChecks}/${totalChecks} Passed` : '';
    
    return `🚨 *INSAI SIGNAL ALERT* 🚨\n\n*Strategy:* ${payload.strategyName}\n*Pair:* ${payload.symbol}\n*Direction:* ${payload.direction}\n*Entry:* ${payload.entry}\n*SL:* ${payload.sl}\n*TP:* ${payload.tp.join(', ')}${checklistStr}\n*Reason:* ${payload.reason}\n*Time:* ${new Date(payload.timestamp).toLocaleString()}`.trim();
  }
}

export const notificationEngine = new NotificationEngine();
