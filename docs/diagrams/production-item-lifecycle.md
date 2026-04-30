# Lifecycle production itemu

Ten diagram odzwierciedla maszynę stanów `ProductionItem`, która jest obecnie zaimplementowana w regułach backendu.

```mermaid
stateDiagram-v2
    [*] --> LABELED

    LABELED --> PRODUCED
    LABELED --> QC_IN_PROGRESS
    LABELED --> BLOCKED
    LABELED --> SCRAPPED

    PRODUCED --> QC_IN_PROGRESS
    PRODUCED --> BLOCKED
    PRODUCED --> SCRAPPED

    QC_IN_PROGRESS --> QC_PASSED
    QC_IN_PROGRESS --> QC_FAILED
    QC_IN_PROGRESS --> REWORK_REQUIRED
    QC_IN_PROGRESS --> BLOCKED

    QC_FAILED --> REWORK_REQUIRED
    QC_FAILED --> BLOCKED
    QC_FAILED --> SCRAPPED

    REWORK_REQUIRED --> QC_IN_PROGRESS
    REWORK_REQUIRED --> BLOCKED
    REWORK_REQUIRED --> SCRAPPED

    QC_PASSED --> INSTALLED
    QC_PASSED --> BLOCKED

    BLOCKED --> REWORK_REQUIRED
    BLOCKED --> QC_IN_PROGRESS
    BLOCKED --> SCRAPPED

    INSTALLED --> [*]
    SCRAPPED --> [*]
```

## Powiązany lifecycle barcode

Lifecycle production itemu jest uzupełniony o osobny lifecycle statusu barcode:

```mermaid
stateDiagram-v2
    [*] --> ACTIVE
    ACTIVE --> INACTIVE
    ACTIVE --> VOID
    INACTIVE --> [*]
    VOID --> [*]
```

## Znaczenie praktyczne

- `QC_PASSED` jest stanem, który pozwala na montaż do urządzenia
- `QC_FAILED`, `REWORK_REQUIRED` i `SCRAPPED` blokują normalny dalszy flow
- `BLOCKED` jest ogólnym stanem stop, z którego item może później wrócić do kontrolowanego reworku albo QC
- status barcode i status production itemu są ze sobą powiązane, ale nie są tym samym
