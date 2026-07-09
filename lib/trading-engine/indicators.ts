import { Candle } from '@/types';
import { TradingParameters } from '../config/trading-parameters';

export function calculateATR(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period + 1) return null;
  let trSum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trSum += tr;
  }
  return trSum / period;
}

export function calculateAverageBodySize(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period) return null;
  let bodySum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    bodySum += Math.abs(candles[i].close - candles[i].open);
  }
  return bodySum / period;
}

export function calculateSMA(candles: Candle[], period: number): number | null {
  if (candles.length < period) return null;
  const slice = candles.slice(candles.length - period);
  const sum = slice.reduce((acc, c) => acc + c.close, 0);
  return sum / period;
}

export function calculateRSI(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const diff = candles[i].close - candles[i-1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  let rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Find Swing Highs and Swing Lows (Fractals)
export function findPivots(candles: Candle[], leftBar: number = 5, rightBar: number = 5) {
  const highs = [];
  const lows = [];
  for (let i = leftBar; i < candles.length - rightBar; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - leftBar; j <= i + rightBar; j++) {
      if (i === j) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: candles[i].high, time: candles[i].timestamp });
    if (isLow) lows.push({ index: i, price: candles[i].low, time: candles[i].timestamp });
  }
  return { highs, lows };
}

// FVG (Fair Value Gap)
export function findFVGs(candles: Candle[]) {
  const fvgs = [];
  const avgBody = calculateAverageBodySize(candles, 20) || 0.0001;
  
  for (let i = 20; i < candles.length - 2; i++) {
    const c1 = candles[i];
    const c2 = candles[i + 1];
    const c3 = candles[i + 2];
    
    // Displacement check: the middle candle must be a strong momentum candle
    const body2 = Math.abs(c2.close - c2.open);
    if (body2 < avgBody * 1.2) continue;
    
    const gapSizeBullish = c3.low - c1.high;
    const gapSizeBearish = c1.low - c3.high;
    const minGap = avgBody * 0.2;
    
    // Bullish FVG
    if (c2.close > c2.open && gapSizeBullish > minGap) {
      fvgs.push({ type: 'bullish', top: c3.low, bottom: c1.high, time: c2.timestamp });
    }
    // Bearish FVG
    if (c2.close < c2.open && gapSizeBearish > minGap) {
      fvgs.push({ type: 'bearish', top: c1.low, bottom: c3.high, time: c2.timestamp });
    }
  }
  return fvgs;
}

// Break of Structure (BOS)
export function findBOS(candles: Candle[]) {
  const { highs, lows } = findPivots(candles, 8, 8);
  const bos = [];
  const atr = calculateATR(candles, 20) || 0.0001;
  
  for (let i = 20; i < candles.length; i++) {
    const c = candles[i];
    const prevC = candles[i-1];
    
    // Bullish BOS: Candle closes decisively above a previous significant swing high
    const relevantHighs = highs.filter(h => h.index < i && h.index > i - 50);
    if (relevantHighs.length > 0) {
      const lastHigh = relevantHighs[relevantHighs.length - 1];
      if (c.close > lastHigh.price + (atr * 0.1) && prevC.close <= lastHigh.price) {
        // Must be a bullish candle
        if (c.close > c.open) {
          bos.push({ type: 'bullish', price: lastHigh.price, time: c.timestamp, pivotTime: lastHigh.time });
        }
      }
    }

    // Bearish BOS: Candle closes decisively below a previous significant swing low
    const relevantLows = lows.filter(l => l.index < i && l.index > i - 50);
    if (relevantLows.length > 0) {
      const lastLow = relevantLows[relevantLows.length - 1];
      if (c.close < lastLow.price - (atr * 0.1) && prevC.close >= lastLow.price) {
        // Must be a bearish candle
        if (c.close < c.open) {
          bos.push({ type: 'bearish', price: lastLow.price, time: c.timestamp, pivotTime: lastLow.time });
        }
      }
    }
  }
  return bos;
}

// Change of Character (CHOCH)
export function detectMSS(candles: Candle[]) {
  const bosEvents = findBOS(candles);
  if (bosEvents.length < 2) return null;
  
  // Look for a recent BOS that goes against the previous BOS direction
  for (let i = bosEvents.length - 1; i >= 1; i--) {
    const last = bosEvents[i];
    const prev = bosEvents[i - 1];
    
    // Check if the shift is recent (within last 20 candles)
    const lastIndex = candles.findIndex(c => c.timestamp === last.time);
    if (lastIndex > -1 && candles.length - lastIndex <= 20) {
       if (last.type !== prev.type) {
         return { type: `${last.type}_mss`, price: last.price, time: last.time };
       }
    }
  }
  return null;
}

