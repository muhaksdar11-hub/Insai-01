from fastapi import HTTPException

class InsaiException(Exception):
    pass

class InsaiValidationException(HTTPException):
    def __init__(self, detail: str, status_code: int = 400):
        super().__init__(status_code=status_code, detail=detail)

class InsaiAnalysisException(HTTPException):
    def __init__(self, detail: str, status_code: int = 500):
        super().__init__(status_code=status_code, detail=detail)
