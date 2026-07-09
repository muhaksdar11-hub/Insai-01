import { logger } from '../utils/logger';
import { getEnv } from '../utils/env';

export class TelegramBotService {
  private get currentBotToken(): string | undefined {
    return getEnv('TELEGRAM_BOT_TOKEN');
  }
  
  private get currentChatId(): string | undefined {
    return getEnv('TELEGRAM_CHAT_ID');
  }

  public get isConfigured(): boolean {
    return !!(this.currentBotToken && this.currentChatId);
  }

  public async sendNotification(message: string): Promise<boolean> {
    if (!this.isConfigured) {
      logger.warn('Telegram Bot not configured. Skipping notification.');
      return false;
    }
    
    try {
      const url = `https://api.telegram.org/bot${this.currentBotToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.currentChatId,
          text: message,
          parse_mode: 'HTML'
        })
      });
      if (!res.ok) {
        throw new Error(`Telegram API Error: ${res.statusText}`);
      }
      return true;
    } catch (e: any) {
      logger.error(`Failed to send telegram notification: ${e.message}`);
      return false;
    }
  }

  public async sendPhoto(photoUrl: string, caption: string): Promise<boolean> {
    if (!this.isConfigured) {
      logger.warn('Telegram Bot not configured. Skipping notification.');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.currentBotToken}/sendPhoto`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.currentChatId,
          photo: photoUrl,
          caption: caption,
          parse_mode: 'HTML'
        })
      });
      if (!res.ok) {
        throw new Error(`Telegram API Error: ${res.statusText}`);
      }
      return true;
    } catch (e: any) {
      logger.error(`Failed to send telegram photo: ${e.message}`);
      return false;
    }
  }
}

let _telegramBot: TelegramBotService | null = null;
export function getTelegramBot(): TelegramBotService {
  if (!_telegramBot) _telegramBot = new TelegramBotService();
  return _telegramBot;
}
