def list_rules() -> list[str]:
    return [
        "Device must satisfy required BOM components from database templates",
        "All blocking NCRs must be resolved",
        "Final test must be PASS before READY_FOR_SHIPMENT",
    ]


READY_FOR_SHIPMENT = "READY_FOR_SHIPMENT"
FINAL_TEST_PASSED = "FINAL_TEST_PASSED"
