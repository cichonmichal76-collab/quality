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

## Format wersji BOM

Wersje BOM używają formatu numerycznego rozdzielanego kropkami, na przykład:

- `1`
- `1.0`
- `2.3`
- `2.3.4`

Niedozwolone są warianty tekstowe typu `v1`, `1.0-beta` albo `rev2`.

Przy `clone` i `promote` backend wymaga też, żeby `target_version` był semantycznie większy od `source_version`. Końcowe zera są normalizowane, więc `1.0` i `1.0.0` są traktowane jako ta sama wersja.

## Okna obowiązywania BOM

Wersja BOM może mieć opcjonalne pola:

- `effective_from`
- `effective_to`

Lookup aktywnego BOM dla assembly i shipment bierze teraz pod uwagę nie tylko `status == ACTIVE`, ale też bieżące okno obowiązywania. Jeśli wersja jest aktywna, ale jeszcze nie weszła w życie albo już wygasła, nie zostanie użyta do nowego montażu ani do shipmentu urządzenia, które nie ma jeszcze przypiętego własnego `bom_template_id`.

Endpointy `usage` i `readiness` zwracają dodatkowo:

- `effective_from`
- `effective_to`
- `is_effective_now`

## Grupy zamienników BOM

Pozycja BOM może mieć opcjonalne pole `substitution_group`. Wszystkie pozycje z tą samą grupą tworzą jeden wspólny wymóg biznesowy:

- `assembly` pozwala zainstalować dowolny dozwolony komponent z grupy
- limit ilości jest liczony na poziomie całej grupy
- `shipment` uznaje wymóg za spełniony, jeśli grupa ma wymaganą łączną ilość, nawet gdy użyto tylko jednego z wariantów
- pozycje w tej samej grupie muszą mieć zgodne `quantity_required` i `is_required`

## Lineage wersji BOM

Każda wersja BOM może wskazywać:

- `source_template_id`
- `replaced_by_template_id`

Nowy odczyt:

- `GET /api/device-bom-templates/{device_type}/lineage?version=...&variant_code=...`

zwraca `focus`, `ancestors`, `descendants` i `replacement`, więc można bezpośrednio zobaczyć historię klonowania i zastępowania wersji.

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

Utworzenie roboczej wersji BOM dla typu urządzenia:

```bash
curl -X POST http://localhost:8000/api/device-bom-templates \
  -H "Content-Type: application/json" \
  -d '{
    "device_type": "ZSS",
    "variant_code": "DEFAULT",
    "name": "ZSS Default BOM",
    "version": "1.0",
    "is_active": false
  }'
```

Nowa wersja BOM zawsze startuje jako nieaktywna. Żeby weszła do produkcji, trzeba najpierw dodać pozycje, a potem przejść przez `approve` + `activate` albo od razu przez `release`. Jeśli wersja jest już w stanie `APPROVED`, `release` robi już tylko aktywację bez powtarzania approval.

Dodanie wymaganego komponentu do BOM:

```bash
curl -X POST "http://localhost:8000/api/device-bom-templates/ZSS/items?variant_code=DEFAULT" \
  -H "Content-Type: application/json" \
  -d '{
    "component_type": "CONTROL_PCB",
    "required_part_number": "PCB-CTRL-01",
    "required_revision": "A",
    "required_drawing_number": "DWG-CTRL-100",
    "required_drawing_revision": "02",
    "quantity_required": 1,
    "is_required": true
  }'
```

Utworzenie nowej, jeszcze nieaktywnej wersji BOM:

```bash
curl -X POST http://localhost:8000/api/device-bom-templates \
  -H "Content-Type: application/json" \
  -d '{
    "device_type": "ZSS",
    "variant_code": "DEFAULT",
    "name": "ZSS Default BOM",
    "version": "2.0",
    "is_active": false
  }'
```

Dodanie komponentu do konkretnej wersji BOM:

