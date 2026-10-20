import re


def readable_name(*candidates: str | None) -> str:
    """Never expose an EDIPI (including one embedded in a principal) as a name."""
    for candidate in candidates:
        if not isinstance(candidate, str):
            continue
        value = candidate.strip()
        if value and not value.isdecimal() and not re.search(r"\d{10,}", value):
            return value
    return "Name unavailable"
