# Przewodnik API

Ten dokument opisuje aktualnie zaimplementowany przepływ API dla MVP backendu.

Skupia się na traceability-first przepływie, który już istnieje w kodzie:

1. bootstrap operatora i stanowiska
2. logowanie RFID i `work_session_id`
3. tworzenie production itemu
4. ledger scan eventów
5. checklisty QC i `qc_run`
6. assembly by scan
7. upload final testu
8. odczyt audit trail

## Base URL

Domyślny lokalny adres:

```text
http://localhost:8000
```

Prefiks API:

```text
/api
```

Health check:

```text
GET /health
```

Generowane przez FastAPI dokumenty są dostępne także pod:

```text
/docs
/openapi.json
```

## Typy treści

Większość endpointów używa JSON.

Wyjątki:

- `POST /api/qc-runs/{run_id}/complete` oczekuje `form-data`
- `POST /api/service-sessions/upload` używa `multipart/form-data`
- `POST /api/files/upload` używa `multipart/form-data`

## Wspólne zasady przepływu

- akcje produkcyjne i jakościowe opierają się na `work_session_id`
- `work_session_id` musi wskazywać na aktywną sesję RFID stanowiska
- role operatorów są walidowane względem wykonywanej akcji
- audit eventy są zapisywane dla ważnych akcji i błędów przepływu

## Typowe odpowiedzi HTTP

- `200` sukces
- `400` niepoprawny stan, niepoprawne przejście, nieaktywna sesja albo brak aktywnej sesji
- `401` nieaktywny albo nieznany operator RFID
- `403` rola operatora nie jest dozwolona dla danej akcji
- `404` żądana encja nie istnieje
- `409` duplikat identyfikatora albo już zainstalowany komponent

## 1. Bootstrap danych podstawowych

Utworzenie operatora:

```bash
curl -X POST http://localhost:8000/api/operators \
  -H "Content-Type: application/json" \
  -d '{
    "operator_id": "OP-001",
    "full_name": "Jan Kowalski",
    "role": "PRODUCTION_OPERATOR",
    "rfid_uid_hash": "RFID-001"
  }'
```

Utworzenie stanowiska:

```bash
curl -X POST http://localhost:8000/api/workstations \
  -H "Content-Type: application/json" \
  -d '{
    "workstation_id": "WS-01",
    "name": "Stanowisko 01",
    "area": "MECHANICAL",
    "station_type": "PRODUCTION"
  }'
```

Utworzenie maszyny:

```bash
curl -X POST http://localhost:8000/api/machines \
  -H "Content-Type: application/json" \
  -d '{
    "machine_id": "MC-01",
    "name": "Laser Marker",
    "machine_type": "MARKING",
    "location": "Linia A"
  }'
```

## 2. Logowanie RFID i work session

Start sesji RFID:

```bash
curl -X POST http://localhost:8000/api/auth/rfid-login \
  -H "Content-Type: application/json" \
  -d '{
    "rfid_uid_hash": "RFID-001",
    "workstation_id": "WS-01",
    "machine_id": "MC-01"
  }'
```

Typowa odpowiedź:

```json
{
  "id": "9a5d3d46-6a6d-4af7-b2a7-17b4d0a6d7f4",
  "work_session_id": "WS-9f58f6efc49b",
  "operator_id": "OP-001",
  "workstation_id": "WS-01",
  "machine_id": "MC-01",
  "status": "ACTIVE",
  "started_at": "2026-04-30T10:00:00Z",
  "ended_at": null
}
```

Ważne:

- powtórne logowanie z tym samym aktywnym kontekstem zwraca istniejącą sesję
- przeterminowane sesje dostają status `TIMEOUT`
- flow produkcyjne i QC kończą się błędem, jeśli sesja nie jest aktywna

Zamknięcie sesji:

```bash
curl -X POST http://localhost:8000/api/work-sessions/WS-9f58f6efc49b/close \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Koniec zmiany"
  }'
```

## 3. Utworzenie production itemu

Barcode można utworzyć jawnie, ale obecny backend potrafi też utworzyć go automatycznie przy tworzeniu production itemu, jeśli dany barcode jeszcze nie istnieje.

Opcjonalne jawne utworzenie barcode:

```bash
curl -X POST http://localhost:8000/api/barcodes/create \
  -H "Content-Type: application/json" \
  -d '{
    "barcode_value": "BC-1001",
    "entity_type": "PRODUCTION_ITEM",
    "entity_serial_number": "ITEM-1001",
    "printed_by": "OP-001"
  }'
```

Utworzenie production itemu:

```bash
curl -X POST http://localhost:8000/api/production-items \
  -H "Content-Type: application/json" \
  -d '{
    "item_serial_number": "ITEM-1001",
    "barcode_value": "BC-1001",
    "item_type": "PCB",
    "part_number": "PCB-CTRL-01",
    "revision": "A",
    "production_order": "PO-2026-001",
    "work_session_id": "WS-9f58f6efc49b",
    "workstation_id": "WS-01"
  }'
```

