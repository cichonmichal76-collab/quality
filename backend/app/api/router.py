from fastapi import APIRouter

from app.api.routes import router as legacy_router
from app.modules.assembly.router import router as assembly_router
from app.modules.auth_rfid.router import router as auth_rfid_router
from app.modules.files.router import router as files_router
from app.modules.final_test.router import router as final_test_router
from app.modules.qc.router import router as qc_router
from app.modules.service.router import router as service_router
from app.modules.shipment.router import router as shipment_router
from app.modules.traceability.router import router as traceability_router

api_router = APIRouter()
api_router.include_router(auth_rfid_router)
api_router.include_router(traceability_router)
api_router.include_router(qc_router)
api_router.include_router(assembly_router)
api_router.include_router(final_test_router)
api_router.include_router(shipment_router)
api_router.include_router(service_router)
api_router.include_router(files_router)

# Przejściowo zachowujemy stary router, dopóki endpointy nie zostaną przeniesione do modułów.
api_router.include_router(legacy_router)

