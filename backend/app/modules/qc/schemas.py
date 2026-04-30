from pydantic import BaseModel


class QcPlaceholder(BaseModel):
    module: str = "qc"

