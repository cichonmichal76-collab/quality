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

    shipment_ready_only = client.get(
        f"/api/shipment-readiness?device_type={device_type}&only_ready=true"
    )
    assert shipment_ready_only.status_code == 200
    shipment_ready_payload = shipment_ready_only.json()
    assert shipment_ready_payload["total_devices"] == 1
    assert shipment_ready_payload["ready_count"] == 1
    assert shipment_ready_payload["blocked_count"] == 0
    assert shipment_ready_payload["returned_count"] == 1
    assert shipment_ready_payload["has_more"] is False
    assert shipment_ready_payload["next_offset"] is None
    assert shipment_ready_payload["filters"]["only_ready"] is True
    assert shipment_ready_payload["devices"][0]["can_transition_to_ready_for_shipment"] is True
    assert shipment_ready_payload["devices"][0]["recommended_action"] == "MARK_READY_FOR_SHIPMENT"

    shipment_page_one = client.get(
        f"/api/shipment-readiness?device_type={device_type}&sort_by=device_serial_number&limit=2"
    )
    assert shipment_page_one.status_code == 200
    shipment_page_one_payload = shipment_page_one.json()
    assert shipment_page_one_payload["returned_count"] == 2
    assert shipment_page_one_payload["has_more"] is True
    assert shipment_page_one_payload["next_offset"] == 2
    assert shipment_page_one_payload["filters"]["limit"] == 2
    assert shipment_page_one_payload["devices"][0]["device_serial_number"].startswith("ASM-")
    assert shipment_page_one_payload["devices"][1]["device_serial_number"].startswith("CN-")

    shipment_page_two = client.get(
        f"/api/shipment-readiness?device_type={device_type}&sort_by=device_serial_number&limit=2&offset=2"
    )
    assert shipment_page_two.status_code == 200
    shipment_page_two_payload = shipment_page_two.json()
    assert shipment_page_two_payload["returned_count"] == 2
    assert shipment_page_two_payload["has_more"] is True
    assert shipment_page_two_payload["next_offset"] == 4
    assert shipment_page_two_payload["filters"]["offset"] == 2
    assert shipment_page_two_payload["devices"][0]["device_serial_number"].startswith("CQ-")
    assert shipment_page_two_payload["devices"][1]["device_serial_number"].startswith("DN-")

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

    component_blocking_only = client.get(
        f"/api/component-quality?device_type={device_type}&only_blocking=true"
    )
    assert component_blocking_only.status_code == 200
    component_blocking_payload = component_blocking_only.json()
    assert component_blocking_payload["total_devices"] == 2
    assert component_blocking_payload["devices_with_issues"] == 2
    assert component_blocking_payload["returned_count"] == 2
    assert component_blocking_payload["has_more"] is False
    assert component_blocking_payload["next_offset"] is None
    assert component_blocking_payload["filters"]["only_blocking"] is True
    assert {
        row["primary_quality_status"] for row in component_blocking_payload["devices"]
    } == {"QC_NOT_PASSED", "CRITICAL_NCR_OPEN"}

    component_page_one = client.get(
        f"/api/component-quality?device_type={device_type}&only_blocking=true&sort_by=device_serial_number&limit=1"
    )
    assert component_page_one.status_code == 200
    component_page_one_payload = component_page_one.json()
    assert component_page_one_payload["returned_count"] == 1
    assert component_page_one_payload["has_more"] is True
    assert component_page_one_payload["next_offset"] == 1
    assert component_page_one_payload["devices"][0]["device_serial_number"].startswith("CN-")

    component_page_two = client.get(
        f"/api/component-quality?device_type={device_type}&only_blocking=true&sort_by=device_serial_number&limit=1&offset=1"
    )
    assert component_page_two.status_code == 200
    component_page_two_payload = component_page_two.json()
    assert component_page_two_payload["returned_count"] == 1
    assert component_page_two_payload["has_more"] is False
    assert component_page_two_payload["next_offset"] is None
    assert component_page_two_payload["filters"]["offset"] == 1
    assert component_page_two_payload["devices"][0]["device_serial_number"].startswith("CQ-")
