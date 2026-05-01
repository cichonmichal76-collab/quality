from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session", autouse=True)
def prepare_database() -> None:
    yield


def test_bootstrapped_dashboard_dataset_is_available() -> None:
    if os.environ.get("SERVICE_TRACE_BOOTSTRAP_SMOKE") != "1":
        pytest.skip("requires pre-bootstrapped database dataset")

    device_type = os.environ.get("SERVICE_TRACE_BOOTSTRAP_DEVICE_TYPE", "DEMO-CI")
    client = TestClient(app)

    shipment = client.get(f"/api/shipment-readiness?device_type={device_type}")
    assert shipment.status_code == 200
    shipment_payload = shipment.json()
    assert shipment_payload["filters"]["device_type"] == device_type
    assert shipment_payload["total_devices"] == 6
    assert shipment_payload["ready_count"] == 1
    assert shipment_payload["blocked_count"] == 5
    assert shipment_payload["returned_count"] == 6
    assert shipment_payload["has_more"] is False
    assert shipment_payload["next_offset"] is None
    shipment_actions = {
        row["recommended_action"] for row in shipment_payload["recommended_action_summary"]
    }
    assert shipment_actions == {
        "MARK_READY_FOR_SHIPMENT",
        "COMPLETE_ASSEMBLY",
        "RUN_FINAL_TEST",
        "RESOLVE_COMPONENT_QUALITY",
        "RESOLVE_CRITICAL_NCR",
    }

    components = client.get(f"/api/component-quality?device_type={device_type}")
    assert components.status_code == 200
    component_payload = components.json()
    assert component_payload["filters"]["device_type"] == device_type
    assert component_payload["total_devices"] == 6
    assert component_payload["devices_with_issues"] == 2
    assert component_payload["returned_count"] == 6
    assert component_payload["has_more"] is False
    assert component_payload["next_offset"] is None
    primary_statuses = {
        row["primary_quality_status"]
        for row in component_payload["primary_quality_status_summary"]
    }
    assert primary_statuses == {"PASS", "QC_NOT_PASSED", "CRITICAL_NCR_OPEN"}
