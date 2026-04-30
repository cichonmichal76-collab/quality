# Przepływ traceability w produkcji

Ten diagram skupia się na aktualnie zaimplementowanym szkielecie przepływu produkcyjnego.

```mermaid
flowchart TD
    A["Utwórz operatora, stanowisko i maszynę"] --> B["Logowanie RFID"]
    B --> C{"Aktywna sesja?"}
    C -- "Nie" --> D["Odrzuć akcję"]
    C -- "Tak" --> E["Utwórz production item"]
    E --> F["Przypisz albo auto-utwórz barcode"]
    F --> G["Zapisz scan event"]
    G --> H{"Barcode aktywny i item dozwolony?"}
    H -- "Nie" --> I["Rejected scan event + audit event"]
    H -- "Tak" --> J["Zaakceptowany scan event + audit event"]
    J --> K["Uruchom qc_run"]
    K --> L["Zapisz wyniki kroków QC"]
    L --> M{"Wynik QC"}
    M -- "FAIL" --> N["Ustaw item na QC_FAILED"]
    N --> O["Utwórz NCR"]
    M -- "PASS" --> P["Ustaw item na QC_PASSED"]
    P --> Q["Zainstaluj komponent w urządzeniu"]
    Q --> R["Zapisz assembly link"]
    R --> S["Uruchom final test"]
    S --> T{"Wynik final testu"}
    T -- "FAIL" --> U["Ustaw device na FINAL_TEST_FAILED + NCR"]
    T -- "PASS" --> V["Ustaw device na FINAL_TEST_PASSED"]
    V --> W{"Czy otwarta NCR krytyczna?"}
    W -- "Tak" --> X["Zablokuj READY_FOR_SHIPMENT"]
    W -- "Nie" --> Y["Pozwól na READY_FOR_SHIPMENT"]
```

## Co jest ważne w tym flow

- prawie każda istotna akcja produkcyjna zależy od aktywnego `work_session_id`
- scan eventy i audit eventy są równoległą częścią śladu traceability
- QC i final test są dziś głównymi bramkami dla dalszego przejścia procesu
- shipment nie jest swobodną zmianą statusu; zależy od testu i stanu NCR
