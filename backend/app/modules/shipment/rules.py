def list_rules() -> list[str]:
    return [
        "Device must have complete required components",
        "All blocking NCRs must be resolved",
        "Final test must be PASS before READY_FOR_SHIPMENT",
    ]
READY_FOR_SHIPMENT = "READY_FOR_SHIPMENT"
FINAL_TEST_PASSED = "FINAL_TEST_PASSED"
