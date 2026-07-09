export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getTelegramBot } from '@/lib/notifications/telegram-bot';

export async function POST() {
  const sent = await getTelegramBot().sendNotification('Test notification from INSAI');

  const response: ApiResponse<any> = {
    success: true,
    data: {
      sent,
      message: sent ? 'Test notification sent' : 'Telegram bot not configured'
    },
    error: null,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response);
}
