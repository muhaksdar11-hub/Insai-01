import numpy as np
from typing import Dict, List, Any, Optional
import hashlib
from collections import OrderedDict

class SMCSDConfluenceEngine:
    def __init__(self, max_cache_size=1000):
        self._cache = OrderedDict()
        self._max_cache_size = max_cache_size

    def _generate_cache_key(self, data: Dict[str, Any]) -> str:
        # Fast cache key generation
        sig = []
        for tf in ("H1", "M15", "M5", "M1"):
            tf_data = data.get(tf, {})
            candles = tf_data.get("candles", [])
            if candles:
                c = candles[-1]
                sig.append(f"{tf}_{c.get('timestamp', '')}_{c.get('close', 0)}_{c.get('volume', 0)}")
        return hashlib.md5("|".join(sig).encode()).hexdigest()

    def _get_swing_highs_lows(self, highs: np.ndarray, lows: np.ndarray, window: int = 3):
        N = len(highs)
        if N < window * 2 + 1:
            return [], []
            
        # Fast sliding window max/min using stride tricks or simply roll
        # Vectorized check
        sh_mask = np.ones(N, dtype=bool)
        sl_mask = np.ones(N, dtype=bool)
        
        for w in range(1, window + 1):
            sh_mask[w:] &= (highs[w:] > highs[:-w])
            sh_mask[:-w] &= (highs[:-w] >= highs[w:])
            sl_mask[w:] &= (lows[w:] < lows[:-w])
            sl_mask[:-w] &= (lows[:-w] <= lows[w:])
            
        sh_mask[:window] = False
        sh_mask[-window:] = False
        sl_mask[:window] = False
        sl_mask[-window:] = False
        
        sh_idx = np.nonzero(sh_mask)[0]
        sl_idx = np.nonzero(sl_mask)[0]
        
        sh = [{'index': int(i), 'price': float(highs[i])} for i in sh_idx]
        sl = [{'index': int(i), 'price': float(lows[i])} for i in sl_idx]
        return sh, sl

    def run(self, data: Dict[str, Any]) -> Dict[str, Any]:
        cache_key = self._generate_cache_key(data)
        if cache_key in self._cache:
            self._cache.move_to_end(cache_key)
            return self._cache[cache_key]
            
        assumptions = []
        
        # Validasi input
        for tf in ("H1", "M15", "M5", "M1"):
            if tf not in data or not data[tf].get("candles"):
                return self._no_signal(0, f"Layer 1 Gagal: Missing {tf} data", assumptions)
        
        m15_candles = data["M15"]["candles"]
        if len(m15_candles) < 30:
            return self._no_signal(0, "Layer 1 Gagal: Butuh minimal 30 candle M15", assumptions)
            
        # Fast array extraction
        m15_arr = np.array([(c["open"], c["high"], c["low"], c["close"]) for c in m15_candles], dtype=np.float64)
        m15_opens, m15_highs, m15_lows, m15_closes = m15_arr[:, 0], m15_arr[:, 1], m15_arr[:, 2], m15_arr[:, 3]
        
        m15_atr = data["M15"].get("atr", 0)
        if m15_atr == 0:
            assumptions.append("ATR M15 tidak valid, menggunakan estimasi (ASUMSI PERLU KONFIRMASI)")
            m15_atr = float(np.mean(m15_highs[-14:] - m15_lows[-14:]))

            
        # ================================
        # LAYER 1: Market Structure (H1/M15)
        # ================================
        bias = "neutral"
        sh, sl = self._get_swing_highs_lows(m15_highs, m15_lows, window=3)
        
        if len(sh) >= 2 and len(sl) >= 2:
            last_sh, prev_sh = sh[-1]['price'], sh[-2]['price']
            last_sl, prev_sl = sl[-1]['price'], sl[-2]['price']
            last_close = m15_closes[-1]
            
            # BOS: candle close melewati swing high/low signifikan sebelumnya searah trend
            # CHoCH: candle close melewati swing high/low signifikan berlawanan arah trend sebelumnya
            bos_bull = (last_close > last_sh) and (last_sh >= prev_sh)
            bos_bear = (last_close < last_sl) and (last_sl <= prev_sl)
            choch_bull = (last_close > last_sh) and (last_sh < prev_sh)
            choch_bear = (last_close < last_sl) and (last_sl > prev_sl)
            
            if bos_bull or choch_bull: bias = "bullish"
            elif bos_bear or choch_bear: bias = "bearish"
        else:
            assumptions.append("Jumlah swing points tidak cukup untuk deteksi market structure (ASUMSI PERLU KONFIRMASI)")
            
        if bias == "neutral":
            return self._no_signal(0, "Layer 1 Gagal: Bias market neutral", assumptions)
            
        # ================================
        # LAYER 2: Zone Detection (M15)
        # ================================
        valid_zone = None
        zones = []
        body_sizes = np.abs(m15_closes - m15_opens)
        
        # Deteksi impulsive move (>1.5x ATR) yang searah bias (mengarah ke break)
        is_bull_impulsive = (m15_closes > m15_opens) & (body_sizes > 1.5 * m15_atr)
        is_bear_impulsive = (m15_closes < m15_opens) & (body_sizes > 1.5 * m15_atr)
        
        # Vectorized impulsive search
        impulsive_idx = -1
        last_15_start = max(0, len(m15_candles) - 15)
        if bias == "bullish":
            idx = np.nonzero(is_bull_impulsive[last_15_start:])[0]
            if len(idx) > 0: impulsive_idx = last_15_start + idx[-1]
        elif bias == "bearish":
            idx = np.nonzero(is_bear_impulsive[last_15_start:])[0]
            if len(idx) > 0: impulsive_idx = last_15_start + idx[-1]
                
        if impulsive_idx != -1:
            # 1. Order Block: candle terakhir berlawanan arah sebelum impulsive move
            for i in range(impulsive_idx-1, max(0, impulsive_idx-6), -1):
                if (bias == "bullish" and m15_closes[i] < m15_opens[i]) or (bias == "bearish" and m15_closes[i] > m15_opens[i]):
                    zones.append({"type": "OB", "top": float(m15_highs[i]), "bottom": float(m15_lows[i])})
                    break
            
            # 2. Supply/Demand Base: 2-3 candle konsolidasi (range < 0.5x ATR) sebelum impulsive
            base_idx = slice(max(0, impulsive_idx-4), impulsive_idx)
            base_ranges = m15_highs[base_idx] - m15_lows[base_idx]
            base_mask = base_ranges < (0.5 * m15_atr)
            if np.count_nonzero(base_mask) >= 2:
                top = float(np.max(m15_highs[base_idx][base_mask]))
                bot = float(np.min(m15_lows[base_idx][base_mask]))
                zones.append({"type": "SD", "top": top, "bottom": bot})
                
        # 3. Fair Value Gap (FVG): Vectorized check
        fvg_start = max(1, len(m15_candles) - 15)
        if bias == "bullish":
            # gap_condition: low[i+1] > high[i-1]
            # need to check if unmitigated
            for i in range(fvg_start, len(m15_candles) - 1):
                if m15_lows[i+1] > m15_highs[i-1]:
                    if np.all(m15_lows[i+1:] >= m15_highs[i-1]):
                        zones.append({"type": "FVG", "top": float(m15_lows[i+1]), "bottom": float(m15_highs[i-1])})
        elif bias == "bearish":
            for i in range(fvg_start, len(m15_candles) - 1):
                if m15_highs[i+1] < m15_lows[i-1]:
                    if np.all(m15_highs[i+1:] <= m15_lows[i-1]):
                        zones.append({"type": "FVG", "top": float(m15_lows[i-1]), "bottom": float(m15_highs[i+1])})
                    
        # Check overlap efficiently
        if len(zones) >= 2:
            # Sort zones by top or just O(N^2) for N<=4 is fast enough
            for i in range(len(zones)):
                for j in range(i+1, len(zones)):
                    z1, z2 = zones[i], zones[j]
                    overlap_top = min(z1["top"], z2["top"])
                    overlap_bot = max(z1["bottom"], z2["bottom"])
                    max_range = max(z1["top"] - z1["bottom"], z2["top"] - z2["bottom"])
                    
                    if (overlap_top - overlap_bot) > -0.2 * max_range:
                        valid_zone = {"top": max(z1["top"], z2["top"]), "bottom": min(z1["bottom"], z2["bottom"])}
                        break
                if valid_zone:
                    break
                
        if not valid_zone:
            return self._no_signal(1, "Layer 2 Gagal: Tidak ada valid zone confluence (minimal 2 dari OB/FVG/SD overlap)", assumptions)
            
        # ================================
        # LAYER 3: Liquidity Sweep Confirmation (M5/M15)
        # ================================
        m5_candles = data["M5"]["candles"]
        if len(m5_candles) < 10:
             return self._no_signal(2, "Layer 3 Gagal: Candle M5 tidak cukup", assumptions)
             
        m5_arr = np.array([(c["high"], c["low"], c["close"]) for c in m5_candles], dtype=np.float64)
        m5_highs, m5_lows, m5_closes = m5_arr.T
        
        sweep_detected = False
        m5_sh, m5_sl = self._get_swing_highs_lows(m5_highs, m5_lows, window=3)
        
        if bias == "bullish" and len(m5_sl) > 0:
            last_sl_price = m5_sl[-1]['price']
            # Sweep harus terjadi di dalam atau menuju valid zone
            if valid_zone["bottom"] * 0.999 <= last_sl_price <= valid_zone["top"] * 1.001:
                # menembus swing low lalu close kembali dalam range (dalam 1-3 candle)
                recent_lows = m5_lows[-3:]
                recent_closes = m5_closes[-3:]
                if np.any((recent_lows < last_sl_price) & (recent_closes > last_sl_price)):
                    sweep_detected = True
        elif bias == "bearish" and len(m5_sh) > 0:
            last_sh_price = m5_sh[-1]['price']
            if valid_zone["bottom"] * 0.999 <= last_sh_price <= valid_zone["top"] * 1.001:
                recent_highs = m5_highs[-3:]
                recent_closes = m5_closes[-3:]
                if np.any((recent_highs > last_sh_price) & (recent_closes < last_sh_price)):
                    sweep_detected = True
                        
        if not sweep_detected:
            return self._no_signal(2, "Layer 3 Gagal: Tidak ada Liquidity Sweep ke area zone", assumptions)
            
        # ================================
        # LAYER 4: Entry Trigger (M1/M5)
        # ================================
        m1_candles = data["M1"]["candles"]
        if len(m1_candles) < 5:
            return self._no_signal(3, "Layer 4 Gagal: Candle M1 tidak cukup", assumptions)
            
        c1, c2 = m1_candles[-2], m1_candles[-1]
        body1 = abs(c1["close"] - c1["open"])
        body2 = abs(c2["close"] - c2["open"])
        wick_up2 = c2["high"] - max(c2["open"], c2["close"])
        wick_dn2 = min(c2["open"], c2["close"]) - c2["low"]
        
        trigger = False
        if bias == "bullish":
            # Bullish Engulfing: body candle 2 menutupi penuh body candle 1, arah bullish
            is_engulf = (c1["close"] < c1["open"]) and (c2["close"] > c2["open"]) and (body2 > body1) and (c2["close"] > c1["open"]) and (c2["open"] < c1["close"])
            # Pin bar: wick >= 2x body, close di 1/3 range atas
            is_pinbar = (wick_dn2 >= 2 * body2) and (c2["close"] >= c2["high"] - ((c2["high"] - c2["low"]) / 3))
            trigger = is_engulf or is_pinbar
        else:
            # Bearish Engulfing
            is_engulf = (c1["close"] > c1["open"]) and (c2["close"] < c2["open"]) and (body2 > body1) and (c2["close"] < c1["open"]) and (c2["open"] > c1["close"])
            # Pin bar: wick >= 2x body, close di 1/3 range bawah
            is_pinbar = (wick_up2 >= 2 * body2) and (c2["close"] <= c2["low"] + ((c2["high"] - c2["low"]) / 3))
            trigger = is_engulf or is_pinbar
                
        if not trigger:
            return self._no_signal(3, "Layer 4 Gagal: Belum ada pattern konfirmasi (Engulfing / Pin bar)", assumptions)
            
        # ================================
        # RISK MANAGEMENT
        # ================================
        entry_price = c2["close"]
        buffer = m15_atr * 0.5
        
        if bias == "bullish":
            sl = valid_zone["bottom"] - buffer
            # TP1: swing high terdekat (RR >= 1:1.8)
            tp1_cands = [s['price'] for s in sh if s['price'] > entry_price]
            tp1 = min(tp1_cands) if tp1_cands else entry_price + (entry_price - sl) * 1.8
            # TP2: swing high berikutnya atau SD berikutnya (RR >= 1:2)
            tp2_cands = [s['price'] for s in sh if s['price'] > tp1]
            tp2 = min(tp2_cands) if tp2_cands else entry_price + (entry_price - sl) * 2.5
        else:
            sl = valid_zone["top"] + buffer
            tp1_cands = [s['price'] for s in sl if s['price'] < entry_price]
            tp1 = max(tp1_cands) if tp1_cands else entry_price - (sl - entry_price) * 1.8
            tp2_cands = [s['price'] for s in sl if s['price'] < tp1]
            tp2 = max(tp2_cands) if tp2_cands else entry_price - (sl - entry_price) * 2.5
            
        risk = abs(entry_price - sl)
        if risk == 0:
            return self._no_signal(4, "Risk Error: Risk 0", assumptions)
            
        rr1 = abs(tp1 - entry_price) / risk
        if rr1 < 0.8:
            return self._no_signal(4, f"Reject: Risk/Reward TP1 terlalu kecil ({rr1:.2f} < 0.8)", assumptions)
            
        # Ensure RR >= 1:1.8 for TP1 and 1:2 for TP2 if they were found from swings
        if rr1 < 1.8:
             # Paksa tp1 memenuhi minimum 1:1.8 jika swing terlalu dekat, karena rule RR >= 1:1.8
             if bias == "bullish":
                 tp1 = max(tp1, entry_price + (risk * 1.8))
             else:
                 tp1 = min(tp1, entry_price - (risk * 1.8))
                 
        rr2 = abs(tp2 - entry_price) / risk
        if rr2 < 2.0:
             if bias == "bullish":
                 tp2 = max(tp2, entry_price + (risk * 2.0))
             else:
                 tp2 = min(tp2, entry_price - (risk * 2.0))
            
        res = {
            "signal": "buy" if bias == "bullish" else "sell",
            "confluence_score": 4,
            "entry": round(entry_price, 3),
            "sl": round(sl, 3),
            "tp1": round(tp1, 3),
            "tp2": round(tp2, 3),
            "reasoning": "Full 4-Layer Confluence Tercapai",
            "assumptions_flagged": assumptions
        }
        
        self._cache[cache_key] = res
        if len(self._cache) > self._max_cache_size:
            self._cache.popitem(last=False)
            
        return res

    def _no_signal(self, score: int, reasoning: str, assumptions: List[str]) -> Dict[str, Any]:
        return {
            "signal": "no_signal",
            "confluence_score": score,
            "entry": 0,
            "sl": 0,
            "tp1": 0,
            "tp2": 0,
            "reasoning": reasoning,
            "assumptions_flagged": assumptions
        }
