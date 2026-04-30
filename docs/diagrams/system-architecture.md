# Architektura systemu

Ten diagram pokazuje aktualny kształt systemu w repozytorium.

- backend jest dziś zaimplementowanym centrum ciężkości
- final-test-runner jest już realnie połączony z backendem
- web i Android pozostają na poziomie scaffoldów

```mermaid
graph TD
    subgraph Users["Użytkownicy"]
        PROD["Operator produkcji"]
        QUAL["Inspektor jakości"]
        TEST["Operator final testu"]
        TECH["Serwisant"]
    end

    subgraph Clients["Powierzchnie klienckie"]
        WEB["Web app<br/>scaffold / przyszły UI"]
        RUNNER["Final-test runner<br/>zaimplementowany Python CLI"]
        MOBILE["Android app<br/>scaffold / przyszły klient offline"]
    end

    subgraph Backend["Backend ServiceTrace"]
        API["FastAPI API"]
        AUTH["moduł auth_rfid"]
        TRACE["moduł traceability"]
        QC["moduł qc"]
        ASSEMBLY["moduł assembly"]
        FINALTEST["moduł final_test"]
        LEGACY["legacy routes<br/>device CRUD, shipment gate, service, files, NCR"]
        AUDIT["audit trail"]
    end

    subgraph Data["Persistencja"]
        DB["docelowo PostgreSQL<br/>lokalnie możliwy fallback SQLite"]
        FILES["storage plikowy<br/>uploady, paczki, raporty"]
    end

    subgraph DeviceSide["Komunikacja po stronie urządzenia"]
        MCU["MCU urządzenia medycznego"]
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

## Jak czytać ten diagram

- backend jest dziś operacyjnym rdzeniem produktu
- `auth_rfid`, `traceability`, `qc`, `assembly` i `final_test` są już aktywnymi modułami backendu
- device CRUD, shipment gate, uploady serwisowe, pliki i NCR nadal częściowo zależą od legacy route code
- final-test-runner jest najbardziej realnym klientem poza backendem
- mobile i web są widoczne w repo, ale nie są jeszcze pełnymi aplikacjami produktowymi
