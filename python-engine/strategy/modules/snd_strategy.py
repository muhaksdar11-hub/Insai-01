from typing import Dict, Any, List, Tuple
from strategy.base_strategy import BaseStrategy, StrategyMetadata

class SNDStrategy(BaseStrategy):
    @property
    def metadata(self) -> StrategyMetadata:
        return StrategyMetadata(
            id="strategy-2-snd",
            name="Supply and Demand",
            priority=90,
            version="1.0.0",
            dependencies=[],
            required_indicators=["engulfing", "double_top", "double_bottom"],
            required_timeframes=["M15", "H1", "H4", "15m", "1h", "4h"],
            required_market_conditions=["trending", "ranging"],
            required_confirmations=["engulfing", "rejection"]
        )

    def calculate_confidence(self, direction: str, analysis: Dict[str, Any], z_score: float) -> Tuple[int, List[str]]:
        score = 0
        reasons = []
        slope = analysis.get('trend_slope', 0)

        if direction == 'LONG':
            if slope > 0:
                score += 10
                reasons.append("Trend alignment positive (Upward slope)")
            
            if analysis.get('bullish_engulfing'):
                score += 25
                reasons.append("Strong Demand Zone Rejection (Bullish Engulfing)")
                
            if analysis.get('double_bottom'):
                score += 20
                reasons.append("Double Bottom Base (Demand)")
                
            if analysis.get('morning_star'):
                score += 15
                reasons.append("Morning Star Reversal at Demand")
                
            if z_score < -1.0:
                score += 10
                reasons.append(f"Favorable Z-Score for Demand ({z_score:.2f})")
                
        elif direction == 'SHORT':
            if slope < 0:
                score += 10
                reasons.append("Trend alignment positive (Downward slope)")
                
            if analysis.get('bearish_engulfing'):
                score += 25
                reasons.append("Strong Supply Zone Rejection (Bearish Engulfing)")
                
            if analysis.get('double_top'):
                score += 20
                reasons.append("Double Top Base (Supply)")
                
            if analysis.get('evening_star'):
                score += 15
                reasons.append("Evening Star Reversal at Supply")
                
            if z_score > 1.0:
                score += 10
                reasons.append(f"Favorable Z-Score for Supply ({z_score:.2f})")

        return score, reasons
