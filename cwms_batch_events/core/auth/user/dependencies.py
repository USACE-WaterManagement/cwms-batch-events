from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer

from cachetools import TTLCache
from cwms_batch_events.core.auth.user.jwt import verify_jwt
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.auth.user.roles import (
    CdaUserProfileError,
    get_user_admin_offices,
    get_user_allowed_offices,
    get_user_profile_apikey,
    get_user_profile_jwt,
)
from cwms_batch_events.core.utils import ALL_OFFICES, ALL_OFFICE_ROLES

bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="Keycloak JWT",
    description="Enter a valid JWT below (do not include Bearer)",
)

api_key_scheme = APIKeyHeader(
    name="Authorization",
    auto_error=False,
    scheme_name="CDA API Key",
    description="Use format: apikey <your-api-key>",
)

user_cache: TTLCache[str, User] = TTLCache(maxsize=1024, ttl=300)


async def get_auth_header_for_docs(
    bearer: str = Depends(bearer_scheme),
    api_key: str = Depends(api_key_scheme),
):
    return bearer or api_key


async def get_auth_credentials(
    request: Request, _: str = Depends(get_auth_header_for_docs)
) -> HTTPAuthorizationCredentials:
    header = request.headers.get("Authorization")
    if not header:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    parts = header.split()
    if len(parts) != 2:
        raise HTTPException(status_code=401, detail="Invalid Authorization header")
    return HTTPAuthorizationCredentials(scheme=parts[0], credentials=parts[1])


async def get_current_user_cwms(
    credentials: HTTPAuthorizationCredentials = Depends(get_auth_credentials),
) -> User:
    cache_key = f"{credentials.scheme}:{credentials.credentials}"
    if cache_key in user_cache:
        return user_cache[cache_key]

    if credentials.scheme.lower() == "bearer":
        token = credentials.credentials
        try:
            claims = verify_jwt(token)
            azp = claims.get("azp", "")
            if claims["azp"] != "cwms":
                raise Exception(f"Client '{azp}' is not authorized for this API")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token: {str(e)}",
            )
        try:
            cda_user = get_user_profile_jwt(token)
        except CdaUserProfileError as exc:
            raise HTTPException(
                status_code=exc.status_code,
                detail=exc.detail,
            ) from exc
    elif credentials.scheme.lower() == "apikey":
        apikey = credentials.credentials
        try:
            cda_user = get_user_profile_apikey(apikey)
        except CdaUserProfileError as exc:
            raise HTTPException(
                status_code=exc.status_code,
                detail=exc.detail,
            ) from exc
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Unsupported auth scheme: {credentials.scheme}",
        )

    allowed_offices = get_user_allowed_offices(cda_user)
    admin_offices = get_user_admin_offices(cda_user)
    user = User(
        username=cda_user.user_name,
        offices=allowed_offices,
        admin_offices=admin_offices,
        roles=cda_user.roles,
    )

    user_cache[cache_key] = user
    return user


async def get_current_user_mock() -> User:
    return User(
        username="dev-user",
        offices=ALL_OFFICES,
        admin_offices=ALL_OFFICES,
        roles=ALL_OFFICE_ROLES,
    )
