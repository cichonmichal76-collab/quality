REQUIRED_COMPONENT_TYPES_BY_DEVICE_TYPE: dict[str, set[str]] = {
    "ZSS": {"CONTROL_PCB"},
}


def get_required_component_types(device_type: str) -> set[str]:
    return REQUIRED_COMPONENT_TYPES_BY_DEVICE_TYPE.get(device_type, set())


def list_rules() -> list[str]:
    return [
        "Device must have complete required components from assembly links",
        "All blocking NCRs must be resolved",
        "Final test must be PASS before READY_FOR_SHIPMENT",
    ]


READY_FOR_SHIPMENT = "READY_FOR_SHIPMENT"
FINAL_TEST_PASSED = "FINAL_TEST_PASSED"
