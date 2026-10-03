from cwms_batch_events.core.job_database.postgres.models import (
    JobRunnerModel,
    NotificationTemplateModel,
)


def test_canonical_template_and_runner_columns_match_the_database_contract():
    assert "active" not in NotificationTemplateModel.__table__.columns
    assert "active" in JobRunnerModel.__table__.columns
