import time
from fastapi import Request
from utils.logger import logger

async def audit_log_middleware(request: Request, call_next):
    start = time.perf_counter()
    try:
        response = await call_next(request)
        process_time = time.perf_counter() - start
        response.headers["X-Process-Time"] = str(process_time)
        return response
    except Exception as e:
        logger.error(f"Request failed: {request.method} {request.url.path} - Error: {str(e)}")
        raise
