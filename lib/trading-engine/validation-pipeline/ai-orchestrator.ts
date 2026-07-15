import { GoogleGenAI, Type, Schema } from '@google/genai';
import { AIDecision, AIChecklistItem, RuleResult } from '@/types';
import { StrategyState } from '../state-machine';
import { logger } from '../../utils/logger';
import { getProviderRegistry } from '../../market-data/provider-registry';
import { getEnv } from '../../utils/env';
import { getSupabaseClient } from '../../supabase/client';

import { ALL_VALIDATORS, ValidatorResult } from './validators';

export interface AIValidationDecision {
  decision: AIDecision;
  evidence: string;
  reasoning: string;
  rulesChecked: string[];
  rulesPassed: string[];
  rulesFailed: string[];
  conflicts: string;
  probabilities?: {
    institutionalAccumulation: number;
    institutionalDistribution: number;
    liquiditySweep: number;
    continuationProbability: number;
    reversalProbability: number;
    genuineBreakout: number;
    fakeBreakout: number;
    newsIntervention: number;
  };
  confidenceScore?: number;
  marketConfidence?: number;
  dataQualityScore?: number;
  signalQualityScore?: number;
  scoringEngineData?: any;
}

export interface ValidationPipelineResult {
  strategyName: string;
  decision: AIDecision;
  reasoning: string;
  evidence?: string;
  checklist: AIChecklistItem[];
  riskNotes: string;
  missingFactors: string[];
  recommendedAction: string;
  aiReview?: AIValidationDecision;
  scores?: any;
}

const STRATEGY_VALIDATORS: Record<string, string[]> = {
  'strategy-1-smc': ['Trend Validator', 'Session Validator', 'Liquidity Sweep Validator', 'CHOCH Validator', 'Fair Value Gap Validator', 'Risk Validator'],
  'strategy-2-snd': ['Trend Validator', 'Order Block Validator', 'Liquidity Sweep Validator', 'Risk Validator'], 
  'strategy-3-scalping': ['Trend Validator', 'Liquidity Sweep Validator', 'Risk Validator'],
  'strategy-4-news': ['News Validator', 'Liquidity Sweep Validator', 'Market Structure Validator', 'Risk Validator'],
};

export class AIValidationOrchestrator {
  private ai: GoogleGenAI | null = null;
  private cache = new Map<string, ValidationPipelineResult>();
  private readonly CACHE_TTL = 5 * 60 * 1000;

  private get isConfigured(): boolean {
    return !!getEnv('GEMINI_API_KEY');
  }

