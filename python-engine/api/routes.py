import time
import platform
from fastapi import APIRouter, HTTPException
from models.schemas import ValidationRequest, ValidationResponse
from validation.signal_validator import validate_signal
from config.settings import settings
from utils.exceptions import InsaiValidationException
from utils.logger import logger
from strategy.smc_sd_confluence_engine import SMCSDConfluenceEngine

router = APIRouter()
START_TIME = time.time()

engine = SMCSDConfluenceEngine()

@router.post("/v1/strategy/smc-sd-confluence")
async def smc_sd_confluence_endpoint(data: dict):
    try:
        return engine.run(data)
    except Exception as e:
        logger.error(f"SMC-SD Confluence error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
def health():
    uptime_seconds = time.time() - START_TIME
    return {
        "status": "ok", 
        "uptime": uptime_seconds,
        "version": settings.VERSION,
        "dependencies": ["fastapi", "uvicorn", "numpy"],
        "python_version": platform.python_version()
    }

@router.get("/ready")
def ready():
    try:
        from core_engine import CoreEngine
        from strategy_engine import StrategyEngine
        # Just instantiate to see if dependencies and modules load
        ce = CoreEngine()
        se = StrategyEngine()
        if not ce or not se:
            raise ValueError("Engine instantiation failed")
        return {"status": "ready"}
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        raise HTTPException(status_code=503, detail="Service unavailable")

@router.post("/validate", response_model=ValidationResponse)
@router.post("/v1/predict", response_model=ValidationResponse)
async def validate_endpoint(req: ValidationRequest):
    try:
        return validate_signal(req)
    except InsaiValidationException as e:
        logger.warning(f"Validation error: {e.detail}")
        raise e
    except Exception as e:
        logger.error(f"Internal server error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
