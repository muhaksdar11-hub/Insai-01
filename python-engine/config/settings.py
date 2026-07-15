import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    VERSION = "2.2.0"
    PORT = int(os.environ.get("PYTHON_PORT", 8181))
    WORKERS = int(os.environ.get("WORKERS", 1))
    APP_NAME = "INSAI Python Engine"
    DESCRIPTION = "High-Performance Quantitative & SMC Validator Engine"
    CACHE_SIZE = 512

settings = Settings()
