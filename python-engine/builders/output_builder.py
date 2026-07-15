from typing import Dict, Any, List
from models.schemas import ValidationResponse, ValidationResponseMetrics

def build_validation_response(
    decision: str, 
    score: int, 
    reasons: List[str], 
    z_score: float, 
    rr_ratio: float, 
    analysis: Dict[str, Any]
) -> ValidationResponse:
    
    metrics = ValidationResponseMetrics(
        volatility=analysis.get('volatility', 0.0),
        z_score=float(z_score),
        rr_ratio=float(rr_ratio),
        trend_slope=analysis.get('trend_slope', 0.0),
        fvg_bull=analysis.get('fvg_bull_active', False),
        fvg_bear=analysis.get('fvg_bear_active', False),
        liq_sweep_bull=analysis.get('liq_sweep_bull', False),
        liq_sweep_bear=analysis.get('liq_sweep_bear', False),
        bos_bull=analysis.get('bos_bull', False),
        bos_bear=analysis.get('bos_bear', False),
        choch_bull=analysis.get('choch_bull', False),
        choch_bear=analysis.get('choch_bear', False)
    )
    
    return ValidationResponse(
        status="success",
        decision=decision,
        quant_score=score,
        metrics=metrics,
        reasons=reasons
    )