// Order Block (OB)
export function findOrderBlocks(candles: Candle[]) {
  const obs = [];
  const bosEvents = findBOS(candles);
  const fvgs = findFVGs(candles);

  for (const bos of bosEvents) {
    const bosIndex = candles.findIndex(c => c.timestamp === bos.time);
    if (bosIndex === -1) continue;

    if (bos.type === 'bullish') {
      // Find the lowest bearish candle before the bullish BOS and FVG
      let obCandle = null;
      let lowestLow = Infinity;
      // Scan backwards from BOS
      for (let i = bosIndex - 1; i >= Math.max(0, bosIndex - 20); i--) {
        const c = candles[i];
        if (c.close < c.open) { // bearish candle
           if (c.low < lowestLow) {
             lowestLow = c.low;
             obCandle = c;
           }
        }
      }
      if (obCandle) {
        // Check if there is an FVG created after this OB
        const relatedFVG = fvgs.find(f => f.type === 'bullish' && new Date(f.time).getTime() > new Date(obCandle!.timestamp).getTime() && new Date(f.time).getTime() <= new Date(bos.time).getTime());
        if (relatedFVG) {
          obs.push({ type: 'bullish', top: obCandle.high, bottom: obCandle.low, time: obCandle.timestamp });
        }
      }
    } else {
      // Find the highest bullish candle before the bearish BOS
      let obCandle = null;
      let highestHigh = -Infinity;
      for (let i = bosIndex - 1; i >= Math.max(0, bosIndex - 20); i--) {
        const c = candles[i];
        if (c.close > c.open) { // bullish candle
           if (c.high > highestHigh) {
             highestHigh = c.high;
             obCandle = c;
           }
        }
      }
      if (obCandle) {
        const relatedFVG = fvgs.find(f => f.type === 'bearish' && new Date(f.time).getTime() > new Date(obCandle!.timestamp).getTime() && new Date(f.time).getTime() <= new Date(bos.time).getTime());
        if (relatedFVG) {
          obs.push({ type: 'bearish', top: obCandle.high, bottom: obCandle.low, time: obCandle.timestamp });
        }
      }
    }
  }
  return obs;
}

// Liquidity Sweeps
export function findSweeps(candles: Candle[]) {
  const { highs, lows } = findPivots(candles, 10, 10);
  const sweeps = [];
  const atr = calculateATR(candles, 20) || 0.0001;
  
  for (let i = 20; i < candles.length; i++) {
    const candle = candles[i];
    
    // Sweep High: Wick goes above old high, but closes below it.
    const relevantHighs = highs.filter(h => h.index < i && (i - h.index) > 10);
    for (const h of relevantHighs) {
      const wickAbove = candle.high - Math.max(candle.open, candle.close);
      if (candle.high > h.price && candle.close < h.price) {
        // Require significant wick
        if (wickAbove > atr * 0.2) {
          sweeps.push({ type: 'high_sweep', price: h.price, time: candle.timestamp });
        }
      }
    }
    // Sweep Low: Wick goes below old low, but closes above it.
    const relevantLows = lows.filter(l => l.index < i && (i - l.index) > 10);
    for (const l of relevantLows) {
      const wickBelow = Math.min(candle.open, candle.close) - candle.low;
      if (candle.low < l.price && candle.close > l.price) {
        if (wickBelow > atr * 0.2) {
          sweeps.push({ type: 'low_sweep', price: l.price, time: candle.timestamp });
        }
      }
    }
  }
  return sweeps;
}

export function determineRange(candles: Candle[]) {
  if (candles.length < 50) return 'unknown';
  const sma20 = calculateSMA(candles, 20);
  const sma50 = calculateSMA(candles, 50);
  if (!sma20 || !sma50) return 'unknown';
  const diff = Math.abs(sma20 - sma50) / sma50;
  if (diff < 0.0005) return 'ranging';
  return sma20 > sma50 ? 'trending_up' : 'trending_down';
}

export function detectEngulfing(candles: Candle[]) {
  if (candles.length < 2) return null;
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  const isPrevBullish = prev.close > prev.open;
  const isCurrBearish = curr.close < curr.open;
  const isPrevBearish = prev.close < prev.open;
  const isCurrBullish = curr.close > curr.open;
  
  const currBody = Math.abs(curr.close - curr.open);
  const prevBody = Math.abs(prev.close - prev.open);
  
  if (currBody < prevBody * 1.2) return null; // Current body must be at least 20% larger
  
  if (isPrevBullish && isCurrBearish && curr.open >= prev.close && curr.close < prev.open) {
      return 'bearish_engulfing';
  }
  if (isPrevBearish && isCurrBullish && curr.open <= prev.close && curr.close > prev.open) {
      return 'bullish_engulfing';
  }
  return null;
}

