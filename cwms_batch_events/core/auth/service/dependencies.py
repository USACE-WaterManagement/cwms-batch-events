from fastapi import HTTPException, Header, status

from cwms_batch_events.core.settings import get_settings

settings = get_settings()


async def require_internal_auth(x_internal_token: str = Header(None)):
    if not settings.app_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal authentication is not configured",
        )
    if not x_internal_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Internal auth header must be provided",
        )
    if x_internal_token != settings.app_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal auth token provided",
        )
