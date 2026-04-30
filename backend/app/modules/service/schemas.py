from pydantic import BaseModel


class ServicePlaceholder(BaseModel):
    module: str = "service"
"""Service sessions korzystaja obecnie ze wspoldzielonych schematow z app.schemas."""