Uwagi:

- aktywna work session jest wymagana
- backend może uzupełnić `created_by_operator_id` i `machine_id` z aktywnej sesji
- duplikat `item_serial_number` albo `barcode_value` zwraca `409`

## 4. Rejestrowanie scan eventów

Zapis zaakceptowanego skanu:

```bash
curl -X POST http://localhost:8000/api/scan-events \
  -H "Content-Type: application/json" \
  -d '{
    "scan_event_id": "SCAN-1001",
    "barcode_value": "BC-1001",
    "context": "QC_SCAN",
    "result": "ACCEPTED",
    "work_session_id": "WS-9f58f6efc49b"
  }'
```

Historia skanów dla barcode:

```bash
curl http://localhost:8000/api/barcodes/BC-1001/scan-history
```

Dezaktywacja barcode:

```bash
curl -X PATCH http://localhost:8000/api/barcodes/BC-1001/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "INACTIVE"
  }'
```

Reguły statusu barcode:

- dozwolone statusy: `ACTIVE`, `INACTIVE`, `VOID`
- nieaktywny barcode jest blokowany przy skanie
- odrzucony skan nadal zapisuje scan event i audit event

## 5. Checklisty QC i `qc_run`

Utworzenie checklisty:

```bash
curl -X POST http://localhost:8000/api/qc-checklists \
  -H "Content-Type: application/json" \
  -d '{
    "checklist_code": "CHK-MECH-01",
    "name": "Mechanical QC",
    "process_stage": "MECHANICAL_QC",
    "version": "1.0"
  }'
```

Dodanie kroku checklisty:

```bash
curl -X POST http://localhost:8000/api/qc-checklists/CHK-MECH-01/steps \
  -H "Content-Type: application/json" \
  -d '{
    "step_order": 1,
    "title": "Pomiar szerokości",
    "requires_measurement": true,
    "tolerance_min": 10.0,
    "tolerance_max": 20.0
  }'
```

Start `qc_run` dla itemu:

```bash
curl -X POST http://localhost:8000/api/qc-runs \
  -H "Content-Type: application/json" \
  -d '{
    "run_id": "QCRUN-1001",
    "item_serial_number": "ITEM-1001",
    "barcode_value": "BC-1001",
    "checklist_id": "CHECKLIST-ID",
    "process_stage": "MECHANICAL_QC",
    "work_session_id": "WS-9f58f6efc49b"
  }'
```

Wysłanie wyniku kroku:

```bash
curl -X POST http://localhost:8000/api/qc-runs/QCRUN-1001/steps/STEP-ID/result \
  -H "Content-Type: application/json" \
  -d '{
    "status": "PASS",
    "measurement_value": 15.2,
    "comment": "W normie"
  }'
```

Zakończenie `qc_run`:

```bash
curl -X POST http://localhost:8000/api/qc-runs/QCRUN-1001/complete \
  -F "result=PASS"
```

Możesz też pominąć jawny `result`. Wtedy backend wyliczy wynik końcowy na podstawie wyników kroków.

Aktualne zachowanie QC:

- QC wymaga aktywnej work session z rolą jakościową
- kroki pomiarowe automatycznie zwracają `FAIL`, jeśli wartość wyjdzie poza tolerancję
- status itemu przechodzi przez `QC_IN_PROGRESS`, a potem `QC_PASSED` albo `QC_FAILED`
- nieudany `qc_run` tworzy blokującą NCR o wzorze `NCR-QC-{run_id}`

## 6. Assembly by scan

Utworzenie urządzenia:

```bash
curl -X POST http://localhost:8000/api/devices \
  -H "Content-Type: application/json" \
  -d '{
    "device_serial_number": "ZSS-000123",
    "device_type": "ZSS",
    "hardware_version": "HW-1.0"
  }'
```

Instalacja komponentu do urządzenia:

```bash
curl -X POST http://localhost:8000/api/devices/ZSS-000123/assembly/scan-component \
  -H "Content-Type: application/json" \
  -d '{
    "child_barcode_value": "BC-1001",
    "component_type": "CONTROL_PCB",
    "work_session_id": "WS-9f58f6efc49b"
  }'
```

Odczyt drzewa montażowego:

```bash
curl http://localhost:8000/api/devices/ZSS-000123/assembly-tree
```

Reguły assembly:

- barcode komponentu musi istnieć
- status itemu nie może być `QC_FAILED`, `SCRAPPED` ani `REWORK_REQUIRED`
- komponent nie może być zainstalowany drugi raz, jeśli już ma aktywne `INSTALLED`
- assembly zapisuje zarówno relację montażową, jak i ślad skanu oraz audytu

## 7. Final test

Zapis wyniku final testu:

