import { NextResponse } from 'next/server';
import { ApiResponse, StateName } from '@/types';
import { getSupabaseClient } from '@/lib/supabase/client';
import { STRATEGY_FLOWS } from '@/lib/trading-engine/state-machine';

import { RuleEngine } from '@/lib/trading-engine/rule-engine';
import { Strategy1_SMCLondon } from '@/lib/trading-engine/strategies/strategy-1-smc-london';
import { Strategy2_SndEngulfing } from '@/lib/trading-engine/strategies/strategy-2-snd-engulfing';
import { Strategy3_ScalpingSMC } from '@/lib/trading-engine/strategies/strategy-3-scalping-smc';
import { Strategy4_NewsReversal } from '@/lib/trading-engine/strategies/strategy-4-news-reversal';

export const dynamic = "force-dynamic";

export async function GET() {
  let strategies: any[] = [];
  let success = false;
  let error = null;
  try {
    const metadataEngine = new RuleEngine();
    const defaultStrategies = [
      new Strategy1_SMCLondon(metadataEngine),
      new Strategy2_SndEngulfing(metadataEngine),
      new Strategy3_ScalpingSMC(metadataEngine),
      new Strategy4_NewsReversal(metadataEngine)
    ].map(s => ({
      id: s.id,
      name: s.name,
      description: s.name,
      status: 'not configured',
      parameters: {},
      enabled: false,
    }));

    const strategiesRes = await getSupabaseClient().getStrategies();
    
    if (!Array.isArray(strategiesRes)) {
       strategies = defaultStrategies.map(s => ({ ...s, status: 'not configured' }));
    } else {
       // Merge DB strategies with default ones
       strategies = [...defaultStrategies];
       for (const dbStrat of strategiesRes) {
         const index = strategies.findIndex(s => s.id === dbStrat.id);
         if (index >= 0) {
           strategies[index] = { ...strategies[index], ...dbStrat, status: dbStrat.status };
         } else {
           strategies.push(dbStrat);
         }
       }
    }

    // Attach their latest states from the state machine DB table
    const statePromises = strategies.map(strategy =>
        getSupabaseClient().getStrategyState(strategy.id).catch(() => null)
    );
    const states = await Promise.all(statePromises);

    for (let i = 0; i < strategies.length; i++) {
        try {
            const state = states[i];
            const strategyId = strategies[i].id;
            const flow = STRATEGY_FLOWS[strategyId] || ['IDLE'];

            if (state) {
                const currentStateName = state.state_name as StateName;
                const currentIndex = flow.indexOf(currentStateName);

                strategies[i].steps = flow.map((stepName, idx) => {
                    let status = 'awaiting';
                    if (idx < currentIndex) {
                        status = 'approved';
                    } else if (idx === currentIndex) {
                        status = state.state_status || 'active'; // can be 'active', 'rejected', 'expired' etc
                    }
                    return { name: stepName, status };
                });

                strategies[i].context = state.payload_json?.context || {};
                strategies[i].ruleResults = state.payload_json?.ruleResults || {};
                strategies[i].signalKey = state.signal_key;
                strategies[i].updatedAt = state.updated_at || state.created_at;
                strategies[i].timeframe = state.timeframe || state.payload_json?.context?.timeframe || null;
                strategies[i].session = state.payload_json?.context?.session || null;
                strategies[i].marketBias = state.payload_json?.context?.direction || null;
                strategies[i].aiDecision = state.payload_json?.context?.aiDecision || null;
                strategies[i].suppression = state.state_status === 'suppressed';
                
                // compute freshness
                const now = new Date().getTime();
                const lastUpdated = new Date(strategies[i].updatedAt).getTime();
                const diffMin = (now - lastUpdated) / 60000;
                strategies[i].freshness = diffMin < 5 ? 'live' : diffMin < 15 ? 'cached' : 'stale';

            } else {
                strategies[i].steps = flow.map((stepName, idx) => ({
                    name: stepName,
                    status: idx === 0 ? 'active' : 'awaiting'
                }));
                strategies[i].context = {};
                strategies[i].ruleResults = {};
            }
        } catch (e) {
             strategies[i].steps = [{ name: 'IDLE', status: 'active' }];
        }
    }
    
    success = true;
  } catch (err: any) {
    error = { code: 'DB_ERROR', message: err.message };
  }

  const response: ApiResponse<any> = {
    success,
    data: strategies,
    error,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  return NextResponse.json(response);
}
