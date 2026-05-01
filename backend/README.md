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

Zaobserwowane domeny backendu działają już przez routery i serwisy modułowe. Moduł `assembly` obsługuje dodatkowo device CRUD, proste endpointy komponentów i lifecycle BOM per `device_type`, razem z regułami `part_number`, `revision`, `drawing_number` i `drawing_revision`. Status `RETIRED` zamraża wersję BOM dla nowych zmian i blokuje nowe montaże lub shipment bez aktywnej wersji, jeśli urządzenie nie jest jeszcze przypięte do konkretnego BOM.
Backend wspiera też klonowanie wersji BOM do nowej rewizji wraz z pozycjami, z opcjonalną natychmiastową aktywacją nowej wersji, oraz promocję aktywnej wersji do nowej rewizji w jednym kroku. Wersje BOM mają format numeryczny rozdzielany kropkami, a nowe rewizje w `clone` i `promote` muszą być semantycznie większe od wersji źródłowej.

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
- `POST /api/device-bom-templates/{device_type}/clone`
- `POST /api/device-bom-templates/{device_type}/promote`
- `POST /api/device-bom-templates/{device_type}/activate`
- `POST /api/device-bom-templates/{device_type}/retire`
- `POST /api/device-bom-templates/{device_type}/items`
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
