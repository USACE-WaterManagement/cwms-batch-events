from unittest.mock import MagicMock

from sqlalchemy.dialects import postgresql

from cwms_batch_events.core.job_database.postgres.postgres import PostgresJobDatabase


def test_job_page_limits_database_query_and_uses_stable_user_scoped_order():
    session = MagicMock()
    session.scalars.return_value.all.return_value = []
    database = PostgresJobDatabase(session)

    assert database.get_jobs_for_user("alice", limit=10, offset=20) == []

    query = session.scalars.call_args.args[0].compile(
        dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
    )
    sql = str(query)
    assert "WHERE jobs.username = 'alice'" in sql
    assert "ORDER BY jobs.created_time DESC, jobs.id DESC" in sql
    assert "LIMIT 10 OFFSET 20" in sql


def test_job_count_is_scoped_to_the_same_user():
    session = MagicMock()
    session.scalar.return_value = 23
    assert PostgresJobDatabase(session).count_jobs_for_user("alice") == 23
    query = session.scalar.call_args.args[0].compile(
        dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
    )
    assert "count(*)" in str(query)
    assert "WHERE jobs.username = 'alice'" in str(query)
