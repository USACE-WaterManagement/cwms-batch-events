from fastapi import APIRouter, Depends

from cwms_batch_events.api.dependencies import get_current_user
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.models import DefaultJobRunner
from cwms_batch_events.core.utils import get_runner_id, get_runner_slug

router = APIRouter(prefix="/job-runners", tags=["job-runners"])


@router.get("/default")
def get_default_job_runner(_: User = Depends(get_current_user)) -> DefaultJobRunner:
    return DefaultJobRunner(id=get_runner_id(), slug=get_runner_slug())
