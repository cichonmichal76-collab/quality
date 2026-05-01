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

Zaobserwowane domeny backendu działają już przez routery i serwisy modułowe. Moduł `assembly` obsługuje dodatkowo device CRUD, proste endpointy komponentów i lifecycle BOM per `device_type` oraz `variant_code`, razem z regułami `part_number`, `revision`, `drawing_number` i `drawing_revision`. Status `RETIRED` zamraża wersję BOM dla nowych zmian i blokuje nowe montaże lub shipment bez aktywnej wersji, jeśli urządzenie nie jest jeszcze przypięte do konkretnego BOM.
Backend wspiera też klonowanie wersji BOM do nowej rewizji wraz z pozycjami, z opcjonalną natychmiastową aktywacją nowej wersji, oraz promocję aktywnej wersji do nowej rewizji w jednym kroku. Wersje BOM mają format numeryczny rozdzielany kropkami, a nowe rewizje w `clone` i `promote` muszą być semantycznie większe od wersji źródłowej. Aktywny BOM użyty już przez urządzenia dostaje soft-lock na dalsze rozszerzanie i powinien być rozwijany przez kolejną wersję. Dodatkowo wersja BOM przechodzi teraz jawny release workflow z `approved_by`, `approved_at`, `release_note` i endpointem `release`.
Backend udostępnia też odczyt `usage` dla BOM, który pokazuje liczbę powiązanych urządzeń, mutowalność wersji i rekomendowaną kolejną akcję, odczyt `bindings` z konkretną listą urządzeń przypiętych do wersji, odczyt `coverage` z kompletnością tych urządzeń względem BOM, odczyt `diff`, który porównuje dwie wersje BOM i rozbija zmiany na `added`, `removed`, `modified` i `unchanged_count`, oraz odczyt `readiness`, który pokazuje, czy wersja może być bezpiecznie aktywowana. Nowy kontrakt jest teraz twardszy: BOM nie może być utworzony od razu jako aktywny, aktywacja wymaga wcześniejszego approval, a `clone` z `activate=true` oraz `promote` wymagają przekazania `approved_by`. Jeśli zatwierdzona wersja robocza BOM zostanie potem zmieniona przez dodanie, edycję albo usunięcie pozycji, approval jest automatycznie czyszczony i trzeba go nadać ponownie. Dodatkowo aktywna wersja BOM nie jest już modyfikowalna nawet wtedy, gdy nie została jeszcze użyta przez urządzenia; od tego momentu zmiany mają iść wyłącznie przez `clone` albo `promote`. Lookup BOM wspiera teraz `variant_code` z fallbackiem do `DEFAULT`. Shipment gate został też utwardzony tak, żeby blokować nie tylko braki, ale również nadmiarowe i nieoczekiwane komponenty. Na poziomie bazy BOM ma już też twardą unikalność pozycji per `template_id + component_type` oraz indeksy pod najczęstsze lookupy.
W wersjach nadal mutowalnych można już nie tylko dodawać, ale też aktualizować i usuwać pozycje BOM.

Aktywny lookup BOM uwzględnia teraz również okno obowiązywania wersji przez pola `effective_from` i `effective_to`. Dla nowych montaży i shipmentu bez już przypiętej wersji oznacza to, że backend wybiera tylko BOM jednocześnie `ACTIVE` i skuteczny czasowo.

Pozycje BOM mogą być też łączone w `substitution_group`. Taka grupa pozwala zdefiniować jeden logiczny slot montażowy akceptujący kilka alternatywnych `component_type`, a assembly, coverage i shipment liczą wtedy spełnienie wymogu na poziomie całej grupy zamiast pojedynczej pozycji.

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
- `GET /api/devices/{serial_number}`
- `PATCH /api/devices/{serial_number}/status`
- `GET /api/audit-events`
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
