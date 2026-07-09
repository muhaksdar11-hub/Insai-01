import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getSupabaseClient } from '@/lib/supabase/client';

export const dynamic = "force-dynamic";

export async function GET() {
  let logs: any[] = [];
  let success = false;
  let error = null;

  try {
    const logsRes = await getSupabaseClient().getAuditLogs();
    
    if (!Array.isArray(logsRes)) {
      if (logsRes.status === 'not_configured') {
         return NextResponse.json({
            success: true,
            data: { logs: [] },
            meta: { ...logsRes }
         });
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
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response);
}
