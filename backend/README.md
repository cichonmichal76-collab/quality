# ServiceTrace Backend

Backend FastAPI dla ServiceTrace Platform.

Backend jest systemem źródłowym dla operatorów, sesji RFID, barcode, production itemów, urządzeń, QC, NCR, final testów i audit eventów.

## Wymagania wstępne

- Python 3.11+
- PostgreSQL 16+ dla docelowego lokalnego stacku
- Docker Desktop, jeśli chcesz używać uruchomienia kontenerowego

## Lokalny development

```bash
cd backend
pip install -e .[dev]
alembic upgrade head
uvicorn app.main:app --reload
```

API startuje domyślnie pod `http://localhost:8000`.

## Zmienne środowiskowe

Backend czyta konfigurację ze zmiennych środowiskowych opisanych w [`.env.example`](../.env.example).

- `DATABASE_URL`
  Domyślnie: `sqlite:///./servicetrace_dev.db`
- `STORAGE_DIR`
  Domyślnie: `./storage`
- `API_HOST`
  Domyślnie: `0.0.0.0`
- `API_PORT`
  Domyślnie: `8000`
- `SERVICE_TRACE_ENV`
  Domyślnie: `local`
- `WORK_SESSION_TIMEOUT_MINUTES`
  Domyślnie: `480`

Do codziennego developmentu rekomendowany jest PostgreSQL, żeby lokalne zachowanie było bliższe stackowi Docker i środowisku docelowemu.

## Docker

Z katalogu głównego repo:

```bash
docker compose up --build
```

To uruchamia:

- PostgreSQL na `localhost:5432`
- backend API na `localhost:8000`

## Migracje bazy danych

Aplikacja nie tworzy już tabel automatycznie przy starcie. Zmiany schematu muszą przechodzić przez migracje Alembic.

Zastosowanie aktualnego schematu:

```bash
cd backend
alembic upgrade head
```

Utworzenie nowej migracji po zmianie modeli:

```bash
cd backend
alembic revision --autogenerate -m "opis zmiany"
```

Obecna historia migracji obejmuje:

- początkowy bootstrap schematu
- rozszerzenie targetów `qc_run`

## Testy i quality checks

```bash
cd backend
pytest
ruff check .
mypy app
```

Testy tworzą i usuwają schemat jawnie, więc nie polegają na skutkach ubocznych startu aplikacji.

## Struktura pakietu

```text
backend/
|-- alembic/          środowisko migracji i rewizje
|-- app/
|   |-- api/          składanie routerów i warstwa API
|   |-- core/         konfiguracja i współdzielone helpery
|   |-- db/           miejsce na dalszy podział warstwy DB
|   |-- models/       encje SQLAlchemy
|   |-- modules/      moduły domenowe z API i logiką
|   |-- schemas/      modele request/response Pydantic
|   |-- services/     współdzielone helpery usługowe
|   `-- main.py       entrypoint FastAPI
`-- tests/            testy API i przepływów
```

## Moduły domenowe

Docelowa architektura to modularny monolit. Katalog `app/modules/` jest główną granicą tego podziału.

Aktualne moduły:

- `auth_rfid`
- `traceability`
- `qc`
- `assembly`
- `final_test`
- `shipment`
- `service`
- `files`
- `nonconformities`

