import { NextResponse } from 'next/server';
import { logBuffer } from '@/lib/utils/logger';
import { ApiResponse } from '@/types';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const reqId = req.headers.get('x-request-id') || crypto.randomUUID();
  const response: ApiResponse<any> = {
    success: true,
    data: logBuffer,
    error: null,
    meta: {
      request_id: reqId,
      timestamp: new Date().toISOString()
    }
  };
  return NextResponse.json(response);
}
