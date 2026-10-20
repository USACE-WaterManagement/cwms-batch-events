"""Shared extraction for EventBridge events and DescribeJobs responses."""

STATUS_MAP = {
    "SUBMITTED": "Pending", "PENDING": "Pending", "RUNNABLE": "Pending",
    "STARTING": "Pending", "RUNNING": "Running", "FAILED": "Failed",
    "SUCCEEDED": "Completed",
}


def container_stream(detail: dict) -> str | None:
    stream = detail.get("container", {}).get("logStreamName")
    if stream:
        return stream
    for task in detail.get("ecsProperties", detail).get("taskProperties", []):
        for container in task.get("containers", []):
            if container.get("logStreamName"):
                return container["logStreamName"]
    return None


def log_stream(detail: dict) -> str | None:
    return container_stream(detail) or next(
        (stream for attempt in reversed(detail.get("attempts", []))
         if (stream := container_stream(attempt))), None,
    )
