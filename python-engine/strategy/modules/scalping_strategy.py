from typing import Dict, Any, List, Tuple
from strategy.base_strategy import BaseStrategy, StrategyMetadata

class ScalpingStrategy(BaseStrategy):
    @property
    def metadata(self) -> StrategyMetadata:
        return StrategyMetadata(
            id="strategy-3-scalping",
            name="Momentum Scalping",
            priority=80,
            version="1.0.0",
            dependencies=[],
            required_indicators=["volatility"],
            required_timeframes=["M1", "M5", "1m", "5m"],
            required_market_conditions=["high_volatility"],
            required_confirmations=["momentum"]
        )

    def calculate_confidence(self, direction: str, analysis: Dict[str, Any], z_score: float) -> Tuple[int, List[str]]:
        score = 0
        reasons = []
        volatility = analysis.get('volatility', 0)
        slope = analysis.get('trend_slope', 0)

        # Scalping needs volatility
        if volatility > 0.001:
            score += 20
            reasons.append(f"High volatility ideal for scalping ({volatility:.5f})")
        elif volatility < 0.0005:
            score -= 20
            reasons.append("Low volatility, unfavorable for scalping")

        if direction == 'LONG':
            if slope > 0:
                score += 15
                reasons.append("Strong short-term uptrend momentum")
            
            if analysis.get('bullish_engulfing'):
                score += 15
                reasons.append("Bullish momentum bar")
                
            if z_score < -0.5:
                score += 10
                reasons.append("Slightly oversold short-term dip")
                
        elif direction == 'SHORT':
            if slope < 0:
                score += 15
                reasons.append("Strong short-term downtrend momentum")
                
            if analysis.get('bearish_engulfing'):
                score += 15
                reasons.append("Bearish momentum bar")
                
            if z_score > 0.5:
                score += 10
                reasons.append("Slightly overbought short-term rally")

        return score, reasons
