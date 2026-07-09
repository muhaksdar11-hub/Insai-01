export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getSupabaseClient } from '@/lib/supabase/client';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ signal_key: string }> }
) {
  const { signal_key } = await params;
  let success = false;
  let error = null;

  try {
    await getSupabaseClient().updateSignalState(signal_key, 'REJECTED');
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
      status: 'REJECTED',
      action: 'reject',
      source_timestamp: new Date().toISOString()
    } : null,
    error,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response);
}
