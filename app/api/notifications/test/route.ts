export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getTelegramBot } from '@/lib/notifications/telegram-bot';
import crypto from 'crypto';

export async function POST() {
  const reqId = crypto.randomUUID();

  if (process.env.NODE_ENV !== 'development') {
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Mutation routes are only available in development mode.' },
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    };
    return NextResponse.json(response, { status: 403 });
  }

  const sent = await getTelegramBot().sendNotification('Test notification from INSAI');

  const response: ApiResponse<any> = {
    success: true,
    data: {
      sent,
      message: sent ? 'Test notification sent' : 'Telegram bot not configured'
    },
    error: null,
    meta: {
      request_id: reqId,
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response);
}
