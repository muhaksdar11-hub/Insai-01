import { NextResponse } from 'next/server';
import { ApiResponse, StateName } from '@/types';
import { getSupabaseClient } from '@/lib/supabase/client';
import { STRATEGY_FLOWS } from '@/lib/trading-engine/state-machine';
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export async function GET() {
  let strategies: any[] = [];
  let success = false;
  let error = null;
  try {
    const defaultStrategies = [
      { id: 'strategy-1-smc', name: 'SMC London Killzone' },
      { id: 'strategy-2-snd', name: 'SnD Engulfing Confirmation' },
      { id: 'strategy-3-scalping', name: 'M1/M5 SMC Scalping' },
      { id: 'strategy-4-news', name: 'High Impact News Reversal' },
      { id: 'strategy-5-smc-sd-confluence', name: 'SMC-SD Pattern Confluence' }
    ].map(s => ({
      id: s.id,
      name: s.name,
      description: s.name,
      status: 'active',
      parameters: {},
      enabled: true,
    }));

    const strategiesRes = await getSupabaseClient().getStrategies().catch(() => null);
    
    if (!strategiesRes || !Array.isArray(strategiesRes)) {
       strategies = defaultStrategies;
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
                let currentIndex = flow.indexOf(currentStateName);
                
                // If the state is a terminal state not in the flow (like REJECTED),
                // we should find the step it failed at, or just mark the flow appropriately.
                const isRejected = currentStateName === 'REJECTED' || currentStateName === 'EXPIRED' || currentStateName === 'SUPPRESSED';
                if (isRejected) {
                    // It failed. We can't know the exact index just from 'REJECTED' unless we check reason or last state.
                    // Let's just make the first step 'rejected' so the user knows it failed, 
                    // or better, if the UI doesn't know the step, show it on the first step.
                    // Wait, we can get the actual index by checking which step was last active? 
                    // Since we don't have it in this simple query, let's just set the last status.
                }

                strategies[i].steps = flow.map((stepName, idx) => {
                    let status = 'awaiting';
                    if (isRejected) {
                       if (idx < currentIndex) status = 'approved';
                       else if (idx === currentIndex) status = state.state_status || 'rejected';
                       else status = 'awaiting';
                    } else {
                       if (idx < currentIndex) {
                           status = 'approved';
                       } else if (idx === currentIndex) {
                           status = state.state_status || 'active'; // can be 'active', 'rejected', 'expired' etc
                       }
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
