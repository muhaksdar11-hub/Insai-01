import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { ApiResponse } from '@/types';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export async function GET() {
  const reqId = crypto.randomUUID();

  if (process.env.NODE_ENV !== 'development') {
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'This endpoint is only available in development mode.' },
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    };
    return NextResponse.json(response, { status: 403 });
  }

  try {
      const supabase = getSupabaseClient().getClient();
      if (!supabase) {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: { code: 'DB_ERROR', message: 'No DB connected' },
          meta: { request_id: reqId, timestamp: new Date().toISOString() }
        };
        return NextResponse.json(response, { status: 500 });
      }

      const r1 = await supabase.from('strategies').update({ id: 'strategy-1-smc' }).eq('id', 'strategy-1');
      const r2 = await supabase.from('strategies').update({ id: 'strategy-2-snd' }).eq('id', 'strategy-2');
      const r3 = await supabase.from('strategies').update({ id: 'strategy-3-scalping' }).eq('id', 'strategy-3');
      const r4 = await supabase.from('strategies').update({ id: 'strategy-4-news' }).eq('id', 'strategy-4');

      // Also fix strategy_states table
      const r5 = await supabase.from('strategy_states').update({ strategy_id: 'strategy-1-smc' }).eq('strategy_id', 'strategy-1');
      const r6 = await supabase.from('strategy_states').update({ strategy_id: 'strategy-2-snd' }).eq('strategy_id', 'strategy-2');
      const r7 = await supabase.from('strategy_states').update({ strategy_id: 'strategy-3-scalping' }).eq('strategy_id', 'strategy-3');
      const r8 = await supabase.from('strategy_states').update({ strategy_id: 'strategy-4-news' }).eq('strategy_id', 'strategy-4');

      const response: ApiResponse<any> = {
        success: true,
        data: {
            strategies: [r1.error, r2.error, r3.error, r4.error],
            states: [r5.error, r6.error, r7.error, r8.error]
        },
        error: null,
        meta: { request_id: reqId, timestamp: new Date().toISOString() }
      };
      return NextResponse.json(response);
  } catch (e: any) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'INTERNAL_ERROR', message: e.message },
        meta: { request_id: reqId, timestamp: new Date().toISOString() }
      };
      return NextResponse.json(response, { status: 500 });
  }
}