Zaobserwowane domeny backendu działają już przez routery i serwisy modułowe. Moduł `assembly` obsługuje dodatkowo device CRUD, proste endpointy komponentów i lifecycle BOM per `device_type` oraz `variant_code`, razem z regułami `part_number`, `revision`, `drawing_number` i `drawing_revision`. Lifecycle BOM ma teraz jawne etapy `INACTIVE`, `APPROVED`, `ACTIVE` i `RETIRED`. Status `RETIRED` zamraża wersję BOM dla nowych zmian i blokuje nowe montaże lub shipment bez aktywnej wersji, jeśli urządzenie nie jest jeszcze przypięte do konkretnego BOM.
Backend wspiera też klonowanie wersji BOM do nowej rewizji wraz z pozycjami, z opcjonalną natychmiastową aktywacją nowej wersji, oraz promocję aktywnej wersji do nowej rewizji w jednym kroku. Wersje BOM mają format numeryczny rozdzielany kropkami, a nowe rewizje w `clone` i `promote` muszą być semantycznie większe od wersji źródłowej. Aktywny BOM użyty już przez urządzenia dostaje soft-lock na dalsze rozszerzanie i powinien być rozwijany przez kolejną wersję. Dodatkowo wersja BOM przechodzi teraz jawny release workflow z `approved_by`, `approved_at`, `release_note` i endpointem `release`.
Backend udostępnia też odczyt `usage` dla BOM, który pokazuje liczbę powiązanych urządzeń, mutowalność wersji i rekomendowaną kolejną akcję, zbiorczy odczyt `catalog`, który pokazuje wszystkie wersje BOM dla danego `device_type` i `variant_code` razem z gotowością do aktywacji i release, oraz odczyt `bom-resolution` dla urządzenia, który pokazuje, czy backend używa BOM przypiętego, aktywnego wariantu czy fallbacku `DEFAULT`. Do tego dochodzi odczyt `bom-compliance`, który zwraca dla konkretnego urządzenia końcową zgodność z rozwiązaną wersją BOM, oraz odczyt `shipment-readiness`, który składa pełny werdykt bramki wysyłkowej z final testu, BOM, krytycznych NCR urządzenia i krytycznych NCR zainstalowanych komponentów. `Shipment-readiness` zwraca teraz także `blocking_checks`, `primary_blocking_code`, `primary_blocking_message`, `recommended_action`, `critical_open_ncr_ids`, `device_created_at`, `device_updated_at` i `latest_shipment_gate_decision`, więc klient nie musi parsować samych komunikatów tekstowych, a widok kolejkowy `GET /api/shipment-readiness` dodaje jeszcze `blocking_summary`, `primary_blocking_summary`, `recommended_action_summary`, `latest_shipment_gate_result_summary`, `production_status_summary`, filtry `production_status`, `blocking_code`, `primary_blocking_code`, `recommended_action` i `latest_gate_result`, sortowanie `sort_by` / `sort_desc` oraz paginację logiczną przez `offset`, `limit`, `returned_count`, `has_more` i `next_offset` pod dashboardy operacyjne. Każda próba przejścia urządzenia do `READY_FOR_SHIPMENT` zapisuje też jawne zdarzenie audytowe `SHIPMENT_GATE_PASSED` albo `SHIPMENT_GATE_BLOCKED` z pełnym snapshotem werdyktu bramki. Dalej dochodzi odczyt `bindings` z konkretną listą urządzeń przypiętych do wersji, odczyt `coverage` z kompletnością tych urządzeń względem BOM, odczyt `diff`, który porównuje dwie wersje BOM i rozbija zmiany na `added`, `removed`, `modified` i `unchanged_count`, oraz odczyt `readiness`, który pokazuje, czy wersja może być bezpiecznie aktywowana. Nowy kontrakt jest teraz twardszy: BOM nie może być utworzony od razu jako aktywny, aktywacja wymaga wcześniejszego approval, a `clone` z `activate=true` oraz `promote` wymagają przekazania `approved_by`. Sam `approve` jest teraz dozwolony tylko dla wersji `INACTIVE`, które mają już co najmniej jedną pozycję i co najmniej jedną pozycję wymaganą, a po zatwierdzeniu BOM przechodzi do jawnego statusu `APPROVED`. `release` działa teraz dla dwóch stanów: dla `INACTIVE` robi approval plus aktywację w jednym kroku i wymaga `approved_by`, a dla już `APPROVED` po prostu aktywuje zatwierdzony draft bez ponownego approval. Dodatkowo można już ręcznie cofnąć approval draftu, jeśli BOM trafia na hold albo wraca do poprawek. Jeśli zatwierdzona wersja robocza BOM zostanie potem zmieniona przez dodanie, edycję albo usunięcie pozycji, approval jest automatycznie czyszczony, status wraca do `INACTIVE` i trzeba go nadać ponownie. Dodatkowo aktywna wersja BOM nie jest już modyfikowalna nawet wtedy, gdy nie została jeszcze użyta przez urządzenia; od tego momentu zmiany mają iść wyłącznie przez `clone` albo `promote`. Lookup BOM wspiera teraz `variant_code` z fallbackiem do `DEFAULT`. Assembly scan wymaga już statusu komponentu dokładnie `QC_PASSED`, blokuje komponent z otwartą krytyczną NCR i zapisuje na `AssemblyLink` snapshot `component_qc_passed`, żeby shipment mógł zweryfikować jakość także po zmianie statusu itemu na `INSTALLED`. Shipment gate został też utwardzony tak, żeby blokować nie tylko braki, ale również nadmiarowe i nieoczekiwane komponenty, brak potwierdzonego QC na zainstalowanym komponencie oraz krytyczne NCR zainstalowanych komponentów, a sam update statusu korzysta już z tego samego werdyktu BOM, co odczyty diagnostyczne. Na poziomie bazy BOM ma już też twardą unikalność pozycji per `template_id + component_type` oraz indeksy pod najczęstsze lookupy.
W wersjach nadal mutowalnych można już nie tylko dodawać, ale też aktualizować i usuwać pozycje BOM.

Aktywny lookup BOM uwzględnia teraz również okno obowiązywania wersji przez pola `effective_from` i `effective_to`. Dla nowych montaży i shipmentu bez już przypiętej wersji oznacza to, że backend wybiera tylko BOM jednocześnie `ACTIVE` i skuteczny czasowo.

Pozycje BOM mogą być też łączone w `substitution_group`. Taka grupa pozwala zdefiniować jeden logiczny slot montażowy akceptujący kilka alternatywnych `component_type`, a assembly, coverage i shipment liczą wtedy spełnienie wymogu na poziomie całej grupy zamiast pojedynczej pozycji.

