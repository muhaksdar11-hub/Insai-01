from typing import Dict, Any, List, Tuple
from strategy.base_strategy import BaseStrategy, StrategyMetadata

class NewsStrategy(BaseStrategy):
    @property
    def metadata(self) -> StrategyMetadata:
        return StrategyMetadata(
            id="strategy-4-news",
            name="News Trading",
            priority=70,
            version="1.0.0",
            dependencies=[],
            required_indicators=["volatility"],
            required_timeframes=["M1", "M5", "1m", "5m", "M15", "15m"],
            required_market_conditions=["high_volatility", "news_event"],
            required_confirmations=["momentum"]
        )

    def calculate_confidence(self, direction: str, analysis: Dict[str, Any], z_score: float) -> Tuple[int, List[str]]:
        score = 0
        reasons = []
        volatility = analysis.get('volatility', 0)

        if volatility > 0.002:
            score += 30
            reasons.append(f"Extreme volatility, typical of news event ({volatility:.5f})")
        else:
            score -= 30
            reasons.append("Insufficient volatility for news breakout")

        if direction == 'LONG':
            if analysis.get('bullish_engulfing') or analysis.get('morning_star'):
                score += 20
                reasons.append("Strong bullish rejection post-news")
            
            if analysis.get('liq_sweep_bull'):
                score += 20
                reasons.append("Bullish liquidity sweep during news spike")
                
        elif direction == 'SHORT':
            if analysis.get('bearish_engulfing') or analysis.get('evening_star'):
                score += 20
                reasons.append("Strong bearish rejection post-news")
            
            if analysis.get('liq_sweep_bear'):
                score += 20
                reasons.append("Bearish liquidity sweep during news spike")

        return score, reasons
