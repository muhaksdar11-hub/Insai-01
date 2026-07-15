import logging
from typing import List, Any

# Dictionary to store active loggers and avoid duplication
_loggers = {}

def get_logger(name: str) -> logging.Logger:
    """Returns a configured logger with standard formatting."""
    if name in _loggers:
        return _loggers[name]
        
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        
    _loggers[name] = logger
    return logger
