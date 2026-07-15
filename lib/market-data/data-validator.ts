import { Candle } from '@/types';

export interface DataValidationResult {
  isValid: boolean;
  reason?: string;
  metrics?: {
    totalCandles: number;
    missingCandles: number;
    gaps: number;
    outliers: number;
  };
}

export class DataValidator {
  
  public validateCandles(candles: Candle[], _symbol: string, timeframe: string): DataValidationResult {
    if (!candles || candles.length === 0) {
      return { isValid: false, reason: 'Empty candle array' };
    }

    let missingCandles = 0;
    let gaps = 0;
    let outliers = 0;

    const timestamps = new Set<number>();
    
    // Sort candles by timestamp ascending
    const sortedCandles = [...candles].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const timeframeMs = this.getTimeframeMs(timeframe);

    for (let i = 0; i < sortedCandles.length; i++) {
      const candle = sortedCandles[i];
      const candleTime = new Date(candle.timestamp).getTime();
      
      // 1. OHLC Integrity
      if (candle.high < candle.low) {
        return { isValid: false, reason: `OHLC Integrity Error: High < Low at ${candle.timestamp}` };
      }
      if (candle.high < candle.open || candle.high < candle.close) {
         return { isValid: false, reason: `OHLC Integrity Error: High is not the maximum at ${candle.timestamp}` };
      }
      if (candle.low > candle.open || candle.low > candle.close) {
        return { isValid: false, reason: `OHLC Integrity Error: Low is not the minimum at ${candle.timestamp}` };
      }

      // 2. Invalid Volume
      if (candle.volume < 0) {
        return { isValid: false, reason: `Invalid Volume: Volume < 0 at ${candle.timestamp}` };
      }

      // 3. Duplicate Candles
      if (timestamps.has(candleTime)) {
        return { isValid: false, reason: `Duplicate Candle: Timestamp ${candle.timestamp} duplicated` };
      }
      timestamps.add(candleTime);

      if (i > 0) {
        const prevCandle = sortedCandles[i - 1];
        const prevTime = new Date(prevCandle.timestamp).getTime();
        
        // 4. Timestamp continuity & Data Gap & Missing Candles
        const diffMs = candleTime - prevTime;
        if (diffMs <= 0) {
           return { isValid: false, reason: `Timestamp Continuity Error: Current timestamp <= previous at ${candle.timestamp}` };
        }
        
        if (timeframeMs > 0 && diffMs > timeframeMs) {
           const missed = Math.floor(diffMs / timeframeMs) - 1;
           // In real market there are weekend gaps. We allow large gaps but we record them.
           // Let's flag extreme gaps over 3 days as error unless it's normal weekend.
           // For simplicity, we just count gaps. If gap is > 4 days (345600000 ms), we flag error.
           if (diffMs > 345600000) {
             return { isValid: false, reason: `Data Gap Error: Gap too large (${diffMs}ms) at ${candle.timestamp}` };
           }
           missingCandles += missed;
           gaps++;
        }

        // 5. Outlier Harga (Price jumps)
        // e.g. price jumps more than 5% in a single candle for Gold is extremely suspicious
        const priceChangePct = Math.abs((candle.open - prevCandle.close) / prevCandle.close);
        if (priceChangePct > 0.05) { // 5% jump
          outliers++;
          // Can either flag as invalid or just count it. Let's flag as invalid if jump > 10%
          if (priceChangePct > 0.1) {
            return { isValid: false, reason: `Price Outlier Error: Jump > 10% at ${candle.timestamp}` };
          }
        }
      }
    }

    // 6. Kualitas Feed
    // If too many missing candles or gaps, reject
    if (gaps > (sortedCandles.length * 0.1)) { // more than 10% gaps
       return { isValid: false, reason: `Feed Quality Error: Too many gaps (${gaps})` };
    }

    return { 
      isValid: true,
      metrics: {
        totalCandles: sortedCandles.length,
        missingCandles,
        gaps,
        outliers
      }
    };
  }

  public validateSpread(bid: number, ask: number, maxSpreadAllowed: number = 2.0): DataValidationResult { // 20 pips default
    const spread = ask - bid;
    if (spread < 0) {
      return { isValid: false, reason: 'Invalid Spread: Ask < Bid' };
    }
    if (spread > maxSpreadAllowed) {
      return { isValid: false, reason: `Extreme Spread: ${spread.toFixed(2)} > ${maxSpreadAllowed}` };
    }
    return { isValid: true };
  }

  private getTimeframeMs(timeframe: string): number {
    const match = timeframe.match(/^(MN|M|H|D|W)(\d+)?$/i);
    if (!match) return 0;
    
    const unit = match[1].toUpperCase();
    const val = parseInt(match[2] || '1');
    
    switch (unit) {
      case 'M': return val * 60000;
      case 'H': return val * 3600000;
      case 'D': return val * 86400000;
      case 'W': return val * 604800000;
      case 'MN': return val * 2592000000; // approximate
      default: return 0;
    }
  }
}

export const dataValidator = new DataValidator();
