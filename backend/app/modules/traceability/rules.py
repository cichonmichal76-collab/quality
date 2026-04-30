def list_rules() -> list[str]:
    return [
        "Every physical item must have a unique code",
        "Duplicate or inactive barcodes must be blocked",
        "Every accepted scan should land in the event ledger",
    ]

