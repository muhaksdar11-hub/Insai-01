import { getStrategyDefinition } from "./strategy-registry";
import { RuleEngine, RuleEvaluationContext } from './rule-engine';
import { SetupDetector, SetupLifecycleError } from './setup-detector';
import { SignalPipeline } from './signal-pipeline';
import { logger } from '../utils/logger';
import { AIValidationOrchestrator } from './validation-pipeline/ai-orchestrator';
import { MarketStateEngine } from './market-state-engine';
import { StateMachine } from './state-machine';
import { getMarketDataService } from '../market-data/market-data-service';
import crypto from 'crypto';

export class TradingEngine {
  private ruleEngine: RuleEngine;
  private signalPipeline: SignalPipeline;
  private setupDetector: SetupDetector;
  private aiValidator: AIValidationOrchestrator;
  private marketStateEngine: MarketStateEngine;

  // Track the timestamp of the last processed candle to avoid duplicate scans on the same data
  private lastProcessedTimestamp: Record<string, string> = {};

  constructor() {
    this.ruleEngine = new RuleEngine();
    this.signalPipeline = new SignalPipeline();
    this.setupDetector = new SetupDetector();
    this.aiValidator = new AIValidationOrchestrator();
    this.marketStateEngine = new MarketStateEngine(this.ruleEngine);
  }

  public async init() {
    logger.info('Initializing Trading Engine with Deterministic Setup Detector and AI Validator...');
  }

  public async processMarketData(symbol: string, timeframe: string, contextData: any) {
    const candles = contextData.candles || [];
    if (!candles || candles.length === 0) return;
    
    const latestCandle = candles[candles.length - 1];
    const dataKey = `${symbol}_${timeframe}`;
    
    // Deterministic gate: only process if we have new data
    if (this.lastProcessedTimestamp[dataKey] === latestCandle.timestamp) {
       return;
    }
    this.lastProcessedTimestamp[dataKey] = latestCandle.timestamp;

    logger.info(`Running deterministic setup detection for ${symbol} at ${latestCandle.timestamp}`);
    
    const context: RuleEvaluationContext = {
      symbol,
      timeframe,
      timestamp: latestCandle.timestamp,
      marketData: contextData,
      indicators: contextData.indicators || {},
      candles: contextData.candles,
      correlationId: contextData.correlationId || crypto.randomUUID()
    };

    await this.runDetectionCycle(context);
  }

  private async syncState(strategyId: string, stateName: string, status: string, reason: string, signalKey: string | null = null, payload: any = {}) {
     try {
         const { getSupabaseClient } = await import('../supabase/client');
         await getSupabaseClient().insertStrategyState({
             strategy_id: strategyId,
             state_name: stateName,
             state_status: status,
             reason: reason,
             signal_key: signalKey || undefined,
             payload_json: payload,
             timeframe: payload?.context?.timeframe
         });
     } catch (e: any) {
         logger.error(`Failed to sync state ${stateName} for ${strategyId}: ${e.message}`);
     }
  }

  private async advanceStateMachine(sm: StateMachine, newState: any, reason: string, setupId: string, payload: any) {
      try {
         const result = sm.transition(newState, reason, setupId, payload);
         await this.syncState(sm.lastTransitionState!.strategyId, newState, result.currentStatus, reason, setupId, payload);
      } catch (e: any) {
         logger.error(`State machine transition error: ${e.message}`);
      }
  }

