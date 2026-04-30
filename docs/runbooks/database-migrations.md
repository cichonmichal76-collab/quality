# Database Migrations

This runbook describes how to work with Alembic migrations in the backend.

## Why this matters

The backend no longer creates tables automatically at application startup. Schema changes must go through Alembic.

That means:

- model change without migration is incomplete work
- local database drift is a real failure mode
- tests and runtime setup assume schema has been prepared explicitly

## Current migration location

Alembic files live in:

```text
backend/alembic/
```

Main entry files:

- `backend/alembic.ini`
- `backend/alembic/env.py`
- `backend/alembic/versions/`

## Apply the latest schema

From the repository root:

```bash
cd backend
alembic upgrade head
```

Run this:

- after pulling changes
- after switching branches
- before manual backend testing

## Create a new migration

Typical flow:

1. update SQLAlchemy models
2. generate migration
3. inspect migration manually
4. apply it locally
5. run tests

Generate:

```bash
cd backend
alembic revision --autogenerate -m "describe change"
```

## Review checklist for a new migration

Before committing a generated migration, verify:

- the file touches only the tables and columns you intended
- no accidental drop or rename slipped in
- nullable and default behavior matches the application logic
- indexes and unique constraints are what you expect
- data-preserving behavior is acceptable for the change

## Upgrade after generating

```bash
cd backend
alembic upgrade head
```

Then run:

```bash
pytest
ruff check .
mypy app
```

## When model and migration are both required

You should make both changes in the same code change when:

- adding a new entity
- adding or renaming a column
- changing nullability
- changing uniqueness constraints
- changing foreign-key structure

## Common migration mistakes

- editing models and forgetting a migration
- trusting autogenerate without reading the file
- leaving unrelated model noise in the generated migration
- not applying the migration locally before pushing

## Current migration expectations in this repo

Today the backend has already moved to an Alembic-based workflow, so future backend work should follow this rule:

- no schema change is complete without a migration file

## Practical recovery steps

If local backend startup fails after a schema-related change:

1. stop the backend
2. go to `backend/`
3. run `alembic upgrade head`
4. rerun tests
5. restart `uvicorn`

If a generated migration looks suspicious:

1. do not commit it yet
2. inspect model changes
3. regenerate or edit carefully
4. rerun `alembic upgrade head`
