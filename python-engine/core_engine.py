import numpy as np
import hashlib
from typing import List, Dict, Any
from shared_utilities import get_logger
from collections import OrderedDict

logger = get_logger("CoreEngine")

class CoreEngine:
    def __init__(self):
        # LRU cache to prevent re-evaluation of same candles
        self._cache = OrderedDict()
        self._max_cache_size = 1024

    def _generate_cache_key(self, candles: List[Any], prefix: str = "") -> str:
        """Generates a stable, fast cache key based on the last few candles."""
        if not candles or len(candles) == 0: return ""
        # Hash the last 5 candles to detect incremental changes
        last_few = candles[-5:]
        sig = "|".join((f"{getattr(c, 'timestamp', c.get('timestamp', ''))}_{getattr(c, 'close', c.get('close', 0))}" if isinstance(c, dict) else f"{c.timestamp}_{c.close}") for c in last_few)
        return f"{prefix}_{hashlib.md5(sig.encode()).hexdigest()}"

    def analyze(self, candles: List[Any], cache_key: str = None) -> Dict[str, Any]:
        """Analyzes market structure and indicators purely using vectorized operations."""
        
        cache_key = cache_key or self._generate_cache_key(candles)
        
        if cache_key and cache_key in self._cache:
            self._cache.move_to_end(cache_key)
            return self._cache[cache_key]
            
        if len(candles) < 30:
            raise ValueError("Insufficient data (need >= 30)")
            
        # 1. Fast Vectorized Array Extraction
        if isinstance(candles[0], dict):
            # Fast extraction for dicts
            arr = np.fromiter((x for c in candles for x in (c.get('open', 0), c.get('high', 0), c.get('low', 0), c.get('close', 0), c.get('volume', 0))), dtype=np.float64, count=len(candles)*5).reshape(-1, 5)
        else:
            # Fast extraction for objects
            arr = np.fromiter((x for c in candles for x in (getattr(c, 'open', 0), getattr(c, 'high', 0), getattr(c, 'low', 0), getattr(c, 'close', 0), getattr(c, 'volume', 0))), dtype=np.float64, count=len(candles)*5).reshape(-1, 5)
            
        O, H, L, C, V = arr[:, 0], arr[:, 1], arr[:, 2], arr[:, 3], arr[:, 4]
        N = len(C)
        
        body_size = np.abs(C - O)
        is_green = C > O
        is_red = C < O
        
        # Calculate trailing averages dynamically for dynamic thresholds
        avg_body = np.mean(body_size[-20:]) if N >= 20 else np.mean(body_size)
        
        # 2. Vectorized Candlestick Patterns (Last 5 periods only for extreme performance)
        lookback = min(5, N)
        
        O_lb, H_lb, L_lb, C_lb = O[-lookback:], H[-lookback:], L[-lookback:], C[-lookback:]
        body_lb, grn_lb, red_lb = body_size[-lookback:], is_green[-lookback:], is_red[-lookback:]
        
        # FVG (Fair Value Gap)
        fvg_bull_active = bool(np.any((L_lb[2:] > H_lb[:-2]) & grn_lb[1:-1] & (body_lb[1:-1] > avg_body))) if lookback >= 3 else False
        fvg_bear_active = bool(np.any((H_lb[2:] < L_lb[:-2]) & red_lb[1:-1] & (body_lb[1:-1] > avg_body))) if lookback >= 3 else False
        
        # Engulfing (Last candle only)
        bullish_engulfing = bool(red_lb[-2] and grn_lb[-1] and (C_lb[-1] > O_lb[-2]) and (O_lb[-1] < C_lb[-2]) and body_lb[-1] > avg_body) if lookback >= 2 else False
        bearish_engulfing = bool(grn_lb[-2] and red_lb[-1] and (C_lb[-1] < O_lb[-2]) and (O_lb[-1] > C_lb[-2]) and body_lb[-1] > avg_body) if lookback >= 2 else False
        
        # Morning/Evening Star (Last 3 candles)
        morning_star = bool(red_lb[-3] and (body_lb[-2] < avg_body * 0.5) and grn_lb[-1] and (C_lb[-1] > (O_lb[-3] + C_lb[-3]) / 2)) if lookback >= 3 else False
        evening_star = bool(grn_lb[-3] and (body_lb[-2] < avg_body * 0.5) and red_lb[-1] and (C_lb[-1] < (O_lb[-3] + C_lb[-3]) / 2)) if lookback >= 3 else False

        # 3. Market Structure (Swings)
        window = 5
        
        # Finding Swing Highs/Lows efficiently using a rolling max/min approach
        sh_mask = np.ones(N, dtype=bool)
        sl_mask = np.ones(N, dtype=bool)
        
        for w in range(1, window + 1):
            sh_mask[w:] &= (H[w:] > H[:-w])
            sh_mask[:-w] &= (H[:-w] >= H[w:])
            sl_mask[w:] &= (L[w:] < L[:-w])
            sl_mask[:-w] &= (L[:-w] <= L[w:])
            
        sh_mask[:window] = False
        sh_mask[-window:] = False
        sl_mask[:window] = False
        sl_mask[-window:] = False
        
        sh_indices = np.where(sh_mask)[0]
        sl_indices = np.where(sl_mask)[0]
        
        last_swing_high = H[sh_indices[-1]] if len(sh_indices) > 0 else 0.0
        prev_swing_high = H[sh_indices[-2]] if len(sh_indices) > 1 else 0.0
        
        last_swing_low = L[sl_indices[-1]] if len(sl_indices) > 0 else 0.0
        prev_swing_low = L[sl_indices[-2]] if len(sl_indices) > 1 else 0.0
        
        # Structure Breaks (Looking at the most recent candle)
        c_last, h_last, l_last = C[-1], H[-1], L[-1]
        
        bos_bull = (c_last > last_swing_high) and (last_swing_high >= prev_swing_high) and (last_swing_high > 0)
        bos_bear = (c_last < last_swing_low) and (last_swing_low <= prev_swing_low) and (last_swing_low > 0)
        
        choch_bull = (c_last > last_swing_high) and (last_swing_high < prev_swing_high) and (last_swing_high > 0)
        choch_bear = (c_last < last_swing_low) and (last_swing_low > prev_swing_low) and (last_swing_low > 0)
        
        liq_sweep_bull = (l_last < last_swing_low) and (c_last > last_swing_low) and (last_swing_low > 0)
        liq_sweep_bear = (h_last > last_swing_high) and (c_last < last_swing_high) and (last_swing_high > 0)
        
        double_top = (h_last >= last_swing_high - (avg_body * 0.5)) and (h_last <= last_swing_high + (avg_body * 0.5)) and is_red[-1] and (last_swing_high > 0)
        double_bottom = (l_last >= last_swing_low - (avg_body * 0.5)) and (l_last <= last_swing_low + (avg_body * 0.5)) and is_green[-1] and (last_swing_low > 0)

        # 4. Supply/Demand & Order Blocks
        curr_ob_bull, curr_ob_bear = False, False
        if len(sh_indices) > 0 and len(sl_indices) > 0:
            # Bearish OB: The last up candle before a down move that breaks structure
            for idx in sh_indices[-3:]:
                if bos_bear or choch_bear:
                    for j in range(idx, max(-1, idx-10), -1):
                        if is_green[j]:
                            # If price retraces into the OB body/wick
                            if h_last >= L[j] and c_last <= H[j]:
                                curr_ob_bear = True
                            break
            # Bullish OB: The last down candle before an up move that breaks structure
            for idx in sl_indices[-3:]:
                if bos_bull or choch_bull:
                    for j in range(idx, max(-1, idx-10), -1):
                        if is_red[j]:
                            # If price retraces into the OB body/wick
                            if l_last <= H[j] and c_last >= L[j]:
                                curr_ob_bull = True
                            break

        # 5. Volatility & Trend (Vectorized metrics over last 20 periods)
        C_20 = C[-20:]
        returns = np.diff(C_20) / C_20[:-1] if len(C_20) > 1 else np.array([0.0])
        volatility = float(np.std(returns)) if len(returns) > 0 else 0.0
        ma_20 = float(np.mean(C_20))
        std_20 = float(np.std(C_20))
        
        # Fast Slope using dot product
        if len(C_20) > 1:
            x = np.arange(len(C_20))
            x_mean = np.mean(x)
            y_mean = np.mean(C_20)
            slope = float(np.sum((x - x_mean) * (C_20 - y_mean)) / np.sum((x - x_mean)**2))
        else:
            slope = 0.0

        result = {
            "fvg_bull_active": fvg_bull_active,
            "fvg_bear_active": fvg_bear_active,
            "bullish_engulfing": bullish_engulfing,
            "bearish_engulfing": bearish_engulfing,
            "morning_star": morning_star,
            "evening_star": evening_star,
            "double_top": double_top,
            "double_bottom": double_bottom,
            "bos_bull": bos_bull,
            "bos_bear": bos_bear,
            "choch_bull": choch_bull,
            "choch_bear": choch_bear,
            "liq_sweep_bull": liq_sweep_bull,
            "liq_sweep_bear": liq_sweep_bear,
            "ob_bull": curr_ob_bull,
            "ob_bear": curr_ob_bear,
            "volatility": volatility,
            "ma_20": ma_20,
            "std_20": std_20,
            "trend_slope": slope
        }
        
        if cache_key:
            if len(self._cache) >= self._max_cache_size:
                self._cache.popitem(last=False)
            self._cache[cache_key] = result
            
        return result
