import hashlib
import os
import shutil
from pathlib import Path
from fastapi import UploadFile

STORAGE_DIR = Path(os.getenv("STORAGE_DIR", "./storage"))


def ensure_storage() -> Path:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    (STORAGE_DIR / "packages").mkdir(parents=True, exist_ok=True)
    (STORAGE_DIR / "files").mkdir(parents=True, exist_ok=True)
    return STORAGE_DIR


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def save_upload(upload: UploadFile, subdir: str, target_name: str) -> tuple[str, str]:
    root = ensure_storage() / subdir
    root.mkdir(parents=True, exist_ok=True)
    path = root / target_name
    with path.open("wb") as out:
        shutil.copyfileobj(upload.file, out)
    return str(path), sha256_file(path)
