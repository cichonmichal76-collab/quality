# ServiceTrace Platform

ServiceTrace Platform to system traceability i quality dla procesu produkcji oraz serwisu urządzenia medycznego.

Platforma śledzi fizyczne części i podzespoły od zejścia z maszyny, przez QC i montaż końcowy, aż po final test, wysyłkę, commissioning i późniejszą historię serwisową.

## Jaki problem rozwiązuje repo

- każda fizyczna część dostaje własny unikalny barcode, QR albo DataMatrix
- operator loguje się kartą RFID na stanowisku
- każdy scan, krok QC, final test i akcja montażowa są przypisane do osoby, stanowiska, maszyny i czasu
- gotowe urządzenie można prześledzić do konkretnych egzemplarzy komponentów
- wysyłka może zostać zablokowana, jeśli warunki jakościowe lub final test nie są spełnione

## Aktualny stan

To repo jest obecnie MVP budowanym z backendem na pierwszym planie.

Już zaimplementowane:

- backend FastAPI z modelami SQLAlchemy i migracjami Alembic
- logowanie RFID i sesje stanowiskowe
- lifecycle barcode oraz historia skanów
- traceability `production_item`
- MVP checklist QC z automatyczną oceną PASS/FAIL
- tworzenie NCR przy blokujących błędach QC lub final testu
- linki montażowe między urządzeniem a zeskanowanymi komponentami
- Pythonowy final-test-runner z mock MCU i interfejsem serial/USB
- przepływ CI dla backendu, runnera i buildu Docker

Na poziomie scaffoldu lub szkicu:

- `web-app/` jako UI dla produkcji i jakości
- `android-app/` jako mobilny klient offline-first dla serwisu
- Service AR Part Identification

## Struktura repozytorium

```text
.
|-- backend/             backend FastAPI, modele DB, API, testy, Alembic
|-- final-test-runner/   Python CLI do final testu urządzenia
|-- web-app/             scaffold frontendu Production / Quality
|-- android-app/         scaffold aplikacji Android dla serwisu
|-- docs/                PRD, pipeline, stack, mechanizmy, backlog
|-- .github/             przepływ CI, szablon PR, CODEOWNERS
`-- docker-compose.yml   lokalny start backendu i PostgreSQL
```

## Architektura backendu w skrócie

Backend ewoluuje w kierunku modularnego monolitu z modułami domenowymi takimi jak:

- `auth_rfid`
- `traceability`
- `qc`
- `assembly`
- `final_test`
- `shipment`
- `service`
- `files`
- `nonconformities`

Zaobserwowane domeny backendu działają już przez moduły. `assembly` obsługuje także device CRUD i proste endpointy komponentów.
Ten sam moduł utrzymuje też aktywne szablony BOM per `device_type`, a `shipment` wykorzystuje je do walidacji `READY_FOR_SHIPMENT`.

## Szybki start

### Opcja 1: Docker

Uruchom PostgreSQL i backend:

```bash
docker compose up --build
```

Backend będzie dostępny pod `http://localhost:8000`.

### Opcja 2: lokalny development backendu

```bash
cd backend
pip install -e .[dev]
alembic upgrade head
uvicorn app.main:app --reload
```

Przydatne zmienne środowiskowe są opisane w [`.env.example`](./.env.example).

## Testy i quality checks

Backend:

```bash
cd backend
pytest
ruff check .
mypy app
```

Final-test-runner:

```bash
cd final-test-runner
pytest
ruff check .
mypy servicetrace_runner
```

## Final-test-runner

Tryb mock:

```bash
cd final-test-runner
python -m servicetrace_runner.main --device ZSS-000123 --backend http://localhost:8000 --mock --work-session-id WS-1234567890AB
```

Tryb serial / USB CDC:

```bash
cd final-test-runner
python -m servicetrace_runner.main --device ZSS-000123 --backend http://localhost:8000 --port COM5 --work-session-id WS-1234567890AB
```

## Najważniejsze możliwości backendu

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
- `GET /api/devices/{serial_number}`
- `PATCH /api/devices/{serial_number}/status`
- `GET /api/audit-events`

## Ograniczenia produktowe

- urządzenie docelowe jest urządzeniem medycznym
- samo urządzenie nie używa Wi-Fi, Bluetooth ani BLE
- komunikacja techniczna z MCU odbywa się przewodowo po USB
- telefon serwisanta może mieć internet, ale urządzenie nie komunikuje się bezprzewodowo

## Roadmapa produktu

Kolejność implementacji jest opisana w [docs/CODEX_PIPELINE.md](./docs/CODEX_PIPELINE.md).

Wysokopoziomowo:

1. fundament repo i CI
2. backend core i model danych
3. sesje RFID
4. lifecycle barcode
5. QC
6. assembly by scan
7. final-test-runner
8. shipment gate
9. commissioning mobilny offline
10. identyfikacja serwisowa AR

## Dokumentacja

- [docs/PRD.md](./docs/PRD.md) - wymagania produktowe
- [docs/api/README.md](./docs/api/README.md) - aktualny przewodnik po API i przykładowe flow
- [docs/domain/README.md](./docs/domain/README.md) - model domenowy i mapa encji biznesowych
- [docs/diagrams/README.md](./docs/diagrams/README.md) - diagramy architektury i przepływów
- [docs/runbooks/README.md](./docs/runbooks/README.md) - procedury operacyjne do pracy lokalnej i publikacji
- [docs/TECH_STACK.md](./docs/TECH_STACK.md) - proponowany stack technologiczny
- [docs/MECHANISMS.md](./docs/MECHANISMS.md) - mechanizmy systemowe
- [docs/BACKLOG.md](./docs/BACKLOG.md) - backlog funkcjonalny
- [docs/CI_CD.md](./docs/CI_CD.md) - kierunek CI/CD
- [docs/adr/README.md](./docs/adr/README.md) - decyzje architektoniczne
- [backend/README.md](./backend/README.md) - notatki specyficzne dla backendu
- [final-test-runner/README.md](./final-test-runner/README.md) - użycie runnera
- [AGENTS.md](./AGENTS.md) - zasady pracy dla agentów kodujących

## Najbliższe cele

- wydzielić, jeśli zajdzie potrzeba, osobną domenę `devices`, zamiast zostawiać device CRUD w `assembly`
- rozszerzyć testy PostgreSQL w CI o bardziej scenariuszowe przypadki integracyjne
- zbudować używalny UI dla produkcji i jakości
- rozpocząć MVP Android commissioning
