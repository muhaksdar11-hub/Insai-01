import json
from models.schemas import ValidationRequest, ValidationResponse
from core_engine import CoreEngine
from scoring.quant_scorer import QuantScorer
from builders.output_builder import build_validation_response
from utils.exceptions import InsaiValidationException, InsaiAnalysisException
from shared_utilities import get_logger

logger = get_logger("SignalValidator")
core_engine_instance = CoreEngine()

def validate_signal(req: ValidationRequest) -> ValidationResponse:
    logger.info(f"Start validation for {req.symbol} {req.timeframe} (Direction: {req.direction})")
    
    if not req.candles or len(req.candles) < 30:
        logger.warning("Validation rejected: Insufficient candle data (need >= 30)")
        raise InsaiValidationException("Insufficient candle data (need >= 30)")
    
    last_candle = req.candles[-1]
    cache_key = f"{req.symbol}_{req.timeframe}_{last_candle.timestamp}_{last_candle.close}_{last_candle.volume}"
    
    try:
        analysis = core_engine_instance.analyze(req.candles, cache_key=cache_key)
    except ValueError as e:
        logger.warning(f"Validation rejected: {e}")
        raise InsaiValidationException(str(e))
    except Exception as e:
        logger.error(f"Error analyzing market structure: {e}")
        raise InsaiAnalysisException(f"Analysis failed: {str(e)}")
        
    try:
        scorer = QuantScorer(
            direction=req.direction,
            entry_price=req.entry_price,
            sl_price=req.sl_price,
            tp_price=req.tp_price,
            analysis=analysis,
            timeframe=req.timeframe,
            strategy_id=req.strategy_id
        )
        
        decision, score, reasons, z_score, rr_ratio = scorer.score_setup()
        response = build_validation_response(decision, score, reasons, z_score, rr_ratio, analysis)
        logger.info(f"Validation successful. Final decision: {decision}")
        return response
    except Exception as e:
        logger.error(f"Error in scoring setup: {e}")
        raise InsaiValidationException(f"Scoring failed: {str(e)}")
