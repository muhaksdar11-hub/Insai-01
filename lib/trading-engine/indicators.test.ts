import { describe, it, expect } from 'vitest';
import { calculateSMA } from './indicators';

describe('Indicators', () => {
  it('should calculate SMA correctly', () => {
    const candles = [
      { timestamp: '1', open: 1, high: 1, low: 1, close: 10, volume: 100 },
      { timestamp: '2', open: 1, high: 1, low: 1, close: 20, volume: 100 },
      { timestamp: '3', open: 1, high: 1, low: 1, close: 30, volume: 100 },
    ];
    const sma = calculateSMA(candles, 3);
    expect(sma).toBe(20);
  });

  it('should return null for SMA if not enough candles', () => {
    const candles = [
      { timestamp: '1', open: 1, high: 1, low: 1, close: 10, volume: 100 },
    ];
    const sma = calculateSMA(candles, 3);
    expect(sma).toBeNull();
  });
});
