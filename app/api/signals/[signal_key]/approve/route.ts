export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getSupabaseClient } from '@/lib/supabase/client';
import crypto from 'crypto';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ signal_key: string }> }
) {
  const { signal_key } = await params;
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

  let success = false;
  let error = null;

  try {
    await getSupabaseClient().updateSignalState(signal_key, 'APPROVED');
    success = true;
  } catch (err: any) {
    error = { code: 'DB_ERROR', message: err.message };
  }

  const response: ApiResponse<any> = {
    success,
    data: success ? {
      schema_version: '1.0',
      correlation_id: crypto.randomUUID(),
      signal_key,
      status: 'APPROVED',
      action: 'approve',
      source_timestamp: new Date().toISOString()
    } : null,
    error,
    meta: {
      request_id: reqId,
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response);
}