  private getAiClient(): GoogleGenAI | null {
    if (this.ai) return this.ai;
    const apiKey = getEnv('GEMINI_API_KEY');
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
      return this.ai;
    }
    return null;
  }

  public async runPipeline(
    strategyId: string,
    state: StrategyState,
    ruleResults: Record<string, RuleResult>,
    marketContext: any
  ): Promise<ValidationPipelineResult> {
    
    const startTime = performance.now();
    
    // 1. Kumpulkan hasil semua validator independen dan prioritaskan rule kritikal
    const activeValidators = [...STRATEGY_VALIDATORS[strategyId] || ['Trend Validator', 'Risk Validator']];
    
    // Sort: Critical rules first for faster early exit
    activeValidators.sort((a, b) => {
       const vA = ALL_VALIDATORS[a];
       const vB = ALL_VALIDATORS[b];
       if (vA?.isCritical && !vB?.isCritical) return -1;
       if (!vA?.isCritical && vB?.isCritical) return 1;
       return 0;
    });

    const validatorResults: ValidatorResult[] = [];
    let criticalFail = false;
    let failedRules: string[] = [];
    
    for (const vName of activeValidators) {
      const validator = ALL_VALIDATORS[vName];
      if (validator) {
         const res = validator.validate(ruleResults, marketContext);
         validatorResults.push(res);
         if (res.status === 'FAIL') {
             failedRules.push(res.rule);
             if (res.isCritical) {
                 criticalFail = true;
                 break; // EARLY EXIT: Stop processing other rules to save CPU
             }
         }
      } else {
         validatorResults.push({ rule: vName, status: 'WAIT', reason: 'Validator not implemented', evidence: '', isCritical: false });
      }
    }

    // 2. Menghentikan validasi lebih awal jika rule kritikal gagal (early exit)
    if (criticalFail) {
      const endTime = performance.now();
      logger.warn(`Early exit triggered for ${strategyId}: ${failedRules.join(', ')} failed. Evaluated in ${(endTime - startTime).toFixed(2)}ms`);
      return {
        strategyName: strategyId,
        decision: 'REJECTED',
        reasoning: `Early exit: critical rules failed (${failedRules.join(', ')}).`,
        evidence: 'Critical failure detected in rule engine.',
        checklist: validatorResults,
        riskNotes: 'Rule Engine invalidated the setup early.',
        missingFactors: [],
        recommendedAction: 'wait'
      };
    }

    // 3. Deteksi Konflik (AI akan membantu memvalidasi rule engine hasil ini)
    const candles = marketContext?.candles || marketContext?.marketData?.candles || [];
    const latestCandle = candles[candles.length - 1];
    const timestamp = latestCandle?.timestamp || 'unknown';
    const cacheKey = `${strategyId}-${timestamp}-${state.stateName}`;
    
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const passedCount = validatorResults.filter(v => v.status === 'PASS').length;
    const totalCount = activeValidators.length;
    const realScore = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
    const setupScores = { totalScore: realScore };

    // Check Python Engine Health First
    try {
        const { PythonEngineManager } = await import('../../mcp/engines/deployment');
        const pyHealth = await PythonEngineManager.evaluate();
        if (pyHealth.status !== 'active') {
             const waits = validatorResults.filter(v => v.status === 'WAIT').map(v => v.rule);
             return {
                strategyName: strategyId,
                decision: 'WAIT',
                checklist: validatorResults,
                reasoning: `Python Engine OFFLINE: ${pyHealth.message}. Waiting for Python Engine.`,
                evidence: 'System degraded. AI request blocked.',
                riskNotes: 'Python Engine Offline',
                missingFactors: ['Python Engine', ...waits],
                recommendedAction: 'wait',
                scores: setupScores
             };
        } else {
             // Python Engine is online, perform quantitative validation
             const defaultPyPort = process.env.PYTHON_PORT || '8181';
             const pyUrl = getEnv("PYTHON_ENGINE_URL") || `http://127.0.0.1:${defaultPyPort}`;
             
             // Build request payload
             const entryPrice = ruleResults['Entry Validator']?.evidence?.price || (candles && candles[candles.length-1]?.close) || 0;
             const slPrice = ruleResults['Risk Validator']?.evidence?.sl || 0;
             const tpPrice = ruleResults['Risk Validator']?.evidence?.tp1 || 0;
             const direction = (state as any).payload?.direction === 'sell' || state.stateName.includes('SHORT') ? 'SHORT' : 'LONG';

             if (candles && candles.length >= 30) {
                 const reqPayload = {
                     symbol: 'XAUUSD',
                     timeframe: 'M15', // Fallback, could be dynamic
                     direction: direction,
                     entry_price: entryPrice,
                     sl_price: slPrice,
                     tp_price: tpPrice,
                     candles: candles,
                     strategy_id: strategyId
                 };

                 try {
                     const controller = new AbortController();
                     const timeout = setTimeout(() => controller.abort(), 5000);
                     const pyRes = await fetch(`${pyUrl}/validate`, {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify(reqPayload),
                         signal: controller.signal
                     });
                     clearTimeout(timeout);
                     if (pyRes.ok) {
                         const pyData = await pyRes.json();
                         
                         validatorResults.push({
                             rule: 'Python Quant Engine',
                             status: pyData.decision === 'APPROVED' ? 'PASS' : (pyData.decision === 'WAIT' ? 'WAIT' : 'FAIL'),
                             reason: pyData.reasons.join(', '),
                             evidence: JSON.stringify(pyData.metrics),
                             isCritical: false
                         });
                     } else {
                         logger.warn(`Python Engine /validate returned ${pyRes.status}`);
                     }
                 } catch (e: any) {
                     logger.warn(`Python Engine /validate failed: ${e.message}`);
                 }
             } else {
                 logger.warn('Insufficient candles for python validation (< 30)');
             }
        }
    } catch (e: any) {
         logger.warn('Failed to check python engine status', e.message);
    }

    const aiClient = this.getAiClient();
    
    if (!this.isConfigured || !aiClient) {
       return {
          strategyName: strategyId,
          decision: 'FAILED',
          checklist: validatorResults,
          reasoning: 'AI Service is not configured (Missing API Key). Cannot validate signal.',
          evidence: 'System degraded. AI validation bypassed and rejected.',
          riskNotes: 'AI Offline - Blocked',
          missingFactors: ['AI Validation'],
          recommendedAction: 'block',
          scores: setupScores
       };
    }

    try {
      // 4. AI Validates the Rule Engine outputs
      // Optimize prompt size by excluding raw evidence JSON which can be large
      const simplifiedResults = validatorResults.map(r => ({ rule: r.rule, status: r.status, reason: r.reason, isCritical: r.isCritical }));
      
      
      // --- RAG IMPLEMENTATION ---
      let similarHistoryText = "No historical context available.";
      try {
          const stateSummary = `Strategy: ${strategyId}, Timeframe: ${marketContext?.marketData?.timeframe || 'Unknown'}, Symbol: ${marketContext?.marketData?.symbol || 'Unknown'}, Rules: ${simplifiedResults.map(r => r.rule + "=" + r.status).join(',')}`;
          
          const embedRes = await aiClient.models.embedContent({
              model: 'text-embedding-004',
              contents: stateSummary
          });
          
          const embedding = embedRes.embeddings?.[0]?.values;
          
          if (embedding && embedding.length > 0) {
              const supabase = getSupabaseClient();
              const similarSignals = await supabase.findSimilarHistory(embedding, 0.7, 5);
              if (similarSignals && similarSignals.length > 0) {
                  const winCount = similarSignals.filter((s: any) => s.outcome === 'WIN').length;
                  const lossCount = similarSignals.filter((s: any) => s.outcome === 'LOSS').length;
                  similarHistoryText = `Found ${similarSignals.length} similar historical signals (Win: ${winCount}, Loss: ${lossCount}). ` +
                     similarSignals.map((s: any) => `[${s.outcome}] Pips: ${s.pips_result || 0} | Strategy: ${s.strategy_id} | Similarity: ${(s.similarity * 100).toFixed(1)}%`).join('\n');
              }
          }
      } catch (e: any) {
          logger.warn('Failed to retrieve RAG context', { error: e.message });
      }
      // --------------------------

      let prompt = `INSAI Analyst. Strategi: ${strategyId} | State: ${state.stateName}.
TUGAS: Anda adalah Validator AI yang bertugas sebagai penilai probabilistik, BUKAN sekadar pengambil keputusan final.

MARKET CONTEXT (Korelasi & Makro):
- DXY: ${JSON.stringify(marketContext?.marketData?.correlations?.dxy || 'Not available')}
- US10Y: ${JSON.stringify(marketContext?.marketData?.correlations?.us10y || 'Not available')}
- COT Data: ${JSON.stringify(marketContext?.marketData?.correlations?.cotData || 'Not available')}
- News/Calendar: ${marketContext?.marketData?.calendar ? 'Active events detected' : 'No major events'}
- Historical Similarity (RAG):
${similarHistoryText}

Analisis bukti dari Scoring Engine dan konteks makro di atas. Berikan probabilitas (0-100) untuk:
- Institution Accumulation Probability (institutionalAccumulation)
- Institution Distribution Probability (institutionalDistribution)
- Liquidity Sweep Probability (liquiditySweep)
- Continuation Probability (continuationProbability)
- Reversal Probability (reversalProbability)
- Breakout Probability (genuineBreakout)
- Fake Breakout Probability (fakeBreakout)
- News Probability (newsIntervention)
Dan berikan:
- Confidence Score keseluruhan (0-100)
- Market Confidence (0-100)
- Data Quality Score (0-100)
- Signal Quality Score (0-100)

Sertakan alasan (reasoning) kuat berbasis data (evidence) untuk keputusan Anda.
VALIDATOR RULES RESULTS: ${JSON.stringify(simplifiedResults)}`;

      const responseSchema: Schema = {
        type: Type.OBJECT,
        properties: {
          decision: { type: Type.STRING, enum: ['APPROVED', 'REJECTED', 'WAIT', 'INVALIDATED'] },
          evidence: { type: Type.STRING },
          reasoning: { type: Type.STRING },
          rulesChecked: { type: Type.ARRAY, items: { type: Type.STRING } },
          rulesPassed: { type: Type.ARRAY, items: { type: Type.STRING } },
          rulesFailed: { type: Type.ARRAY, items: { type: Type.STRING } },
          conflicts: { type: Type.STRING },
          probabilities: {
            type: Type.OBJECT,
            properties: {
              institutionalAccumulation: { type: Type.NUMBER },
              institutionalDistribution: { type: Type.NUMBER },
              liquiditySweep: { type: Type.NUMBER },
              continuationProbability: { type: Type.NUMBER },
              reversalProbability: { type: Type.NUMBER },
              genuineBreakout: { type: Type.NUMBER },
              fakeBreakout: { type: Type.NUMBER },
              newsIntervention: { type: Type.NUMBER }
            }
          },
          confidenceScore: { type: Type.NUMBER },
          marketConfidence: { type: Type.NUMBER },
          dataQualityScore: { type: Type.NUMBER },
          signalQualityScore: { type: Type.NUMBER }
        },
        required: ['decision', 'evidence', 'reasoning', 'rulesChecked', 'rulesPassed', 'rulesFailed', 'probabilities', 'confidenceScore', 'marketConfidence', 'dataQualityScore', 'signalQualityScore']
      };

      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: 0,
        },
      });

      const text = response.text;
      if (!text) throw new Error('No response from Gemini API');
      
      const parsed = JSON.parse(text) as AIValidationDecision;
      const aiDecision = parsed.decision;
      
      const finalChecklist = validatorResults;
      
      const result: ValidationPipelineResult = {
        strategyName: strategyId,
        decision: aiDecision,
        checklist: finalChecklist,
        reasoning: parsed.reasoning + (parsed.conflicts ? ` [Conflicts: ${parsed.conflicts}]` : ''),
        evidence: parsed.evidence,
        riskNotes: finalChecklist.find(c => c.rule === 'Risk Validator')?.reason || 'OK',
        missingFactors: finalChecklist.filter(c => c.status === 'WAIT').map(c => c.rule),
        recommendedAction: aiDecision === 'APPROVED' ? 'allow_signal' : 'wait',
        aiReview: { ...parsed, scoringEngineData: setupScores },
        scores: setupScores
      };

      const endTime = performance.now();
      logger.info(`AI Validation Orchestrator completed for ${strategyId} in ${(endTime - startTime).toFixed(2)}ms`);

      this.cache.set(cacheKey, result);
      setTimeout(() => this.cache.delete(cacheKey), this.CACHE_TTL);

      return result;
    } catch (error: any) {
      const endTime = performance.now();
      logger.error(`AI Validation Orchestrator failed for ${strategyId} after ${(endTime - startTime).toFixed(2)}ms: ` + error.message);
      getProviderRegistry().reportError('GeminiAI', error.message);

      return {
        strategyName: strategyId,
        decision: 'FAILED',
        checklist: validatorResults,
        reasoning: 'AI Error: ' + error.message,
        evidence: 'Error connecting to AI validation.',
        riskNotes: 'Error',
        missingFactors: ['AI Validation'],
        recommendedAction: 'block',
        scores: setupScores
      };
    }
  }
}
