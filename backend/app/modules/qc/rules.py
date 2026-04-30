def list_rules() -> list[str]:
    return [
        "NOK should create or update NCR",
        "Blocking NCR must prevent downstream operations",
        "QC result should update item lifecycle status",
    ]

