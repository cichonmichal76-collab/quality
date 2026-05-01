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


def test_dev_dashboard_demo_bootstraps_local_dashboard(tmp_path):
    repo_dir = Path(__file__).resolve().parents[2]
    backend_dir = repo_dir / "backend"
    database_path = tmp_path / "dashboard-demo.db"
    database_url = f"sqlite:///{database_path.as_posix()}"
    device_type = "DEMO-BOOTSTRAP-TEST"
    environment = os.environ.copy()

    bootstrap = subprocess.run(
        [
            sys.executable,
            "scripts/dev_dashboard_demo.py",
            "--database-url",
            database_url,
            "--device-type",
            device_type,
            "--tag",
            "BOOT",
            "--no-server",
        ],
        cwd=repo_dir,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert bootstrap.returncode == 0, (
        "Dashboard bootstrap script failed.\n"
        f"stdout:\n{bootstrap.stdout}\n"
        f"stderr:\n{bootstrap.stderr}"
    )
    assert "Demo dashboardu przygotowane. Backend nie został uruchomiony." in bootstrap.stdout
    assert f"DATABASE_URL={database_url}" in bootstrap.stdout
    assert database_path.exists()

    verification_code = f"""
import json
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
shipment = client.get("/api/shipment-readiness?device_type={device_type}").json()
components = client.get("/api/component-quality?device_type={device_type}").json()
print(json.dumps({{
    "shipment_total": shipment["total_devices"],
    "shipment_ready": shipment["ready_count"],
    "shipment_actions": sorted({{row["recommended_action"] for row in shipment["devices"]}}),
    "component_total": components["total_devices"],
    "component_issue_count": components["devices_with_issues"],
    "component_primary_statuses": sorted({{row["primary_quality_status"] for row in components["devices"]}}),
}}))
"""
    verification_environment = environment.copy()
    verification_environment["DATABASE_URL"] = database_url
    verification = subprocess.run(
        [sys.executable, "-c", verification_code],
        cwd=backend_dir,
        env=verification_environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert verification.returncode == 0, (
        "Dashboard bootstrap verification failed.\n"
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