Do diagnostyki jakości zamontowanych części dochodzi teraz też `GET /api/devices/{serial_number}/component-quality`, które zwraca per komponent snapshot `component_qc_passed`, otwarte krytyczne NCR i prosty status `PASS`, `QC_NOT_PASSED` albo `CRITICAL_NCR_OPEN`, a na poziomie całego urządzenia także `primary_quality_status`, `primary_blocking_component_type`, `recommended_action` i `stale_bucket`.
Na poziomie operacyjnym doszło też `GET /api/component-quality`, które zbiera taki sam widok dla wielu urządzeń, wspiera filtry `device_type`, `variant_code`, `production_status`, `component_type`, `quality_status`, `primary_quality_status`, `primary_blocking_component_type`, `stale_bucket`, `recommended_action`, okna czasu `created_after` / `created_before` oraz `updated_after` / `updated_before`, `only_blocking`, paginację przez `offset` i `limit`, summary per status jakości, per `variant_code`, per `production_status`, per główny status urządzenia, per główny typ blockera, per bucket zalegania i per typ komponentu oraz rekomendowaną akcję, a także sortowanie `sort_by` / `sort_desc`, w tym po `created_at`, `updated_at`, `device_serial_number`, `blocked_components`, `production_status`, `primary_blocking_component_type`, `stale_bucket`, `variant_code` i `recommended_action`. Sam rekord urządzenia w tym widoku niesie też `device_created_at`, `device_updated_at`, własny `stale_bucket` i `primary_blocking_component_type`.

Wersje BOM mają też teraz jawne lineage przez `source_template_id` i `replaced_by_template_id`. Dzięki temu można odczytać, z której wersji powstała dana rewizja i czym została później zastąpiona.

## Najważniejsze endpointy

- `GET /health`
- `POST /api/operators`
- `POST /api/workstations`
- `POST /api/machines`
- `POST /api/auth/rfid-login`
- `GET /api/work-sessions`
- `POST /api/work-sessions/{work_session_id}/close`
- `POST /api/production-items`
- `POST /api/scan-events`
- `PATCH /api/barcodes/{barcode_value}/status`
- `GET /api/barcodes/{barcode_value}/scan-history`
- `POST /api/qc-runs`
- `POST /api/final-tests`
- `POST /api/devices`
- `POST /api/device-bom-templates`
- `GET /api/device-bom-templates/{device_type}/usage`
- `GET /api/device-bom-templates/{device_type}/catalog`
- `GET /api/device-bom-templates/{device_type}/bindings`
- `GET /api/device-bom-templates/{device_type}/coverage`
- `GET /api/device-bom-templates/{device_type}/readiness`
- `GET /api/device-bom-templates/{device_type}/diff`
- `POST /api/device-bom-templates/{device_type}/approve`
- `POST /api/device-bom-templates/{device_type}/release`
- `POST /api/device-bom-templates/{device_type}/clone`
- `POST /api/device-bom-templates/{device_type}/promote`
- `POST /api/device-bom-templates/{device_type}/activate`
- `POST /api/device-bom-templates/{device_type}/retire`
- `POST /api/device-bom-templates/{device_type}/items`
- `PATCH /api/device-bom-templates/{device_type}/items/{component_type}`
- `DELETE /api/device-bom-templates/{device_type}/items/{component_type}`
- `GET /api/devices`
- `GET /api/shipment-readiness`
- `GET /api/devices/{serial_number}`
- `GET /api/devices/{serial_number}/bom-resolution`
- `GET /api/devices/{serial_number}/bom-compliance`
- `GET /api/devices/{serial_number}/shipment-readiness`
- `GET /api/devices/{serial_number}/shipment-gate-history`
- `PATCH /api/devices/{serial_number}/status`
- `GET /api/audit-events`
  Obsługuje filtry `entity_type`, `entity_id`, `work_session_id`, `event_type` i `result`.
- `POST /api/service-sessions/upload`

## Kontekst traceability i work sessions

Operacje produkcyjne i jakościowe mogą przekazywać `work_session_id`, żeby powiązać akcję z aktywną sesją RFID operatora na stanowisku.

Jeśli identyfikator sesji jest podany, backend waliduje:

- tożsamość operatora
- tożsamość stanowiska
- tożsamość maszyny, jeśli ma znaczenie
- dozwoloną rolę operatora dla danej akcji
- timeout sesji

Ten kontekst trafia do audit trail i jest krytyczny dla traceability.

## Rekomendowany przepływ developerski

1. zaktualizować albo dodać modele SQLAlchemy
2. wygenerować migrację Alembic
3. zaimplementować lub poprawić logikę serwisu modułu
4. wystawić albo zaktualizować endpoint API
5. dodać lub poprawić testy
6. uruchomić `pytest`, `ruff check .` i `mypy app`

## Najbliższe cele refaktoru

- rozważyć wydzielenie osobnej domeny `devices`, jeśli device CRUD urośnie poza odpowiedzialność modułu `assembly`
- wydzielić współdzielone elementy DB ze starego `database.py` do `app/db/`
- rozszerzyć pokrycie PostgreSQL w CI o bardziej scenariuszowe przypadki integracyjne
- dodać mocniejsze reguły domenowe shipment, service i plików wraz z testami integracyjnymi
