from pydantic import BaseModel


class AssemblyPlaceholder(BaseModel):
    module: str = "assembly"

