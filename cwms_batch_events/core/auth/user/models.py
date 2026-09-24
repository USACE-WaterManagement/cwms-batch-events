from pydantic import BaseModel


class User(BaseModel):
    username: str
    display_name: str | None = None
    offices: list[str]
    admin_offices: list[str]
    roles: dict[str, list[str]]
