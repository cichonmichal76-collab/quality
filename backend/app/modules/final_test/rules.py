def list_rules() -> list[str]:
    return [
        "PASS enables shipment eligibility",
        "FAIL creates a blocking NCR",
        "HOLD requires quality decision before shipment",
    ]

