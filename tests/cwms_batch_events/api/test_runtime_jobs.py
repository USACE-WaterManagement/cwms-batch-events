from tests.factories import make_job_record


def test_job_dispatch_uses_saved_command_snapshot(client, job_db, job_queue):
    job = make_job_record(
        execution_type="command",
        runtime="java",
        repo_path="java",
        command_args=["-jar", "/opt/report.jar", "two words"],
    )
    job_db.create_job.return_value = job
    response = client.post(
        "/jobs",
        json={"scriptId": str(job.script_id), "commandArgs": ["untrusted-override"]},
    )
    assert response.status_code == 200
    options = job_queue.create_job_message.call_args.args[3]
    assert options.execution_type == "command"
    assert options.runtime == "java"
    assert options.repo_path == "java"
    assert options.command_args == ["-jar", "/opt/report.jar", "two words"]
