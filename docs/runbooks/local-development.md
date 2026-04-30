# Local Development

This runbook describes how to get the repository running locally for backend-focused work.

## Current reality

The repository is currently easiest to work with in this order:

1. backend
2. final-test-runner
3. documentation
4. web and Android scaffolds later

The backend is the most complete part of the repo and is the center of gravity for local development.

## Prerequisites

- Python 3.11 or newer
- Docker Desktop if you want the containerized PostgreSQL stack
- Git

Recommended:

- PostgreSQL via Docker
- a dedicated virtual environment per package if you are not using editable installs globally

## Repository layout you will touch most often

```text
service-trace-v4/
|-- backend/
|-- final-test-runner/
|-- docs/
|-- web-app/
`-- android-app/
```

## Option 1: start with Docker

From the repository root:

```bash
docker compose up --build
```

What this gives you:

- PostgreSQL on `localhost:5432`
- backend on `localhost:8000`

Use this option when:

- you want behavior closer to the target stack
- you are working on database-sensitive backend changes
- you want to avoid local PostgreSQL setup

## Option 2: run backend directly

From the repository root:

```bash
cd backend
pip install -e .[dev]
alembic upgrade head
uvicorn app.main:app --reload
```

Default local backend URL:

```text
http://localhost:8000
```

## Environment variables

The main local defaults are defined in [`.env.example`](../../.env.example).

Important values:

- `DATABASE_URL`
- `STORAGE_DIR`
- `API_HOST`
- `API_PORT`
- `SERVICE_TRACE_ENV`
- `WORK_SESSION_TIMEOUT_MINUTES`

Current defaults are suitable for local work, but PostgreSQL is recommended over SQLite when you are validating real persistence behavior.

## Local backend sanity check

After startup:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok"}
```

You can also use:

- `http://localhost:8000/docs`
- `http://localhost:8000/openapi.json`

## Final-test-runner local setup

From the repository root:

```bash
cd final-test-runner
pip install -e .[dev]
```

Run the mock flow:

```bash
python -m servicetrace_runner.main --device ZSS-000123 --backend http://localhost:8000 --mock --work-session-id WS-1234567890AB
```

Important:

- the runner currently requires a valid `work_session_id` for backend upload
- in a real end-to-end flow, create that session first through the backend API

## Recommended daily loop

1. pull latest changes
2. start backend
3. apply migrations
4. make code changes
5. run backend tests and lint
6. run runner tests if you touched runner code
7. push only after checks are green

## Common local pitfalls

- forgetting `alembic upgrade head` after a schema change
- using SQLite behavior as if it were identical to PostgreSQL
- trying to run final-test uploads without a valid active work session
- changing backend models without adding a migration
- expanding legacy routes instead of moving logic into modules
