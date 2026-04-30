from pydantic import BaseModel


class FilesPlaceholder(BaseModel):
    module: str = "files"
"""Pliki korzystaja obecnie ze wspoldzielonych schematow z app.schemas."""
