from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class AppError(HTTPException):
    pass


async def http_error_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


async def unhandled_error_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Check server logs for details."},
    )
