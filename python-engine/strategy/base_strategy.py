from typing import Dict, Any, List, Tuple
from abc import ABC, abstractmethod
from pydantic import BaseModel

class StrategyMetadata(BaseModel):
    id: str
    name: str
    priority: int
    version: str
    dependencies: List[str] = []
    required_indicators: List[str] = []
    required_timeframes: List[str] = []
    required_market_conditions: List[str] = []
    required_confirmations: List[str] = []

class BaseStrategy(ABC):
    @property
    @abstractmethod
    def metadata(self) -> StrategyMetadata:
        raise NotImplementedError("Subclasses must implement metadata")

    def validate(self, timeframe: str, analysis: Dict[str, Any]) -> bool:
        meta = self.metadata
        if meta.required_timeframes and timeframe not in meta.required_timeframes:
            return False
        return True

    def validate_risk(self, entry: float, sl: float, tp: float) -> bool:
        risk = abs(entry - sl)
        reward = abs(tp - entry)
        if risk == 0:
            return False
        return (reward / risk) >= 1.0

    @abstractmethod
    def calculate_confidence(self, direction: str, analysis: Dict[str, Any], z_score: float) -> Tuple[int, List[str]]:
        raise NotImplementedError("Subclasses must implement calculate_confidence")

    def evaluate(self, direction: str, analysis: Dict[str, Any], z_score: float) -> Tuple[int, List[str]]:
        return self.calculate_confidence(direction, analysis, z_score)
