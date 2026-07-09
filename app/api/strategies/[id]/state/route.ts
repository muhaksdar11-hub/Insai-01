export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getSupabaseClient } from '@/lib/supabase/client';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let state = 'WAIT_TREND';
  let success = false;
  let error = null;

  try {
    const data = await getSupabaseClient().getStrategyState(id);
    
    // Check if data is an error object
    if (data && 'status' in data && data.status === 'not_configured') {
       return NextResponse.json({
          success: true,
          data: {
             strategy_id: id,
             state: 'IDLE',
             last_updated: new Date().toISOString()
          },
          meta: { ...data }
       });
    }

    if (data) {
      state = data.state_name || 'WAIT_TREND';
    }
    success = true;
  } catch (err: any) {
    error = { code: 'DB_ERROR', message: err.message };
  }
  
  const response: ApiResponse<any> = {
    success,
    data: success ? {
      strategy_id: id,
      state,
      last_updated: new Date().toISOString()
    } : null,
    error,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response);
}
