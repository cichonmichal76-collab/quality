from pydantic import BaseModel


class TraceabilityPlaceholder(BaseModel):
    module: str = "traceability"

