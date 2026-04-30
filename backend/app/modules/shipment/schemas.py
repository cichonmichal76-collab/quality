from pydantic import BaseModel


class ShipmentPlaceholder(BaseModel):
    module: str = "shipment"

