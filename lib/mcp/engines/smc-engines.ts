import { Candle } from '@/types';
import { 
    findPivots, findFVGs, findOrderBlocks, detectMSS, 
    determineRange, calculateSMA, calculateRSI, detectEqualHighLow, 
    detectRejectionBlock, detectKillzone, detectSessionBias,
    findBreakerBlocks, findMitigationBlocks, analyzeStructure
} from '../../trading-engine/indicators';

export class LiquidityMapEngine {
    static evaluate(candles: Candle[]) {
        return findPivots(candles, 10, 10);
    }
}

export class ImbalanceEngine {
    static evaluate(candles: Candle[]) {
        return findFVGs(candles);
    }
}

export class SupplyDemandEngine {
    static evaluate(candles: Candle[]) {
        return findOrderBlocks(candles);
    }
}

export class MSSEngine {
    static evaluate(candles: Candle[]) {
        return detectMSS(candles);
    }
}

export class RangeEngine {
    static evaluate(candles: Candle[]) {
        return determineRange(candles);
    }
}

export class RSIEngine {
    static evaluate(candles: Candle[], period: number = 14) {
        return calculateRSI(candles, period);
    }
}

export class MAEngine {
    static evaluate(candles: Candle[], period: number) {
        return calculateSMA(candles, period);
    }
}

export class EqualHighLowEngine {
    static evaluate(candles: Candle[]) {
        return detectEqualHighLow(candles);
    }
}

export class BreakerBlockEngine {
    static evaluate(candles: Candle[]) {
        return findBreakerBlocks(candles);
    }
}

export class MitigationBlockEngine {
    static evaluate(candles: Candle[]) {
        return findMitigationBlocks(candles);
    }
}

export class RejectionBlockEngine {
    static evaluate(candles: Candle[]) {
        return detectRejectionBlock(candles);
    }
}

export class InternalStructureEngine {
    static evaluate(candles: Candle[]) {
        // Lower timeframe equivalent / smaller pivot window
        return analyzeStructure(candles, 3, 3);
    }
}

export class ExternalStructureEngine {
    static evaluate(candles: Candle[]) {
        // Higher timeframe equivalent / larger pivot window
        return analyzeStructure(candles, 15, 15);
    }
}

export class KillzoneEngine {
    static evaluate(timestamp: string) {
        return detectKillzone(timestamp);
    }
}

export class SessionBiasEngine {
    static evaluate(candles: Candle[], timestamp: string) {
        return detectSessionBias(candles, timestamp);
    }
}
