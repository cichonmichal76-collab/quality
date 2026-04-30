from pydantic import BaseModel


class AuthRfidPlaceholder(BaseModel):
    module: str = "auth_rfid"

