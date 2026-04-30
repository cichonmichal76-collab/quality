# Production Item Lifecycle

This diagram reflects the production item state machine currently implemented in the backend rules.

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

## Related barcode lifecycle

The production item lifecycle is complemented by a separate barcode status lifecycle:

```mermaid
stateDiagram-v2
    [*] --> ACTIVE
    ACTIVE --> INACTIVE
    ACTIVE --> VOID
    INACTIVE --> [*]
    VOID --> [*]
```

## Practical meaning

- `QC_PASSED` is the state that allows installation into a device
- `QC_FAILED`, `REWORK_REQUIRED`, and `SCRAPPED` block normal downstream flow
- `BLOCKED` is a catch-all stop state that can later re-enter controlled rework or QC
- barcode state and production-item state are related, but they are not the same thing
