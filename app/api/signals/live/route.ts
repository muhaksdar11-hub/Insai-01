import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';
import { getSupabaseClient } from '@/lib/supabase/client';

export const dynamic = "force-dynamic";

export async function GET() {
  let formattedData: any[] = [];
  let success = false;
  let error: { code: string; message: string; } | null = null;

  try {
    const data = await getSupabaseClient().getActiveSignals();
    
    if (!Array.isArray(data)) {
      if (data.status === 'not_configured') {
         return NextResponse.json({
            success: true,
            data: [],
            meta: { ...data }
         });
      }
      throw new Error(data.reason || 'Failed to fetch active signals');
    }

    // Fetch strategies to map ID to Name
    const strategies = await getSupabaseClient().getStrategies();
    const strategyMap = new Map();
    if (Array.isArray(strategies)) {
        strategies.forEach(s => strategyMap.set(s.id, s.name));
    }

    // Fetch latest market snapshot for XAUUSD to calculate pips
    let latestPrice = 0;
    const supabase = getSupabaseClient().getClient();
    if (getSupabaseClient().isConnected() && supabase) {
        const { data: snapshot } = await supabase
            .from('market_snapshots')
            .select('close, price_live, timestamp')
            .eq('symbol', 'XAUUSD')
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();
        if (snapshot) {
            latestPrice = snapshot.price_live || snapshot.close || 0;
        }
    }

    // Map DB schema to UI expected format
    formattedData = data.map((signal: any) => {
      // Calculate age based on created_at
      const createdDate = new Date(signal.created_at);
      const now = new Date();
      const diffMs = Math.max(0, now.getTime() - createdDate.getTime());
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const age = diffHours > 0 
        ? `${diffHours}h ${diffMins % 60}m ago` 
        : `${diffMins}m ago`;

      // Freshness
      const freshness = diffMins < 5 ? 'live' : diffMins < 15 ? 'cached' : 'stale';

      // Pips calculation (standard XAUUSD 1 pip = 0.1)
      let runningPips = 0;
      if (latestPrice > 0 && signal.entry_price) {
          const diff = latestPrice - signal.entry_price;
          if (signal.direction === 'LONG' || signal.direction === 'buy') {
              runningPips = diff * 10; // XAUUSD pip multiplier
          } else if (signal.direction === 'SHORT' || signal.direction === 'sell') {
              runningPips = -diff * 10;
          }
      }

      // Check current TP/SL hit
      let statusExt = signal.status;
      if (latestPrice > 0 && signal.entry_price) {
          if ((signal.direction === 'LONG' || signal.direction === 'buy') && latestPrice <= signal.sl_price) statusExt = 'SL HIT';
          else if ((signal.direction === 'SHORT' || signal.direction === 'sell') && latestPrice >= signal.sl_price) statusExt = 'SL HIT';
          else if (signal.tp3_price && ((signal.direction === 'LONG' || signal.direction === 'buy') ? latestPrice >= signal.tp3_price : latestPrice <= signal.tp3_price)) statusExt = 'TP3 HIT';
          else if (signal.tp2_price && ((signal.direction === 'LONG' || signal.direction === 'buy') ? latestPrice >= signal.tp2_price : latestPrice <= signal.tp2_price)) statusExt = 'TP2 HIT';
          else if (signal.tp1_price && ((signal.direction === 'LONG' || signal.direction === 'buy') ? latestPrice >= signal.tp1_price : latestPrice <= signal.tp1_price)) statusExt = 'TP1 HIT';
      }

      // Extract aiChecklist from signal_evidence
      const aiChecklist = (signal.signal_evidence || [])
        .filter((e: any) => e.engine_name === 'validation_pipeline' && e.evidence_type === 'checklist_item')
        .map((e: any) => ({
           rule: e.details?.rule || e.reason,
           status: e.passed ? 'PASS' : 'FAIL',
           reason: e.reason,
           evidence: e.details?.evidence
        }));

      // Extract aiReview
      const aiReviewEvidence = (signal.signal_evidence || []).find((e: any) => e.engine_name === 'ai_validation' && e.evidence_type === 'ai_review');
      const aiReview = aiReviewEvidence ? aiReviewEvidence.details : null;

      return {
        id: signal.id,
        signalKey: signal.signal_key,
        direction: (signal.direction || '').toUpperCase(),
        pair: signal.symbol || 'XAUUSD',
        strategyName: strategyMap.get(signal.strategy_id) || signal.strategy_id || 'Strategy',
        status: statusExt,
        baseStatus: signal.status,
        age: age,
        entry: signal.entry_price || 0,
        sl: signal.sl_price || 0,
        tp1: signal.tp1_price || 0,
        tp2: signal.tp2_price || null,
        tp3: signal.tp3_price || null,
        aiReasoning: signal.ai_reasoning || "No reasoning provided by AI.",
        aiChecklist,
        aiEvidence: aiReview?.evidence,
        aiRulesChecked: aiReview?.rulesChecked,
        aiRulesPassed: aiReview?.rulesPassed,
        aiRulesFailed: aiReview?.rulesFailed,
        aiConflicts: aiReview?.conflicts,
        probabilities: aiReview?.probabilities || null,
        confidenceScore: aiReview?.confidenceScore || null,
        marketConfidence: aiReview?.marketConfidence || null,
        dataQualityScore: aiReview?.dataQualityScore || null,
        signalQualityScore: aiReview?.signalQualityScore || null,
        pips: Math.round(runningPips),
        freshness: freshness,
        createdAt: signal.created_at
      };
    });
    
    success = true;
  } catch (err: any) {
    error = {
      code: 'DB_ERROR',
      message: err.message || 'Failed to fetch active signals'
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
