from fastapi import FastAPI
from app.api import api_router

app = FastAPI(title="ServiceTrace API", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(api_router, prefix="/api")
