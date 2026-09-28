from unittest import mock

from cwms_batch_events.core.utils import BATCH_RUNNER_ID, LOCAL_RUNNER_ID, get_runner_id


def test_get_runner_id_returns_local_runner_for_docker_local():
    with mock.patch(
        "cwms_batch_events.core.utils.get_settings", return_value=mock.Mock(default_job_runner="docker-local")
    ):
        assert str(get_runner_id()) == LOCAL_RUNNER_ID


def test_get_runner_id_returns_batch_runner_by_default():
    with mock.patch("cwms_batch_events.core.utils.get_settings", return_value=mock.Mock(default_job_runner="batch")):
        assert str(get_runner_id()) == BATCH_RUNNER_ID
