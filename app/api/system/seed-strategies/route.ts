import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';

export async function GET() {
  const defaultStrategies = [
    { id: 'strategy-1-smc', name: 'SMC London Killzone', description: 'SMC London Killzone', status: 'active', enabled: true, config: {} },
    { id: 'strategy-2-snd', name: 'SnD Engulfing Confirmation', description: 'SnD Engulfing Confirmation', status: 'active', enabled: true, config: {} },
    { id: 'strategy-3-scalping', name: 'M1/M5 SMC Scalping', description: 'M1/M5 SMC Scalping', status: 'active', enabled: true, config: {} },
    { id: 'strategy-4-news', name: 'High Impact News Reversal', description: 'High Impact News Reversal', status: 'active', enabled: true, config: {} },
    { id: 'strategy-5-smc-sd-confluence', name: 'SMC-SD Pattern Confluence', description: 'SMC-SD Pattern Confluence', status: 'active', enabled: true, config: {} },
    { id: 'strategy-6-smc-london-m15', name: 'SMC + London Session + M15', description: 'Smart Money Concepts during London Open', status: 'active', enabled: true, config: {} },
    { id: 'strategy-7-sd-engulfing', name: 'Supply & Demand + Engulfing', description: 'S&D zones with Engulfing confirmation.', status: 'active', enabled: true, config: {} },
    { id: 'strategy-8-scalping-liquidity', name: 'SMC Scalping + Liquidity Sweeps', description: 'Scalping with Liquidity Sweeps on M5', status: 'active', enabled: true, config: {} },
    { id: 'strategy-9-news-reversal', name: 'News Reversal XAUUSD', description: 'High Impact News Reversal Strategy', status: 'active', enabled: true, config: {} }
  ];

  const supabase = getSupabaseClient().getClient();
  if (!supabase) return NextResponse.json({ error: 'No supabase client' });

  for (const strat of defaultStrategies) {
    await supabase.from('strategies').upsert(strat, { onConflict: 'id' });
  }
  return NextResponse.json({ success: true });
}
