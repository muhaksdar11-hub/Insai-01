import { logger } from '../utils/logger';
import { getTelegramBot } from './telegram-bot';
import { getSupabaseClient } from '../supabase/client';
import * as crypto from 'crypto';

export interface AlertPayload {
  alert_key: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  component: string;
  message: string;
  details?: any;
  timestamp: string;
}

export class AlertEngine {
  public async raiseAlert(payload: Omit<AlertPayload, 'alert_key' | 'timestamp'>): Promise<void> {
    const alert_key = crypto.randomUUID();
    const alert: AlertPayload = {
        alert_key,
        timestamp: new Date().toISOString(),
        ...payload
    };

    logger.error(`[ALERT] ${alert.severity.toUpperCase()} - ${alert.component}: ${alert.message}`, alert.details);

    // Save to DB (if supported)
    try {
        if (getSupabaseClient().isConnected()) {
            await getSupabaseClient().insertAlert(alert);
        }
    } catch (e: any) {
        logger.error(`Failed to persist alert: ${e.message}`);
    }

    // Send to Telegram if severity is error or critical
    if (['error', 'critical'].includes(alert.severity)) {
       const message = `
🚨 *SYSTEM ALERT: ${alert.severity.toUpperCase()}* 🚨
*Component:* ${alert.component}
*Message:* ${alert.message}
*Time:* ${alert.timestamp}
       `.trim();
       
       getTelegramBot().sendNotification(message).catch(() => {});
    }
  }
}

export const alertEngine = new AlertEngine();
