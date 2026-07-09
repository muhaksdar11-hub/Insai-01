import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getSupabaseClient } from '@/lib/supabase/client';

export const dynamic = "force-dynamic";

export async function GET() {
  let formattedData: any[] = [];
  let success = false;
  let error: { code: string; message: string; } | null = null;

  try {
    const data = await getSupabaseClient().getHistoricalSignals();
    
    if (!Array.isArray(data)) {
      if (data.status === 'not_configured') {
         // Return gracefully
         return NextResponse.json({
            success: true,
            data: [], // empty array for UI components that map
            meta: { ...data } // Provide status in meta
         });
      }
      throw new Error(data.reason || 'Failed to fetch historical signals');
    }

    // Fetch strategies to map ID to Name
    const strategies = await getSupabaseClient().getStrategies();
    const strategyMap = new Map();
    if (Array.isArray(strategies)) {
        strategies.forEach((s: any) => strategyMap.set(s.id, s.name));
    }

    // Map DB schema to UI expected format
    formattedData = data.map((signal: any) => {
      // Format closed at date
      const closedDate = new Date(signal.closed_at || signal.created_at);
      const closedAtStr = `${closedDate.toLocaleDateString()} ${closedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      // Calculate age based on created_at and closed_at for total duration
      const createdAt = new Date(signal.created_at);
      const diffMs = closedDate.getTime() - createdAt.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const duration = diffHours > 0 
        ? `${diffHours}h ${diffMins % 60}m` 
        : `${diffMins}m`;

      return {
        id: signal.id,
        signalKey: signal.signal_key,
        direction: (signal.signals?.direction || signal.direction || '').toUpperCase(),
        pair: signal.symbol || 'XAUUSD',
        strategyName: strategyMap.get(signal.strategy_id) || signal.strategy_id || 'Strategy',
        outcome: signal.outcome || 'UNKNOWN',
        closedAt: closedAtStr,
        closedAtTimestamp: closedDate.getTime(),
        pips: signal.pips_result || 0,
        status: signal.status,
        duration: duration,
        entry: signal.signals?.entry_price || signal.entry_price || 0,
        sl: signal.signals?.sl_price || signal.sl_price || 0,
        tp1: signal.signals?.tp1_price || signal.tp1_price || 0,
        reason: signal.reason || null // Assumed reasoning column or pass outcome explanation
      };
    });

    
    success = true;
  } catch (err: any) {
    error = {
      code: 'DB_ERROR',
      message: err.message || 'Failed to fetch historical signals'
    };
  }

  const response: ApiResponse<any> = {
    success,
    data: formattedData,
    error,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response);
}
