ALLOWED_BARCODE_STATUSES = {"ACTIVE", "INACTIVE", "VOID"}

ALLOWED_PRODUCTION_ITEM_TRANSITIONS = {
    "LABELED": {"PRODUCED", "QC_IN_PROGRESS", "BLOCKED", "SCRAPPED"},
    "PRODUCED": {"QC_IN_PROGRESS", "BLOCKED", "SCRAPPED"},
    "QC_IN_PROGRESS": {"QC_PASSED", "QC_FAILED", "REWORK_REQUIRED", "BLOCKED"},
    "QC_FAILED": {"REWORK_REQUIRED", "BLOCKED", "SCRAPPED"},
    "REWORK_REQUIRED": {"QC_IN_PROGRESS", "BLOCKED", "SCRAPPED"},
    "QC_PASSED": {"INSTALLED", "BLOCKED"},
    "BLOCKED": {"REWORK_REQUIRED", "QC_IN_PROGRESS", "SCRAPPED"},
    "INSTALLED": set(),
    "SCRAPPED": set(),
}


def list_rules() -> list[str]:
    return [
        "Every physical item must have a unique code",
        "Duplicate or inactive barcodes must be blocked",
        "Every accepted scan should land in the event ledger",
    ]
