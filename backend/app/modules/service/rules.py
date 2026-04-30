def list_rules() -> list[str]:
    return [
        "Service package should keep manifest and checksums",
        "Offline data must not be deleted before upload confirmation",
        "USB identity should match the selected device session",
    ]
UPLOADED_STATUS = "UPLOADED"
