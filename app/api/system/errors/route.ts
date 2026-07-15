import { NextResponse } from 'next/server';
import { errorTracker } from '@/lib/observability/error-tracker';
import { ApiResponse } from '@/types';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const reqId = req.headers.get('x-request-id') || crypto.randomUUID();
  try {
    const recentErrors = errorTracker.getRecentErrors();
    const count24h = errorTracker.getErrorCountInLast24h();
    const response: ApiResponse<any> = {
      success: true,
      data: {
        recentErrors,
        count24h
      },
      error: null,
      meta: {
        request_id: reqId,
        timestamp: new Date().toISOString()
      }
    };
    return NextResponse.json(response);
  } catch (error) {
    const errorResponse: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'ERRORS_API_ERROR', message: error instanceof Error ? error.message : 'Unknown error' },
      meta: {
        request_id: reqId,
        timestamp: new Date().toISOString()
      }
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