export function detectDoubleTopBottom(candles: Candle[]) {
  const { highs, lows } = findPivots(candles, 5, 5);
  const symmetryTolerance = (TradingParameters.doublePatternSymmetryTolerance?.value as any)?.tolerancePips ? ((TradingParameters.doublePatternSymmetryTolerance?.value as any).tolerancePips / 10000) : 0.0005;
  
  if (highs.length >= 2) {
      const h1 = highs[highs.length - 2];
      const h2 = highs[highs.length - 1];
      const indexDiff = h2.index - h1.index;
      // Second peak must be recent (within last 10 candles)
      if (candles.length - h2.index <= 10 && indexDiff > 10 && Math.abs(h1.price - h2.price) / h1.price < symmetryTolerance) {
          return 'double_top';
      }
  }
  if (lows.length >= 2) {
      const l1 = lows[lows.length - 2];
      const l2 = lows[lows.length - 1];
      const indexDiff = l2.index - l1.index;
      if (candles.length - l2.index <= 10 && indexDiff > 10 && Math.abs(l1.price - l2.price) / l1.price < symmetryTolerance) {
          return 'double_bottom';
      }
  }
  return null;
}

export function detectEqualHighLow(candles: Candle[]) {
  const { highs, lows } = findPivots(candles, 5, 5);
  const eqh = [];
  const eql = [];
  const tolerance = 0.0002;
  for (let i = 0; i < highs.length - 1; i++) {
      for (let j = i + 1; j < highs.length; j++) {
          const indexDiff = highs[j].index - highs[i].index;
          if (candles.length - highs[j].index <= 10 && indexDiff > 10 && Math.abs(highs[i].price - highs[j].price) / highs[i].price < tolerance) {
              eqh.push({ price: highs[i].price, time1: highs[i].time, time2: highs[j].time });
          }
      }
  }
  for (let i = 0; i < lows.length - 1; i++) {
      for (let j = i + 1; j < lows.length; j++) {
          const indexDiff = lows[j].index - lows[i].index;
          if (candles.length - lows[j].index <= 10 && indexDiff > 10 && Math.abs(lows[i].price - lows[j].price) / lows[i].price < tolerance) {
              eql.push({ price: lows[i].price, time1: lows[i].time, time2: lows[j].time });
          }
      }
  }
  return { eqh, eql };
}

export function findBreakerBlocks(candles: Candle[]) {
  const obs = findOrderBlocks(candles);
  const breakers = [];
  for (const ob of obs) {
      const obIndex = candles.findIndex(c => c.timestamp === ob.time);
      if (obIndex === -1) continue;
      
      for (let i = obIndex + 1; i < candles.length; i++) {
          const c = candles[i];
          if (ob.type === 'bullish' && c.close < ob.bottom) {
              breakers.push({ type: 'bearish_breaker', top: ob.top, bottom: ob.bottom, time: c.timestamp });
              break;
          } else if (ob.type === 'bearish' && c.close > ob.top) {
              breakers.push({ type: 'bullish_breaker', top: ob.top, bottom: ob.bottom, time: c.timestamp });
              break;
          }
      }
  }
  return breakers;
}

export function findMitigationBlocks(candles: Candle[]) {
  return findBreakerBlocks(candles).map(b => ({
      ...b,
      type: b.type.replace('breaker', 'mitigation')
  }));
}

export function detectRejectionBlock(candles: Candle[]) {
  const blocks = [];
  for (const c of candles) {
      const bodySize = Math.abs(c.close - c.open);
      const upperWick = c.high - Math.max(c.close, c.open);
      const lowerWick = Math.min(c.close, c.open) - c.low;
      if (upperWick > bodySize * 3) {
          blocks.push({ type: 'bearish_rejection', top: c.high, bottom: Math.max(c.close, c.open), time: c.timestamp });
      }
      if (lowerWick > bodySize * 3) {
          blocks.push({ type: 'bullish_rejection', top: Math.min(c.close, c.open), bottom: c.low, time: c.timestamp });
      }
  }
  return blocks;
}

export function analyzeStructure(candles: Candle[], leftBar: number, rightBar: number) {
  const { highs, lows } = findPivots(candles, leftBar, rightBar);
  let trend = 'ranging';
  if (highs.length >= 2 && lows.length >= 2) {
      const h1 = highs[highs.length - 2].price;
      const h2 = highs[highs.length - 1].price;
      const l1 = lows[lows.length - 2].price;
      const l2 = lows[lows.length - 1].price;
      if (h2 > h1 && l2 > l1) trend = 'bullish';
      else if (h2 < h1 && l2 < l1) trend = 'bearish';
  }
  return { trend, highs, lows };
}

export function detectKillzone(timestamp: string) {
  const date = new Date(timestamp);
  const h = date.getUTCHours();
  if (h >= 7 && h < 10) return 'london';
  if (h >= 13 && h < 16) return 'newyork';
  if (h >= 0 && h < 4) return 'tokyo';
  if (h >= 21 && h <= 23) return 'sydney';
  return 'none';
}

export function detectSessionBias(candles: Candle[], timestamp: string) {
  const zone = detectKillzone(timestamp);
  if (zone === 'none' || candles.length < 20) return 'neutral';
  const sma = calculateSMA(candles.slice(-20), 10);
  const prevSma = calculateSMA(candles.slice(-30, -10), 10);
  if (!sma || !prevSma) return 'neutral';
  if (sma > prevSma) return 'bullish';
  if (sma < prevSma) return 'bearish';
  return 'neutral';
}