```bash
curl -X POST http://localhost:8000/api/final-tests \
  -H "Content-Type: application/json" \
  -d '{
    "test_run_id": "FT-20260430-0001",
    "device_serial_number": "ZSS-000123",
    "result": "PASS",
    "firmware_version": "1.2.4",
    "bootloader_version": "0.9.8",
    "work_session_id": "WS-FT-01"
  }'
```

Reguły final testu:

- final test wymaga aktywnej work session z rolą final-testową
- urządzenie musi już istnieć
- `PASS` ustawia `production_status` urządzenia na `FINAL_TEST_PASSED`
- `FAIL` ustawia `production_status` na `FINAL_TEST_FAILED`
- `FAIL` tworzy też krytyczną NCR o wzorze `NCR-{test_run_id}`

Oznaczenie urządzenia jako gotowego do wysyłki:

```bash
curl -X PATCH http://localhost:8000/api/devices/ZSS-000123/status \
  -H "Content-Type: application/json" \
  -d '{
    "production_status": "READY_FOR_SHIPMENT"
  }'
```

Shipment gate w aktualnym MVP:

- `READY_FOR_SHIPMENT` wymaga `FINAL_TEST_PASSED`
- otwarta krytyczna NCR blokuje shipment

## 8. Audit trail

Lista wszystkich audit eventów:

```bash
curl http://localhost:8000/api/audit-events
```

Filtrowanie po work session:

```bash
curl "http://localhost:8000/api/audit-events?work_session_id=WS-9f58f6efc49b"
```

Filtrowanie po encji:

```bash
curl "http://localhost:8000/api/audit-events?entity_type=FINAL_TEST&entity_id=FT-20260430-0001"
```

Typowe `event_type` w zaimplementowanym flow:

- `RFID_LOGIN`
- `RFID_LOGIN_REUSED`
- `RFID_LOGIN_FAILED`
- `WORK_SESSION_CLOSED`
- `WORK_SESSION_TIMED_OUT`
- `PRODUCTION_ITEM_CREATED`
- `PRODUCTION_ITEM_STATUS_UPDATED`
- `BARCODE_STATUS_UPDATED`
- `SCAN_EVENT_RECORDED`
- `SCAN_EVENT_REJECTED`
- `QC_RUN_STARTED`
- `QC_RUN_COMPLETED`
- `ASSEMBLY_COMPONENT_INSTALLED`
- `FINAL_TEST_RECORDED`
- `DEVICE_STATUS_UPDATED`

## Reguły statusów, które warto znać

Aktualnie dozwolone przejścia `ProductionItem`:

- `LABELED` -> `PRODUCED`, `QC_IN_PROGRESS`, `BLOCKED`, `SCRAPPED`
- `PRODUCED` -> `QC_IN_PROGRESS`, `BLOCKED`, `SCRAPPED`
- `QC_IN_PROGRESS` -> `QC_PASSED`, `QC_FAILED`, `REWORK_REQUIRED`, `BLOCKED`
- `QC_FAILED` -> `REWORK_REQUIRED`, `BLOCKED`, `SCRAPPED`
- `REWORK_REQUIRED` -> `QC_IN_PROGRESS`, `BLOCKED`, `SCRAPPED`
- `QC_PASSED` -> `INSTALLED`, `BLOCKED`
- `BLOCKED` -> `REWORK_REQUIRED`, `QC_IN_PROGRESS`, `SCRAPPED`

Końcowe statusy itemu:

- `INSTALLED`
- `SCRAPPED`

## Role i bramki dostępu w aktualnym MVP

- akcje produkcyjne i traceability: `ADMIN`, `PRODUCTION_OPERATOR`, `QUALITY_INSPECTOR`
- akcje QC: `ADMIN`, `QUALITY_INSPECTOR`, `QUALITY_MANAGER`
- akcje final testu: `ADMIN`, `FINAL_TEST_OPERATOR`, `QUALITY_MANAGER`

## Dodatkowe endpointy poza głównym flow

- `GET /api/devices`
- `GET /api/production-items/{item_serial_number}`
- `GET /api/production-items/by-barcode/{barcode_value}`
- `GET /api/nonconformities`
- `POST /api/nonconformities`
- `PATCH /api/nonconformities/{ncr_id}`
- `POST /api/service-sessions/upload`
- `GET /api/service-sessions`
- `GET /api/service-sessions/{session_id}`
- `GET /api/service-sessions/{session_id}/package`
- `POST /api/files/upload`
- `GET /api/files/{file_id}`

## Aktualne ograniczenia

- mamy praktyczny przewodnik API, ale nie ma jeszcze sformalizowanego procesu wersjonowania kontraktu
- część zaimplementowanych endpointów nadal żyje w legacy routes
- walidacja shipment jest węższa niż pełny target z PRD
- web i Android nie używają jeszcze generowanego klienta API
