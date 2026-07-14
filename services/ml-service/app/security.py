from fastapi import Header, HTTPException

from app.config import settings


def require_service_token(authorization: str = Header(default="")) -> None:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Missing bearer token"})
    token = authorization[7:]
    if token != settings.service_token:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Invalid service token"})
