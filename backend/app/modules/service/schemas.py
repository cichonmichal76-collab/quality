from pydantic import BaseModel


class ServicePlaceholder(BaseModel):
    module: str = "service"

