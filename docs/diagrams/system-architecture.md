# System Architecture

This diagram shows the current system shape of the repository.

- the backend is the implemented center of gravity
- the final-test runner is already connected to the backend
- web and Android remain scaffold-level surfaces

```mermaid
graph TD
    subgraph Users["Human users"]
        PROD["Production operator"]
        QUAL["Quality inspector"]
        TEST["Final-test operator"]
        TECH["Service technician"]
    end

    subgraph Clients["Client surfaces"]
        WEB["Web app<br/>scaffold / future UI"]
        RUNNER["Final-test runner<br/>implemented Python CLI"]
        MOBILE["Android app<br/>scaffold / future offline client"]
    end

    subgraph Backend["ServiceTrace backend"]
        API["FastAPI API"]
        AUTH["auth_rfid module"]
        TRACE["traceability module"]
        QC["qc module"]
        ASSEMBLY["assembly module"]
        FINALTEST["final_test module"]
        LEGACY["legacy routes<br/>device CRUD, shipment gate, service, files, NCR"]
        AUDIT["audit trail"]
    end

    subgraph Data["Persistence"]
        DB["PostgreSQL target<br/>SQLite fallback in local dev"]
        FILES["filesystem storage<br/>uploads, packages, reports"]
    end

    subgraph DeviceSide["Device-side communication"]
        MCU["Medical device MCU"]
        USB["USB CDC / serial"]
    end

    PROD --> WEB
    QUAL --> WEB
    TEST --> RUNNER
    TECH --> MOBILE

    WEB --> API
    RUNNER --> API
    MOBILE --> API

    API --> AUTH
    API --> TRACE
    API --> QC
    API --> ASSEMBLY
    API --> FINALTEST
    API --> LEGACY
    AUTH --> AUDIT
    TRACE --> AUDIT
    QC --> AUDIT
    ASSEMBLY --> AUDIT
    FINALTEST --> AUDIT
    LEGACY --> AUDIT

    API --> DB
    API --> FILES

    RUNNER --> USB
    MOBILE --> USB
    USB --> MCU
```

## Interpretation

- today, the backend is the operational core of the product
- `auth_rfid`, `traceability`, `qc`, `assembly`, and `final_test` are already active backend modules
- device CRUD, shipment gate, service uploads, files, and NCR still partly depend on legacy route code
- the final-test runner is the most real client outside the backend
- mobile and web are repo-visible, but not yet product-complete
