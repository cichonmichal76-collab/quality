from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.nonconformities import service
from app.schemas import NonconformityCreate, NonconformityRead, NonconformityUpdate

router = APIRouter(tags=["nonconformities"])


@router.post("/nonconformities", response_model=NonconformityRead)
def create_ncr(payload: NonconformityCreate, db: Session = Depends(get_db)):
    return service.create_ncr(db, payload)


@router.get("/nonconformities", response_model=list[NonconformityRead])
def list_ncr(db: Session = Depends(get_db)):
    return service.list_ncr(db)


@router.get("/nonconformities/{ncr_id}", response_model=NonconformityRead)
def get_ncr(ncr_id: str, db: Session = Depends(get_db)):
    return service.get_ncr_or_404(db, ncr_id)


@router.patch("/nonconformities/{ncr_id}", response_model=NonconformityRead)
def update_ncr(ncr_id: str, payload: NonconformityUpdate, db: Session = Depends(get_db)):
    return service.update_ncr(db, ncr_id, payload)
