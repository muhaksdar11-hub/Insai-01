export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { ApiResponse } from '@/types';
import crypto from 'crypto';

export async function GET() {
  try {
    const data = await getSupabaseClient().getHistoricalSignals();
    
    if (!Array.isArray(data)) {
        if (data.status === 'not_configured') {
           const emptyResponse: ApiResponse<any> = {
              success: true,
              data: [],
              error: null,
              meta: {
                 request_id: crypto.randomUUID(),
                 timestamp: new Date().toISOString(),
                 ...data
              }
           };
           return NextResponse.json(emptyResponse);
        }
        throw new Error(data.reason || 'Failed to fetch history');
    }

    // Map DB schema to UI expected format (similar logic to live signals but specific for history)
    const formattedData = data.map((item: any) => {
      // Safely access signals table join data which Supabase returns as nested object
      const signalData = item.signals || {};
      
      const closedAt = new Date(item.closed_at || item.created_at || new Date());
      
      return {
        id: item.id || crypto.randomUUID(),
        signalKey: item.signal_key,
        pair: item.symbol || 'XAUUSD',
        direction: signalData.direction || 'UNKNOWN',
        outcome: item.outcome || 'UNKNOWN', // WIN, LOSS, BREAK_EVEN
        pips: item.pips_result || 0,
        closedAtTimestamp: closedAt.getTime(),
        closedAt: closedAt.toLocaleString(),
        entry: signalData.entry_price || 0,
        sl: signalData.sl_price || 0,
        tp1: signalData.tp1_price || 0,
        strategyName: item.strategy_id || 'Strategy',
        status: item.status || item.outcome,
        reason: item.reason || ''
      };
    });

    const response: ApiResponse<any> = {
      success: true,
      data: formattedData,
      error: null,
      meta: {
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      }
    };
    return NextResponse.json(response);

  } catch (error: any) {
    const errorResponse: ApiResponse<null> = {
      success: false,
      data: null,
      error: {
        code: 'HISTORY_FETCH_ERROR',
        message: error.message
      },
      meta: {
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      }
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
