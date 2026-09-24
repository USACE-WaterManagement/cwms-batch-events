import re


def validate_cron(expression: str) -> str:
    """Validate the numeric five-field cron syntax understood by the scheduler."""
    fields = expression.split()
    if len(fields) != 5:
        raise ValueError("scheduleCron must be a five-field cron expression")
    for field, (minimum, maximum) in zip(
        fields, [(0, 59), (0, 23), (1, 31), (1, 12), (0, 7)]
    ):
        for item in field.split(","):
            if not re.fullmatch(r"(?:\*|[0-9]+(?:-[0-9]+)?)(?:/[0-9]+)?", item):
                raise ValueError(f"Invalid cron field: {field}")
            base, *step = item.split("/")
            if step and int(step[0]) < 1:
                raise ValueError("Cron step must be at least 1")
            if base != "*":
                bounds = [int(value) for value in base.split("-")]
                if not minimum <= bounds[0] <= bounds[-1] <= maximum:
                    raise ValueError(f"Cron field out of range: {field}")
                if step and len(bounds) == 1:
                    raise ValueError("Use a range or * before a cron step")
    return " ".join(fields)
