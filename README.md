# ServiceTrace Platform

ServiceTrace Platform is a traceability and quality system for a medical device production and service workflow.

The platform tracks physical parts and subassemblies from machine output, through QC and final assembly, to final test, shipment, commissioning, and later service history.

Detailed product and process documents in `docs/` are currently maintained mostly in Polish.

## What problem this repo solves

- each physical part gets its own unique barcode, QR code, or DataMatrix
- operators log in with RFID at a workstation
- every scan, QC step, final test, and assembly action is attributed to a person, workstation, machine, and timestamp
- finished devices can be traced back to exact component instances
- shipment can be blocked if quality or final test rules are not satisfied

## Current status

This repository is currently a backend-first MVP.

Implemented now:

- FastAPI backend with SQLAlchemy models and Alembic migrations
- RFID login and workstation work sessions
- barcode lifecycle and scan history
- production item traceability
- QC checklist MVP with automatic PASS/FAIL evaluation
- NCR creation on blocking QC or final test failures
- assembly links between device and scanned components
- Python final-test runner with mock MCU and serial/USB interface
- CI workflow for backend, runner, and Docker build

In scaffold / placeholder state:

- `web-app/` production and quality UI
- `android-app/` offline-first service mobile app
- service AR part identification

## Repository layout

```text
.
|-- backend/             FastAPI backend, DB models, API, tests, Alembic
|-- final-test-runner/   Python CLI runner for final device test
|-- web-app/             front-end scaffold for production / quality UI
|-- android-app/         Android scaffold for service workflows
|-- docs/                PRD, pipeline, stack, mechanisms, backlog
|-- .github/             CI workflow, PR template, CODEOWNERS
`-- docker-compose.yml   local backend + PostgreSQL startup
```

## Backend architecture at a glance

The backend is evolving toward a modular monolith with domain modules such as:

- `auth_rfid`
- `traceability`
- `qc`
- `assembly`
- `final_test`
- `shipment`
- `service`
- `files`

There is still some legacy routing code in the repo, but the new module layout is already in place and active for selected domains.

## Quick start

### Option 1: Docker

Start PostgreSQL and the backend:

```bash
docker compose up --build
```

Backend will be available at `http://localhost:8000`.

### Option 2: Local backend development

```bash
cd backend
pip install -e .[dev]
alembic upgrade head
uvicorn app.main:app --reload
```

Useful local environment variables are listed in [`.env.example`](./.env.example).

## Tests and quality checks

Backend:

```bash
cd backend
pytest
ruff check .
mypy app
```

Final test runner:

```bash
cd final-test-runner
pytest
ruff check .
```

## Final test runner

Mock mode:

```bash
cd final-test-runner
python -m servicetrace_runner.main --device ZSS-000123 --backend http://localhost:8000 --mock --work-session-id WS-1234567890AB
```

Serial / USB CDC mode:

```bash
cd final-test-runner
python -m servicetrace_runner.main --device ZSS-000123 --backend http://localhost:8000 --port COM5 --work-session-id WS-1234567890AB
```

## Key backend capabilities

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

## Constraints specific to the product

- the target device is a medical device
- the device itself does not use Wi-Fi, Bluetooth, or BLE
- technical communication with MCU is wired over USB
- the mobile phone used by a service technician may have internet, but the device does not communicate wirelessly

## Product roadmap

The implementation plan is described in [docs/CODEX_PIPELINE.md](./docs/CODEX_PIPELINE.md).

High-level order:

1. repository and CI foundation
2. backend core and data model
3. RFID sessions
4. barcode lifecycle
5. QC
6. assembly by scan
7. final test runner
8. shipment gate
9. offline mobile commissioning
10. service AR identification

## Documentation

- [docs/PRD.md](./docs/PRD.md) - product requirements
- [docs/api/README.md](./docs/api/README.md) - current API guide and example flows
- [docs/TECH_STACK.md](./docs/TECH_STACK.md) - proposed technology stack
- [docs/MECHANISMS.md](./docs/MECHANISMS.md) - system mechanisms
- [docs/BACKLOG.md](./docs/BACKLOG.md) - functional backlog
- [docs/CI_CD.md](./docs/CI_CD.md) - CI/CD direction
- [docs/adr/README.md](./docs/adr/README.md) - architecture decisions
- [backend/README.md](./backend/README.md) - backend-specific notes
- [final-test-runner/README.md](./final-test-runner/README.md) - runner usage
- [AGENTS.md](./AGENTS.md) - coding-agent workflow and project rules

## Near-term improvement targets

- split the remaining legacy API routes into domain modules
- harden CI so lint and type checks are blocking
- add PostgreSQL integration tests in CI
- build a usable web UI for production and quality flows
- start the Android commissioning MVP
