import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from config.settings import settings
from api.routes import router
from api.middleware import audit_log_middleware
from stream_consumer import start_consumer_thread

def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME, 
        description=settings.DESCRIPTION,
        version=settings.VERSION
    )

    allowed_origins = os.getenv("CORS_ORIGINS", "*").split(",")
    
    if "*" in allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False, # Must be False if allow_origins is ["*"]
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["*"],
        )
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=allowed_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["*"],
        )

    app.middleware("http")(audit_log_middleware)
    app.include_router(router)
    
    start_consumer_thread()

    return app

app = create_app()

if __name__ == "__main__":
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=settings.PORT, 
        workers=settings.WORKERS,
        timeout_keep_alive=60
    )

