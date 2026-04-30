# Production Traceability Flow

This diagram focuses on the currently implemented backbone of the production workflow.

```mermaid
flowchart TD
    A["Create operator, workstation, machine"] --> B["RFID login"]
    B --> C{"Active session?"}
    C -- "No" --> D["Reject action"]
    C -- "Yes" --> E["Create production item"]
    E --> F["Assign or auto-create barcode"]
    F --> G["Record scan event"]
    G --> H{"Barcode active and item allowed?"}
    H -- "No" --> I["Rejected scan event + audit event"]
    H -- "Yes" --> J["Accepted scan event + audit event"]
    J --> K["Start QC run"]
    K --> L["Submit QC step results"]
    L --> M{"QC result"}
    M -- "FAIL" --> N["Set item to QC_FAILED"]
    N --> O["Create NCR"]
    M -- "PASS" --> P["Set item to QC_PASSED"]
    P --> Q["Install component into device"]
    Q --> R["Record assembly link"]
    R --> S["Run final test"]
    S --> T{"Final test result"}
    T -- "FAIL" --> U["Set device to FINAL_TEST_FAILED + NCR"]
    T -- "PASS" --> V["Set device to FINAL_TEST_PASSED"]
    V --> W{"Critical NCR open?"}
    W -- "Yes" --> X["Block READY_FOR_SHIPMENT"]
    W -- "No" --> Y["Allow READY_FOR_SHIPMENT"]
```

## What is important in this flow

- almost every meaningful production action depends on an active `work_session_id`
- scan events and audit events are both part of the traceability record
- QC and final test are the current main gatekeepers for downstream progression
- shipment is not a free status change; it is constrained by test and NCR state