```bash
curl -X POST "http://localhost:8000/api/device-bom-templates/ZSS/items?version=2.0&variant_code=DEFAULT" \
  -H "Content-Type: application/json" \
  -d '{
    "component_type": "FAN_MODULE",
    "quantity_required": 1,
    "is_required": true
  }'
```

Zatwierdzenie wybranej wersji BOM przed aktywacją:

```bash
curl -X POST "http://localhost:8000/api/device-bom-templates/ZSS/approve?variant_code=DEFAULT" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "2.0",
    "approved_by": "QA-LEAD",
    "release_note": "Reviewed before activation"
  }'
```

Aktywacja wybranej wersji BOM:

```bash
curl -X POST "http://localhost:8000/api/device-bom-templates/ZSS/activate?variant_code=DEFAULT" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "2.0"
  }'
```

Klonowanie istniejącej wersji BOM do nowej rewizji:

```bash
curl -X POST "http://localhost:8000/api/device-bom-templates/ZSS/clone?variant_code=DEFAULT" \
  -H "Content-Type: application/json" \
  -d '{
    "source_version": "1.0",
    "target_version": "1.1",
    "name": "ZSS Default BOM",
    "activate": false
  }'
```

Klonowanie i natychmiastowa aktywacja nowej wersji:

```bash
curl -X POST "http://localhost:8000/api/device-bom-templates/ZSS/clone?variant_code=DEFAULT" \
  -H "Content-Type: application/json" \
  -d '{
    "source_version": "1.0",
    "target_version": "2.0",
    "activate": true,
    "approved_by": "QA-LEAD",
    "release_note": "Immediate activation of cloned BOM"
  }'
```

Promocja aktywnej wersji BOM do nowej rewizji w jednym kroku:

```bash
curl -X POST "http://localhost:8000/api/device-bom-templates/ZSS/promote?variant_code=DEFAULT" \
  -H "Content-Type: application/json" \
  -d '{
    "source_version": "2.0",
    "target_version": "3.0",
    "name": "ZSS Default BOM",
    "approved_by": "QA-LEAD",
    "release_note": "Approved during promotion",
    "retire_reason": "Production release update"
  }'
```

Odczyt użycia i mutowalności konkretnej wersji BOM:

```bash
curl "http://localhost:8000/api/device-bom-templates/ZSS/usage?version=3.0&variant_code=DEFAULT"
```

Odczyt gotowości wersji BOM do aktywacji:

```bash
curl "http://localhost:8000/api/device-bom-templates/ZSS/readiness?version=3.0&variant_code=DEFAULT"
```

Odczyt urządzeń już przypiętych do wersji BOM:

```bash
curl "http://localhost:8000/api/device-bom-templates/ZSS/bindings?version=3.0&variant_code=DEFAULT"
```

Odczyt kompletności powiązanych urządzeń względem wersji BOM:

```bash
curl "http://localhost:8000/api/device-bom-templates/ZSS/coverage?version=3.0&variant_code=DEFAULT"
```

Zatwierdzenie wersji BOM z metadanymi release:

```bash
curl -X POST "http://localhost:8000/api/device-bom-templates/ZSS/approve?variant_code=DEFAULT" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "3.0",
    "approved_by": "QA-LEAD",
    "release_note": "Checked for pilot release"
  }'
```

Ręczne cofnięcie approval dla wersji roboczej BOM:

```bash
curl -X POST "http://localhost:8000/api/device-bom-templates/ZSS/revoke-approval?variant_code=DEFAULT" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "3.0",
    "reason": "Engineering hold"
  }'
```

Release wersji BOM. Dla stanu `INACTIVE` robi approval plus aktywację w jednym kroku, a dla stanu `APPROVED` wystarczy przekazać samo `version` i opcjonalnie `release_note`:

```bash
curl -X POST "http://localhost:8000/api/device-bom-templates/ZSS/release?variant_code=DEFAULT" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "3.0",
    "approved_by": "ENG-MFG",
    "release_note": "Approved for release line A"
  }'
```

Porównanie dwóch wersji BOM:

