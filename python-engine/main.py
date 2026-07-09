import logging
import sys
import os
import time
import platform
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [INSAI-PYTHON] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("insai_python_engine")

app = FastAPI(
    title="INSAI Python Engine", 
    description="Quantitative Rule Validator Engine for INSAI Signals (Health endpoint)",
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
        "dependencies": ["fastapi", "uvicorn"],
        "python_version": platform.python_version()
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PYTHON_PORT", os.environ.get("PORT", 8181)))
    uvicorn.run(app, host="0.0.0.0", port=port)