  private async runDetectionCycle(context: RuleEvaluationContext) {
    // 1. Market State Classification
    const marketStates = this.marketStateEngine.classifyState(context);
    logger.info(`Market States detected: ${marketStates.join(', ')}`);
    
    // 2. Select Relevant Strategies
    const activeStrategies = this.marketStateEngine.getRelevantStrategies(marketStates);
    logger.info(`Relevant Strategies based on market state: ${activeStrategies.join(', ')}`);

    if (activeStrategies.length === 0) {
        logger.info('No relevant strategies for current market state.');
        return;
    }

    // Pre-calculate common rules to avoid duplicate validation across strategies
    const trend = this.ruleEngine.executeRule('rule_trend', context);
    const session = this.ruleEngine.executeRule('rule_session', context, 'all');
    const sweep = this.ruleEngine.executeRule('rule_sweep', context);
    const engulfing = this.ruleEngine.executeRule('rule_engulfing', context);
    const vol = this.ruleEngine.executeRule('rule_volatility', context);

    // Process all active strategies concurrently
    await Promise.allSettled(activeStrategies.map(async (strategyId) => {
      const sm = new StateMachine(strategyId, 'IDLE');
      
      try {
        // 1. SCANNING -> CANDIDATE
        let setup = this.setupDetector.startScanning(strategyId, context.symbol, context.timeframe, context.timestamp);
        
        // Sync IDLE (scanning start)
        await this.syncState(strategyId, 'IDLE', 'active', 'Scanning market...', setup.id, { context });

        // WAIT_SESSION / WAIT_NEWS handling
        if (sm.getNextExpectedState() === 'WAIT_SESSION' || sm.getNextExpectedState() === 'WAIT_NEWS') {
             const nextState = sm.getNextExpectedState() as any;
             if (nextState === 'WAIT_SESSION' && session.status === 'invalid') {
                 this.setupDetector.transitionState(setup.id, 'expired', 'Market session invalid');
                 await this.advanceStateMachine(sm, 'EXPIRED', 'Market session invalid', setup.id, { context });
                 return;
             }
             if (nextState === 'WAIT_NEWS' && marketStates.indexOf('NEWS_MODE' as any) === -1) {
                 this.setupDetector.transitionState(setup.id, 'expired', 'Not in news mode');
                 await this.advanceStateMachine(sm, 'EXPIRED', 'Not in news mode', setup.id, { context });
                 return;
             }
             await this.advanceStateMachine(sm, nextState, 'Session/News check passed', setup.id, { context });
        }

        // WAIT_TREND handling
        if (sm.getNextExpectedState() === 'WAIT_TREND') {
             if (trend.status === 'invalid') {
                 this.setupDetector.transitionState(setup.id, 'expired', 'Market not trending');
                 await this.advanceStateMachine(sm, 'EXPIRED', 'Market not trending', setup.id, { context });
                 return;
             }
             await this.advanceStateMachine(sm, 'WAIT_TREND', 'Trend check passed', setup.id, { context });
        }

        setup = this.setupDetector.transitionState(setup.id, 'candidate', 'Passed initial scanning filters');

        // 2. CANDIDATE -> VALIDATION (Pattern / Sweep / Structure checking)
        let isCandidateValid = false;
        let candidateRules: any = {};
        let direction: 'buy' | 'sell' | undefined = undefined;

        const stratDef = getStrategyDefinition(strategyId);
        if (stratDef) {
            const result = stratDef.extractCandidateRules(context, { sweep, engulfing, trend, vol }, this.ruleEngine);
            isCandidateValid = result.isCandidateValid;
            direction = result.direction;
            candidateRules = result.candidateRules;
        } else {
            logger.warn(`Strategy definition not found for ${strategyId}`);
            isCandidateValid = false;
        }

        const nextPatternState = sm.getNextExpectedState();
        if (nextPatternState && nextPatternState.startsWith('WAIT_')) {
             if (!isCandidateValid || !direction) {
                 this.setupDetector.transitionState(setup.id, 'expired', 'Failed candidate pattern matching or direction indeterminate');
                 await this.advanceStateMachine(sm, 'EXPIRED', 'Candidate pattern not found', setup.id, { context });
                 return;
             }
             await this.advanceStateMachine(sm, nextPatternState, 'Pattern/Structure check passed', setup.id, { context });
        }

        setup = this.setupDetector.transitionState(setup.id, 'validation', 'Passed candidate pattern matching');

        // 3. VALIDATION -> CONFIRMATION
        if (sm.getNextExpectedState() === 'WAIT_CONFIRMATION') {
            if (vol.status === 'invalid') {
               this.setupDetector.transitionState(setup.id, 'expired', 'Failed volatility validation');
               await this.advanceStateMachine(sm, 'EXPIRED', 'Volatility validation failed', setup.id, { context });
               return;
            }
            await this.advanceStateMachine(sm, 'WAIT_CONFIRMATION', 'Passed structural/volatility validation', setup.id, { context });
        }

        setup = this.setupDetector.transitionState(setup.id, 'confirmation', 'Passed structural validation');

        // 4. CONFIRMATION -> READY
        // Calculate Entry, SL, TP deterministically
        let entryPrice = context.candles![context.candles!.length - 1].close;
        const atr = (vol.evidence as any).atr || 1.5;
        const slDistance = atr * 1.5;
        
        let slPrice = direction === 'buy' ? entryPrice - slDistance : entryPrice + slDistance;
        let tpPrice = direction === 'buy' ? entryPrice + (slDistance * 2) : entryPrice - (slDistance * 2);

        // --- CUSTOM STRATEGY OVERRIDE ---
        if (strategyId === 'strategy-5-smc-sd-confluence') {
             try {
                 logger.info(`Delegating logic to Python Engine for ${strategyId}`);
                 const mds = getMarketDataService();
                 const [h1, m15, m5, m1] = await Promise.all([
                     mds.getCandles(context.symbol, 'H1', 100),
                     mds.getCandles(context.symbol, 'M15', 100),
                     mds.getCandles(context.symbol, 'M5', 100),
                     mds.getCandles(context.symbol, 'M1', 100)
                 ]);
                 const payload = {
                     H1: { candles: h1 },
                     M15: { candles: m15, atr: (vol.evidence as any).atr || 0 },
                     M5: { candles: m5 },
                     M1: { candles: m1 }
                 };
                 const pyUrl = process.env.PYTHON_ENGINE_URL || 'http://127.0.0.1:8181';
                 const pyRes = await fetch(`${pyUrl}/v1/strategy/smc-sd-confluence`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify(payload)
                 });
                 if (pyRes.ok) {
                     const pyData = await pyRes.json();
                     if (pyData.signal === 'no_signal') {
                         this.setupDetector.transitionState(setup.id, 'expired', `Python Engine: ${pyData.reasoning}`);
                         await this.advanceStateMachine(sm, 'EXPIRED', pyData.reasoning, setup.id, { context });
                         return;
                     }
                     direction = pyData.signal === 'buy' ? 'buy' : 'sell';
                     entryPrice = pyData.entry;
                     slPrice = pyData.sl;
                     tpPrice = pyData.tp1; // Use TP1 as the primary TP
                     
                     // Attach python data to candidate rules for AI verification
                     candidateRules['Python SMC-SD-Confluence'] = { status: 'valid', evidence: pyData };
                 } else {
                     throw new Error(`Python Engine returned ${pyRes.status}`);
                 }
             } catch (e: any) {
                 logger.error(`Python Engine delegation failed for ${strategyId}: ${e.message}`);
                 this.setupDetector.transitionState(setup.id, 'expired', `Python Engine Error: ${e.message}`);
                 await this.advanceStateMachine(sm, 'EXPIRED', `Python Error: ${e.message}`, setup.id, { context });
                 return;
             }
        }

        this.setupDetector.updateSetupDetails(setup.id, { direction, entryPrice, slPrice, tpPrice, marketStates });
        
        // --- AI VALIDATION INJECTION ---
        logger.info(`Triggering Scoring Engine & AI Validation for ${setup.id}`);

        const ruleResults = {
            'Trend Validator': trend,
            'Session Validator': session,
            'Volatility Validator': vol,
            'Market States': marketStates,
            ...candidateRules
        };

        const aiState = {
            stateName: 'WAIT_AI',
            payload: { direction, entryPrice, slPrice, tpPrice, marketStates }
        };
        
        await this.advanceStateMachine(sm, 'WAIT_AI', 'Waiting for AI validation...', setup.id, { context, ruleResults });
        
        const validationResult = await this.aiValidator.runPipeline(strategyId, aiState as any, ruleResults, context);

        if (validationResult.decision !== 'APPROVED') {
           logger.warn(`Setup ${setup.id} rejected by AI Validator: ${validationResult.reasoning}`);
           this.setupDetector.transitionState(setup.id, 'expired', `AI Rejected: ${validationResult.reasoning}`);
           
           await this.advanceStateMachine(sm, 'REJECTED', validationResult.reasoning, setup.id, { context, ruleResults, aiDecision: validationResult.decision });

           const suppressedSetup = { ...setup, aiValidation: validationResult, isSuppressed: true, marketStates };
           this.signalPipeline.emitSignal(suppressedSetup as any, context).catch(e => logger.error(`Failed to emit suppressed signal: ${e.message}`));
           return;
        }
        
        setup = this.setupDetector.transitionState(setup.id, 'ready', 'Setup confirmed, priced, and AI APPROVED');

        // Attach AI validation details to setup so the signal pipeline can log them
        (setup as any).aiValidation = validationResult;
        (setup as any).marketStates = marketStates;

        // 5. READY -> SIGNAL
        setup = this.setupDetector.transitionState(setup.id, 'signal', 'Signal emitted');
        
        await this.advanceStateMachine(sm, 'SIGNAL_ACTIVE', 'Signal generated successfully', setup.id, { context, ruleResults, aiDecision: validationResult.decision });

        // Save to DB via Pipeline
        logger.info(`🚨 SIGNAL GENERATED: ${setup.id} [${setup.direction?.toUpperCase()} ${setup.symbol}] Entry: ${setup.entryPrice}`);
        await this.signalPipeline.emitSignal(setup, context).catch(e => logger.error(`Failed to emit signal: ${e.message}`));

        // 6. SIGNAL -> ARCHIVED
        this.setupDetector.transitionState(setup.id, 'archived', 'Signal processing complete');
        
        await this.advanceStateMachine(sm, 'FINISHED', 'Strategy cycle complete', setup.id, { context });

      } catch (err) {
        if (err instanceof SetupLifecycleError) {
          logger.warn(`Setup lifecycle constraint: ${err.message}`);
        } else {
          logger.error(`Error processing strategy ${strategyId}: ${(err as Error).message}`);
        }
      }
    }));

    // Run audit to ensure no stuck/invalid setups
    this.setupDetector.audit();
  }
}
