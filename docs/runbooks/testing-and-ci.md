# Testing and CI

This runbook describes the current local checks and CI behavior for the repository.

## Local rule of thumb

Before pushing code:

- run backend tests for backend changes
- run runner tests for runner changes
- rerun migrations if schema changed
- do not rely on CI to find obvious local breakage

## Backend checks

From the repository root:

```bash
cd backend
pytest
ruff check .
mypy app
```

What each check covers:

- `pytest`
  API and workflow correctness
- `ruff check .`
  lint and style issues
- `mypy app`
  type checking for backend code

## Final-test-runner checks

From the repository root:

```bash
cd final-test-runner
pytest
ruff check .
```

Note:

- the current CI file includes `mypy servicetrace_runner`, but the package optional dependencies in `final-test-runner` do not currently list `mypy`

## Docker build check

From the repository root:

```bash
docker compose build
```

Run this when:

- backend dependencies changed
- Dockerfile changed
- compose configuration changed

## Current CI workflow

The repository currently runs one GitHub Actions workflow at:

[ci.yml](</C:/Users/cicho/OneDrive/Pulpit/Quality/service-trace-codex-v4/service-trace-v4/.github/workflows/ci.yml>)

Current jobs:

- `backend`
- `final-test-runner`
- `docker-build`

## Important CI caveat

Right now:

- backend lint is non-blocking
- backend mypy is non-blocking
- runner lint is non-blocking
- runner mypy is non-blocking

That means CI can still go green even when some quality checks fail.

Until this is tightened, the safest local policy is:

- treat `ruff` and `mypy` as required locally

## Recommended pre-push checklist

1. run `alembic upgrade head` if the backend schema changed
2. run backend checks if backend code changed
3. run runner checks if runner code changed
4. inspect `git diff`
5. commit intentionally
6. push only from a clean working tree

## How to interpret failures

If `pytest` fails:

- prioritize behavior and data-flow bugs first

If `ruff` fails:

- fix lint issues before pushing, even if CI would currently allow them

If `mypy` fails:

- fix type regressions before pushing, especially around payload shapes and optional session context

If Docker build fails:

- check dependency changes, package metadata, and path assumptions

## Current testing gaps

- PostgreSQL integration tests are not yet enforced in CI
- CI quality gates are still softer than the target architecture suggests
- web and Android do not yet have meaningful automated checks in this repo
