from typing import Tuple, List, Dict, Any
from strategy_engine import StrategyEngine
from shared_utilities import get_logger

logger = get_logger("QuantScorer")

class QuantScorer:
    def __init__(self, direction: str, entry_price: float, sl_price: float, tp_price: float, analysis: Dict[str, Any], timeframe: str = "15m", strategy_id: str = None):
        self.direction = direction.upper()
        self.entry_price = entry_price
        self.sl_price = sl_price
        self.tp_price = tp_price
        self.timeframe = timeframe
        self.analysis = analysis
        self.score = 0
        self.reasons: List[str] = []
        self.z_score = 0.0
        self.rr_ratio = 0.0
        self.strategy_id = strategy_id
        self.strategy_engine = StrategyEngine()

    def calculate_metrics(self):
        if self.analysis.get('std_20', 0) > 0:
            self.z_score = (self.entry_price - self.analysis['ma_20']) / self.analysis['std_20']
            
        risk = abs(self.entry_price - self.sl_price)
        reward = abs(self.tp_price - self.entry_price)
        self.rr_ratio = reward / risk if risk > 0 else 0

    def evaluate_rr(self):
        if self.rr_ratio >= 2.0:
            self.score += 20
            self.reasons.append(f"Excellent Risk/Reward ({self.rr_ratio:.2f})")
        elif self.rr_ratio >= 1.5:
            self.score += 10
            self.reasons.append(f"Good Risk/Reward ({self.rr_ratio:.2f})")
        elif self.rr_ratio >= 1.0:
            self.score += 0
            self.reasons.append(f"Acceptable Risk/Reward ({self.rr_ratio:.2f})")
        else:
            self.score -= 80  # Heavy penalty for poor RR
            self.reasons.append(f"Unacceptable Risk/Reward ({self.rr_ratio:.2f})")

    def evaluate_market_conditions(self):
        volatility = self.analysis.get('volatility', 0.0)
        slope = self.analysis.get('trend_slope', 0.0)

        if volatility < 0.0001:
            self.score -= 30
            self.reasons.append(f"Low Volatility Penalty ({volatility:.5f})")
        elif volatility > 0.005:
            self.score -= 20
            self.reasons.append(f"High Volatility/Choppy Penalty ({volatility:.5f})")

        # Basic trend alignment filter
        if self.direction == 'LONG' and slope < -0.01:
            self.score -= 25
            self.reasons.append("Fighting strong downtrend")
        elif self.direction == 'SHORT' and slope > 0.01:
            self.score -= 25
            self.reasons.append("Fighting strong uptrend")

        # Structure confluence
        if self.direction == 'LONG' and self.analysis.get('bos_bear') and not self.analysis.get('choch_bull'):
             self.score -= 40
             self.reasons.append("Entering LONG after Bearish BOS without Bullish CHoCH")
        if self.direction == 'SHORT' and self.analysis.get('bos_bull') and not self.analysis.get('choch_bear'):
             self.score -= 40
             self.reasons.append("Entering SHORT after Bullish BOS without Bearish CHoCH")

    def get_decision(self) -> str:
        if self.score >= 85: # Increased threshold for high probability
            return "APPROVED"
        elif self.score >= 60:
            return "WAIT"
        return "REJECTED"

    def score_setup(self) -> Tuple[str, int, List[str], float, float]:
        logger.info("Calculating metrics and RR for setup...")
        self.calculate_metrics()
        self.evaluate_rr()
        self.evaluate_market_conditions()
        
        logger.info("Passing analysis to Strategy Engine...")
        strat_score, strat_reasons = self.strategy_engine.run_all(
            direction=self.direction,
            analysis=self.analysis,
            z_score=self.z_score,
            timeframe=self.timeframe,
            entry=self.entry_price,
            sl=self.sl_price,
            tp=self.tp_price,
            target_strat_id=self.strategy_id
        )
        
        self.score += strat_score
        self.reasons.extend(strat_reasons)
        decision = self.get_decision()
        
        logger.info(f"Scoring completed. Final Decision: {decision}, Score: {self.score}")
        return decision, self.score, self.reasons, self.z_score, self.rr_ratio

