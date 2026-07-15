from typing import Dict, Any, List, Tuple
from strategy.base_strategy import BaseStrategy, StrategyMetadata

class SMCStrategy(BaseStrategy):
    @property
    def metadata(self) -> StrategyMetadata:
        return StrategyMetadata(
            id="strategy-1-smc",
            name="Smart Money Concepts",
            priority=100,
            version="1.0.0",
            dependencies=[],
            required_indicators=["bos", "choch", "liq_sweep", "fvg", "ob"],
            required_timeframes=["M15", "H1", "H4", "15m", "1h", "4h"],
            required_market_conditions=["trending"],
            required_confirmations=["engulfing", "morning_star", "evening_star"]
        )

    def calculate_confidence(self, direction: str, analysis: Dict[str, Any], z_score: float) -> Tuple[int, List[str]]:
        score = 0
        reasons = []
        slope = analysis.get('trend_slope', 0)

        if direction == 'LONG':
            if slope > 0:
                score += 10
                reasons.append("Trend alignment positive (Upward slope)")
            if analysis.get('bos_bull'):
                score += 15
                reasons.append("Bullish Break of Structure (BOS)")
            if analysis.get('choch_bull'):
                score += 25
                reasons.append("Bullish CHoCH (Trend Reversal)")
            if analysis.get('liq_sweep_bull'):
                score += 15
                reasons.append("Bullish Liquidity Sweep")
            if analysis.get('fvg_bull_active'):
                score += 10
                reasons.append("Bullish FVG active")
            if analysis.get('ob_bull'):
                score += 20
                reasons.append("Bullish Order Block support")
            if analysis.get('double_bottom'):
                score += 10
                reasons.append("Double Bottom formation")
            if analysis.get('bullish_engulfing') or analysis.get('morning_star'):
                score += 15
                reasons.append("Strong Bullish Reversal Pattern (Engulfing/Morning Star)")
            if z_score < -1.5:
                score += 10
                reasons.append(f"Oversold condition (Z-Score: {z_score:.2f})")
                
            # Filter low quality setups:
            if not analysis.get('ob_bull') and not analysis.get('fvg_bull_active') and not analysis.get('liq_sweep_bull'):
                score -= 20
                reasons.append("Missing primary SMC confluences (OB/FVG/Sweep)")
                
        elif direction == 'SHORT':
            if slope < 0:
                score += 10
                reasons.append("Trend alignment positive (Downward slope)")
            if analysis.get('bos_bear'):
                score += 15
                reasons.append("Bearish Break of Structure (BOS)")
            if analysis.get('choch_bear'):
                score += 25
                reasons.append("Bearish CHoCH (Trend Reversal)")
            if analysis.get('liq_sweep_bear'):
                score += 15
                reasons.append("Bearish Liquidity Sweep")
            if analysis.get('fvg_bear_active'):
                score += 10
                reasons.append("Bearish FVG active")
            if analysis.get('ob_bear'):
                score += 20
                reasons.append("Bearish Order Block resistance")
            if analysis.get('double_top'):
                score += 10
                reasons.append("Double Top formation")
            if analysis.get('bearish_engulfing') or analysis.get('evening_star'):
                score += 15
                reasons.append("Strong Bearish Reversal Pattern (Engulfing/Evening Star)")
            if z_score > 1.5:
                score += 10
                reasons.append(f"Overbought condition (Z-Score: {z_score:.2f})")
                
            # Filter low quality setups:
            if not analysis.get('ob_bear') and not analysis.get('fvg_bear_active') and not analysis.get('liq_sweep_bear'):
                score -= 20
                reasons.append("Missing primary SMC confluences (OB/FVG/Sweep)")

        return score, reasons
