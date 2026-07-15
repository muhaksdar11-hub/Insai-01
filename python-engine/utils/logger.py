import logging
import sys

def get_logger(name: str = "insai_python_engine") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        formatter = logging.Formatter("%(asctime)s [%(levelname)s] [INSAI-PYTHON] %(message)s")
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    return logger

logger = get_logger()
