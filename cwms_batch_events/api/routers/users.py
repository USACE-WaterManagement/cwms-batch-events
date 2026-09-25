from fastapi import APIRouter, Depends

from cwms_batch_events.api.dependencies import get_current_user
from cwms_batch_events.core.auth.user.models import User


router = APIRouter(prefix="/users", tags=["scripts"])


@router.get("/me/system-admin")
def get_system_admin(user: User = Depends(get_current_user)) -> bool:
    return "CWMS Admin" in user.roles.get("HQ", [])


@router.get("/me/admin-offices")
def get_admin_offices(
    user: User = Depends(get_current_user),
) -> list[str]:
    return user.admin_offices
