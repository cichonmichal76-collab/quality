from pydantic import BaseModel


class FilesPlaceholder(BaseModel):
    module: str = "files"

