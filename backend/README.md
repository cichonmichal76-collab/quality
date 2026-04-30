# ServiceTrace Backend

FastAPI backend for the ServiceTrace Platform.

The backend is the system of record for operators, RFID sessions, barcodes, production items, devices, QC, NCR, final tests, and audit events.

## Prerequisites

- Python 3.11+
- PostgreSQL 16+ for the target local stack
- Docker Desktop if you want the containerized setup

## Local development

```bash
cd backend
pip install -e .[dev]
alembic upgrade head
uvicorn app.main:app --reload
```

The API starts on `http://localhost:8000` by default.

## Environment variables

The backend reads configuration from environment variables defined in [`.env.example`](../.env.example).

- `DATABASE_URL`
  Default: `sqlite:///./servicetrace_dev.db`
- `STORAGE_DIR`
  Default: `./app/storage`
- `API_HOST`
  Default: `0.0.0.0`
- `API_PORT`
  Default: `8000`
- `SERVICE_TRACE_ENV`
  Default: `local`
- `WORK_SESSION_TIMEOUT_MINUTES`
  Default: `480`

For day-to-day development, PostgreSQL is recommended so local behavior stays close to the Docker stack and production target.

## Docker

From the repository root:

```bash
docker compose up --build
```

This starts:

- PostgreSQL on `localhost:5432`
- backend API on `localhost:8000`

## Database migrations

The application no longer creates tables automatically at startup. Schema changes must go through Alembic migrations.

Apply the latest schema:

```bash
cd backend
alembic upgrade head
```

Create a new migration after model changes:

```bash
cd backend
alembic revision --autogenerate -m "describe change"
```

Current migration history covers:

- initial schema bootstrap
- QC run target expansion

## Tests and quality checks

```bash
cd backend
pytest
ruff check .
mypy app
```

Tests create and tear down schema explicitly, so they do not rely on application startup side effects.

## Package layout

```text
backend/
|-- alembic/          migration environment and revisions
|-- app/
|   |-- api/          router composition and API wiring
|   |-- core/         config and shared backend helpers
|   |-- db/           reserved place for future DB split
|   |-- models/       SQLAlchemy entities
|   |-- modules/      domain-oriented API and service modules
|   |-- schemas/      Pydantic request/response models
|   |-- services/     shared service helpers
|   `-- main.py       FastAPI entrypoint
`-- tests/            API and workflow tests
```

## Domain modules

The target architecture is a modular monolith. The `app/modules/` directory is the main boundary for that split.

Current modules:

- `auth_rfid`
- `traceability`
- `qc`
- `assembly`
- `final_test`
- `shipment`
- `service`
- `files`

Some endpoints still exist in legacy routing code while the refactor is in progress. New work should prefer module routers and module services over expanding the legacy route file.

## API highlights

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
- `GET /api/devices`
- `GET /api/devices/{serial_number}`
- `PATCH /api/devices/{serial_number}/status`
- `GET /api/audit-events`
- `POST /api/service-sessions/upload`

## Traceability context and work sessions

Production and quality operations can include `work_session_id` to link actions to an active RFID workstation session.

When a session id is provided, the backend validates:

- operator identity
- workstation identity
- machine identity when relevant
- allowed operator role for the requested action
- session timeout

This context is written to the audit trail and is critical for traceability.

## Recommended development workflow

1. update or add SQLAlchemy models
2. generate an Alembic migration
3. implement or adjust module service logic
4. expose or update the API route
5. add or update tests
6. run `pytest`, `ruff check .`, and `mypy app`

## Near-term refactor targets

- move remaining legacy routes into domain modules
- split shared DB concerns from the old `database.py` into `app/db/`
- add PostgreSQL integration coverage in CI
- tighten CI so lint and type checks are blocking
