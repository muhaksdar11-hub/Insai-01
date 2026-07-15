from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class Candle(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float

class ValidationRequest(BaseModel):
    symbol: str
    timeframe: str
    direction: str
    entry_price: float
    sl_price: float
    tp_price: float
    candles: List[Candle]
    strategy_id: Optional[str] = None

class AnalysisResult(BaseModel):
    fvg_bull_active: bool
    fvg_bear_active: bool
    bullish_engulfing: bool
    bearish_engulfing: bool
    morning_star: bool
    evening_star: bool
    double_top: bool
    double_bottom: bool
    bos_bull: bool
    bos_bear: bool
    choch_bull: bool
    choch_bear: bool
    liq_sweep_bull: bool
    liq_sweep_bear: bool
    ob_bull: bool
    ob_bear: bool
    volatility: float
    ma_20: float
    std_20: float
    trend_slope: float

class ValidationResponseMetrics(BaseModel):
    volatility: float
    z_score: float
    rr_ratio: float
    trend_slope: float
    fvg_bull: bool
    fvg_bear: bool
    liq_sweep_bull: bool
    liq_sweep_bear: bool
    bos_bull: bool
    bos_bear: bool
    choch_bull: bool
    choch_bear: bool

class ValidationResponse(BaseModel):
    status: str
    decision: str
    quant_score: int
    metrics: ValidationResponseMetrics
    reasons: List[str]
