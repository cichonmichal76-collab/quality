# Testy web

Testy jednostkowe są w `src/*.test.ts` i obejmują helpery API oraz
formatowanie dashboardu.

Smoke test end-to-end jest w `tests/dashboard.e2e.ts` i przechodzi przez obie
zakładki panelu na zasianych danych `DEMO-E2E`.

Lokalny przebieg:

```bash
cd ../backend
python -m alembic upgrade head
python -m app.services.demo_seed --device-type DEMO-E2E --tag E2E --verify
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

W drugim terminalu:

```bash
cd ../web-app
npm run e2e
```
