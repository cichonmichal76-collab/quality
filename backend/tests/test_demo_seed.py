from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest


@pytest.fixture(scope="session", autouse=True)
def prepare_database() -> None:
    yield


def test_demo_seed_populates_dashboard_queues(tmp_path):
    backend_dir = Path(__file__).resolve().parents[1]
    database_path = tmp_path / "demo-seed.db"
    environment = os.environ.copy()
    environment["DATABASE_URL"] = f"sqlite:///{database_path.as_posix()}"

    migration = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=backend_dir,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert migration.returncode == 0, (
        "Alembic upgrade head failed before seeding demo data.\n"
        f"stdout:\n{migration.stdout}\n"
        f"stderr:\n{migration.stderr}"
    )

    seeded_device_type = "DEMO-SEED-TEST"
    seed = subprocess.run(
        [
            sys.executable,
            "-m",
            "app.services.demo_seed",
            "--device-type",
            seeded_device_type,
            "--tag",
            "TEST",
        ],
        cwd=backend_dir,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert seed.returncode == 0, (
        "Demo seed script failed.\n"
        f"stdout:\n{seed.stdout}\n"
        f"stderr:\n{seed.stderr}"
    )

    payload = json.loads(seed.stdout)
    assert payload["device_type"] == seeded_device_type

    verification_code = f"""
import json
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
shipment = client.get("/api/shipment-readiness?device_type={seeded_device_type}").json()
components = client.get("/api/component-quality?device_type={seeded_device_type}").json()
print(json.dumps({{
    "shipment_total": shipment["total_devices"],
    "shipment_ready": shipment["ready_count"],
    "shipment_actions": sorted({{row["recommended_action"] for row in shipment["devices"]}}),
    "component_total": components["total_devices"],
    "component_issue_count": components["devices_with_issues"],
    "component_primary_statuses": sorted({{row["primary_quality_status"] for row in components["devices"]}}),
}}))
"""
    verification = subprocess.run(
        [sys.executable, "-c", verification_code],
        cwd=backend_dir,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert verification.returncode == 0, (
        "Seed verification failed.\n"
        f"stdout:\n{verification.stdout}\n"
        f"stderr:\n{verification.stderr}"
    )

    summary = json.loads(verification.stdout)
    assert summary["shipment_total"] == 6
    assert summary["shipment_ready"] == 1
    assert "MARK_READY_FOR_SHIPMENT" in summary["shipment_actions"]
    assert "COMPLETE_ASSEMBLY" in summary["shipment_actions"]
    assert "RUN_FINAL_TEST" in summary["shipment_actions"]
    assert "RESOLVE_COMPONENT_QUALITY" in summary["shipment_actions"]
    assert "RESOLVE_CRITICAL_NCR" in summary["shipment_actions"]
    assert summary["component_total"] == 6
    assert summary["component_issue_count"] >= 2
    assert "CRITICAL_NCR_OPEN" in summary["component_primary_statuses"]
    assert "QC_NOT_PASSED" in summary["component_primary_statuses"]
