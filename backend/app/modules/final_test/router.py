from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.final_test import service
from app.schemas import FinalTestCreate, FinalTestRead

router = APIRouter(tags=["final-test"])


@router.post("/final-tests", response_model=FinalTestRead)
def create_final_test(payload: FinalTestCreate, db: Session = Depends(get_db)):
    return service.create_final_test(db, payload)


@router.get("/final-tests/{test_run_id}", response_model=FinalTestRead)
def get_final_test(test_run_id: str, db: Session = Depends(get_db)):
    return service.get_final_test_or_404(db, test_run_id)


@router.post("/final-tests/{test_run_id}/complete", response_model=FinalTestRead)
def complete_final_test(test_run_id: str, db: Session = Depends(get_db)):
    return service.complete_final_test(db, test_run_id)
