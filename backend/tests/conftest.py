import pytest

from app.db import Base, engine
import app.models  # noqa: F401


@pytest.fixture(scope="session", autouse=True)
def prepare_database() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