```bash
curl "http://localhost:8000/api/device-bom-templates/ZSS/diff?source_version=2.0&target_version=3.0&variant_code=DEFAULT"
```

Edycja pozycji BOM w wersji roboczej:

```bash
curl -X PATCH "http://localhost:8000/api/device-bom-templates/ZSS/items/CONTROL_PCB?version=3.0&variant_code=DEFAULT" \
  -H "Content-Type: application/json" \
  -d '{
    "required_part_number": "PCB-CTRL-002",
    "required_revision": "C",
    "quantity_required": 2
  }'
```

Usunięcie pozycji BOM z wersji roboczej:

```bash
curl -X DELETE "http://localhost:8000/api/device-bom-templates/ZSS/items/CONTROL_PCB?version=3.0&variant_code=DEFAULT"
```

Wycofanie wersji BOM:

```bash
curl -X POST "http://localhost:8000/api/device-bom-templates/ZSS/retire?variant_code=DEFAULT" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0",
    "reason": "Obsolete revision"
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
- typ zeskanowanego itemu musi zgadzać się z `component_type`
- jeśli dla `device_type` istnieje aktywny BOM, `component_type` musi być dozwolony przez ten BOM
- lookup BOM wspiera `variant_code`; backend najpierw szuka aktywnego BOM dla wariantu urządzenia, a potem może spaść do wariantu `DEFAULT`
- jeśli dla `device_type` istnieją już wersje BOM, ale żadna nie jest aktywna, nowy assembly scan jest blokowany do czasu aktywacji kolejnej wersji
- jeśli BOM definiuje `required_part_number`, zeskanowany item musi mieć dokładnie ten `part_number`
- jeśli BOM definiuje `required_revision`, zeskanowany item musi mieć dokładnie tę `revision`
- jeśli BOM definiuje `required_drawing_number`, zeskanowany item musi mieć dokładnie ten `drawing_number`
- jeśli BOM definiuje `required_drawing_revision`, zeskanowany item musi mieć dokładnie tę `drawing_revision`
- jeśli aktywny BOM ogranicza ilość danego komponentu, assembly blokuje przekroczenie limitu już podczas skanu
- komponent nie może być zainstalowany drugi raz, jeśli już ma aktywne `INSTALLED`
- assembly zapisuje zarówno relację montażową, jak i ślad skanu oraz audytu
- pierwszy poprawny skan dla urządzenia przypina je do konkretnego `bom_template_id` i `bom_version`; kolejne skany używają już tej samej wersji BOM
- wersja BOM może mieć jawny `status`: `INACTIVE`, `APPROVED`, `ACTIVE` albo `RETIRED`
- wersja `RETIRED` jest niemodyfikowalna; nie można dodawać do niej nowych pozycji BOM
- nową wersję BOM można utworzyć przez klonowanie istniejącej wersji wraz z kompletem pozycji i opcjonalną natychmiastową aktywacją
- aktywną wersję BOM można też promować do nowej rewizji jednym endpointem, który klonuje pozycje, aktywuje nową wersję i wycofuje starą
- aktywna wersja BOM nie może być już modyfikowana w miejscu, nawet jeśli nie została jeszcze użyta przez urządzenia; zmiany powinny iść przez `clone` albo `promote`
- endpoint `usage` zwraca także `recommended_action`, np. `modify_or_approve`, `activate_or_modify`, `clone` albo `clone_or_promote`
- endpoint `bindings` zwraca konkretne urządzenia przypięte do wersji BOM wraz z `installed_component_count` i czasem pierwszego związania
- endpoint `coverage` zwraca dla tych urządzeń kompletność względem BOM, w tym `missing_required_components` i status per komponent
- endpointy `approve` i `release` pozwalają zapisać metadane zatwierdzenia BOM i użyć ich jako jawnej ścieżki wejścia wersji do produkcji
- `POST /api/device-bom-templates` nie pozwala już tworzyć BOM od razu jako aktywnego; prawidłowy flow to create inactive -> add items -> approve/activate albo release
- `approve` działa tylko dla wersji `INACTIVE`, które mają już co najmniej jedną pozycję i co najmniej jedną pozycję wymaganą; po zatwierdzeniu wersja przechodzi do statusu `APPROVED`
- `release` działa dla wersji `INACTIVE` i `APPROVED`; dla `INACTIVE` wymaga `approved_by` i robi approval plus aktywację, a dla `APPROVED` aktywuje już zatwierdzony draft bez ponownego approval
- `revoke-approval` pozwala ręcznie cofnąć approval tylko dla wersji `APPROVED`; aktywna albo niezatwierdzona wersja nie przejdzie tej operacji
- `revoke-approval` cofa też status `APPROVED` z powrotem do `INACTIVE`
- endpoint `readiness` zwraca, czy dana wersja ma zdefiniowane pozycje, co najmniej jedną pozycję wymaganą i approval przed aktywacją
- `clone` z `activate=true` oraz `promote` wymagają teraz `approved_by`, bo aktywują nową wersję BOM w tym samym kroku
- jeśli zatwierdzona wersja robocza BOM zostanie zmieniona przez `POST/PATCH/DELETE` na pozycjach BOM, approval jest automatycznie czyszczony i wersję trzeba zatwierdzić ponownie przed aktywacją
- endpoint `diff` zwraca różnice między dwiema wersjami BOM jako `added`, `removed`, `modified` i `unchanged_count`
- `READY_FOR_SHIPMENT` jest blokowany nie tylko przy brakujących komponentach, ale też przy nadmiarowych i nieoczekiwanych komponentach względem aktywnego albo przypiętego BOM
- pozycje BOM można edytować i usuwać tylko wtedy, gdy wersja BOM jest `INACTIVE` albo `APPROVED`; modyfikacja zatwierdzonego draftu automatycznie wraca ze stanem do `INACTIVE`, a aktywne wersje wymagają `clone` albo `promote`

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
- wymagane komponenty są odczytywane z aktywnego `device_bom_template` dla `device_type`
- jeśli pozycja BOM wymaga konkretnego `part_number` albo `revision`, ta zgodność jest sprawdzana już podczas assembly
- brakujący komponent jest zwracany w treści błędu, np. `CONTROL_PCB` albo `FAN_MODULE x2`
- otwarta krytyczna NCR blokuje shipment
- shipment pozostaje końcową walidacją kompletności, nawet jeśli assembly wcześniej odrzuci niedozwolony skan
- jeśli urządzenie zostało już przypięte do konkretnego `bom_version` podczas assembly, shipment używa tej samej wersji zamiast aktualnie aktywnej
- jeśli urządzenie nie jest jeszcze przypięte do BOM, a dla jego `device_type` nie ma aktywnej wersji, shipment jest blokowany do czasu aktywacji nowego BOM

## 8. Audit trail

Lista wszystkich audit eventów:

```bash
curl http://localhost:8000/api/audit-events
```

Audit obejmuje także lifecycle BOM:

- `DEVICE_BOM_TEMPLATE_CREATED`
- `DEVICE_BOM_TEMPLATE_ACTIVATED`
- `DEVICE_BOM_TEMPLATE_DEACTIVATED`
- `DEVICE_BOM_TEMPLATE_RETIRED`
- `DEVICE_BOM_TEMPLATE_CLONED`
- `DEVICE_BOM_TEMPLATE_PROMOTED`
- `DEVICE_BOM_TEMPLATE_APPROVAL_CLEARED`
- `DEVICE_BOM_TEMPLATE_APPROVAL_REVOKED`
- `DEVICE_BOM_ITEM_ADDED`

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
- główne zaimplementowane endpointy działają już przez moduły domenowe backendu
- walidacja shipment jest nadal węższa niż pełny target z PRD, ale korzysta już z aktywnego BOM w bazie per `device_type`
- web i Android nie używają jeszcze generowanego klienta API
