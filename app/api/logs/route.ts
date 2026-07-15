import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getSupabaseClient } from '@/lib/supabase/client';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const reqId = req.headers.get('x-request-id') || crypto.randomUUID();
  let logs: any[] = [];
  let success = false;
  let error = null;

  try {
    const logsRes = await getSupabaseClient().getAuditLogs();
    
    if (!Array.isArray(logsRes)) {
      if (logsRes.status === 'not_configured') {
         const emptyResponse: ApiResponse<any> = {
            success: true,
            data: { logs: [] },
            error: null,
            meta: {
              request_id: reqId,
              timestamp: new Date().toISOString(),
              ...logsRes
            }
         };
         return NextResponse.json(emptyResponse);
      }
      throw new Error(logsRes.reason || 'Failed to fetch logs');
    }
    
    logs = logsRes;
    success = true;
  } catch (err: any) {
    error = { code: 'DB_ERROR', message: err.message };
  }

  const response: ApiResponse<any> = {
    success,
    data: {
      logs
    },
    error,
    meta: {
      request_id: reqId,
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response);
}
