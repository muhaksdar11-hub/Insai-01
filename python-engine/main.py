import logging
import sys
import os
import time
import platform
import numpy as np
import pandas as pd
from scipy import stats
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [INSAI-PYTHON] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("insai_python_engine")

app = FastAPI(
    title="INSAI Python Engine", 
    description="Quantitative Rule Validator Engine for INSAI Signals",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

START_TIME = time.time()

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

@app.middleware("http")
async def audit_log_middleware(request: Request, call_next):
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        logger.error(f"Request failed: {request.method} {request.url.path} - Error: {str(e)}")
        raise

@app.get("/health")
def health():
    uptime_seconds = time.time() - START_TIME
    return {
        "status": "ok", 
        "uptime": uptime_seconds,
        "version": "2.0.0",
        "dependencies": ["fastapi", "uvicorn", "numpy", "pandas", "scipy"],
        "python_version": platform.python_version()
    }

@app.post("/validate")
def validate_signal(req: ValidationRequest):
    if not req.candles or len(req.candles) < 20:
        raise HTTPException(status_code=400, detail="Insufficient candle data for quantitative analysis (need >= 20)")
    
    # Convert to pandas DataFrame
    df = pd.DataFrame([c.dict() for c in req.candles])
    df['close'] = df['close'].astype(float)
    df['high'] = df['high'].astype(float)
    df['low'] = df['low'].astype(float)
    df['open'] = df['open'].astype(float)
    
    # Calculate basic quantitative metrics
    # 1. Volatility (Standard Deviation of returns)
    df['returns'] = df['close'].pct_change()
    volatility = df['returns'].std()
    
    # 2. Z-Score of the entry price relative to recent moving average
    ma_20 = df['close'].rolling(window=20).mean().iloc[-1]
    std_20 = df['close'].rolling(window=20).std().iloc[-1]
    
    if std_20 > 0:
        z_score = (req.entry_price - ma_20) / std_20
    else:
        z_score = 0
        
    # 3. Risk/Reward Ratio validation
    risk = abs(req.entry_price - req.sl_price)
    reward = abs(req.tp_price - req.entry_price)
    rr_ratio = reward / risk if risk > 0 else 0
    
    # 4. Trend Alignment (Linear Regression slope over last 20 periods)
    y = df['close'].tail(20).values
    x = np.arange(len(y))
    slope, intercept, r_value, p_value, std_err = stats.linregress(x, y)
    
    # Evaluate quantitative rules
    quant_score = 0
    reasons = []
    
    # Check Risk/Reward
    if rr_ratio >= 1.5:
        quant_score += 30
        reasons.append(f"Strong Risk/Reward ({rr_ratio:.2f})")
    elif rr_ratio >= 1.0:
        quant_score += 10
        reasons.append(f"Acceptable Risk/Reward ({rr_ratio:.2f})")
    else:
        reasons.append(f"Poor Risk/Reward ({rr_ratio:.2f})")
        
    # Check Trend Alignment
    if req.direction.upper() == 'LONG' and slope > 0:
        quant_score += 40
        reasons.append("Trend alignment positive (Upward slope)")
    elif req.direction.upper() == 'SHORT' and slope < 0:
        quant_score += 40
        reasons.append("Trend alignment positive (Downward slope)")
    else:
        reasons.append(f"Trading against short-term linear trend (Slope: {slope:.4f})")
        
    # Check Mean Reversion / Z-Score extremes
    if req.direction.upper() == 'LONG' and z_score < -1.5:
        quant_score += 30
        reasons.append(f"Oversold condition supports LONG (Z-Score: {z_score:.2f})")
    elif req.direction.upper() == 'SHORT' and z_score > 1.5:
        quant_score += 30
        reasons.append(f"Overbought condition supports SHORT (Z-Score: {z_score:.2f})")
    elif abs(z_score) < 1.0:
        quant_score += 15
        reasons.append(f"Entry near mean (Z-Score: {z_score:.2f})")
        
    # Decision Logic
    decision = "APPROVED" if quant_score >= 60 else "WAIT" if quant_score >= 40 else "REJECTED"
    
    return {
        "status": "success",
        "decision": decision,
        "quant_score": quant_score,
        "metrics": {
            "volatility": float(volatility) if not pd.isna(volatility) else 0,
            "z_score": float(z_score),
            "rr_ratio": float(rr_ratio),
            "trend_slope": float(slope)
        },
        "reasons": reasons
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PYTHON_PORT", 8181))
    uvicorn.run(app, host="0.0.0.0", port=port)
