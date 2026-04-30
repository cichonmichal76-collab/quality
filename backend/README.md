# ServiceTrace Backend

FastAPI backend dla ServiceTrace Platform.

## Uruchomienie lokalne

```bash
pip install -e .[dev]
alembic upgrade head
uvicorn app.main:app --reload
```

## Migracje bazy danych

```bash
alembic upgrade head
alembic revision --autogenerate -m "opis zmiany"
```

Backend nie tworzy już tabel automatycznie przy starcie aplikacji. Schemat powinien być przygotowany przez migracje Alembic.

## Docker

```bash
docker compose up --build
```

## Najważniejsze endpointy

- `GET /health`
- `POST /api/operators`
- `POST /api/workstations`
- `POST /api/machines`
- `POST /api/auth/rfid-login`
- `GET /api/work-sessions`
- `POST /api/work-sessions/{work_session_id}/close`
- `PATCH /api/barcodes/{barcode_value}/status`
- `GET /api/barcodes/{barcode_value}/scan-history`
- `POST /api/devices`
- `GET /api/devices`
- `GET /api/devices/{serial_number}`
- `PATCH /api/devices/{serial_number}/status`
- `POST /api/production-items`
- `POST /api/scan-events`
- `POST /api/qc-runs`
- `POST /api/final-tests`
- `GET /api/audit-events`
- `POST /api/service-sessions/upload`

## Kontekst traceability

Operacje produkcyjne i jakościowe mogą przekazywać opcjonalne `work_session_id`, aby powiązać zapis z aktywną sesją RFID operatora. Jeśli `work_session_id` jest podane, backend waliduje zgodność operatora, stanowiska i maszyny oraz zapisuje audit trail dostępny przez `GET /api/audit-events`.
