# Lokalny development

Ten runbook opisuje, jak uruchomić repo lokalnie do pracy nad backendem, panelem webowym i scenariuszami demo dashboardu.

## Aktualna rzeczywistość

Najczęstsza lokalna pętla pracy wygląda dziś tak:

1. backend i migracje
2. seed danych demo pod dashboard
3. web-app dla panelu operacyjnego
4. final-test-runner, gdy zmiana dotyka final testu

Backend nadal pozostaje centrum ciężkości repo, ale web-app ma już własne testy komponentowe i smoke e2e, więc warto traktować go jako aktywną część codziennego developmentu.

## Wymagania wstępne

- Python 3.11 lub nowszy
- Docker Desktop, jeśli chcesz użyć kontenerowego PostgreSQL
- Git

Rekomendowane:

- PostgreSQL przez Docker
- osobne virtual environment dla pakietów, jeśli nie używasz editable install globalnie

## Struktura repo, której będziesz dotykać najczęściej

```text
service-trace-v4/
|-- backend/
|-- final-test-runner/
|-- docs/
|-- web-app/
`-- android-app/
```

## Opcja 1: start przez Docker

Z katalogu głównego repo:

```bash
docker compose up --build
```

To daje:

- PostgreSQL na `localhost:5432`
- backend na `localhost:8000`

Wybierz tę opcję, gdy:

- chcesz mieć zachowanie bliższe docelowemu stackowi
- pracujesz nad zmianami backendowymi zależnymi od bazy
- nie chcesz stawiać PostgreSQL lokalnie ręcznie

## Opcja 2: uruchomienie backendu bezpośrednio

Z katalogu głównego repo:

```bash
cd backend
pip install -e .[dev]
alembic upgrade head
uvicorn app.main:app --reload
```

Domyślny lokalny adres backendu:

```text
http://localhost:8000
```

## Opcja 3: szybki start dashboardu demo

Z katalogu głównego repo:

```bash
cd backend
pip install -e .[dev]
cd ..
py scripts/dev_dashboard_demo.py --reload
```

Ten skrypt:

- wykona `alembic upgrade head`
- zasieje dane demo dla dashboardu
- uruchomi weryfikację kolejek po seedzie
- wystartuje backend pod `http://127.0.0.1:8000`

Przydatne warianty:

```bash
py scripts/dev_dashboard_demo.py --no-server
py scripts/dev_dashboard_demo.py --device-type DEMO-QA --tag QA --reload
py scripts/dev_dashboard_demo.py --database-url sqlite:///./servicetrace_dashboard_demo_alt.db --no-server
py scripts/dev_dashboard_demo.py --device-type DEMO-LOCAL --verify-only --no-server
```

Ostatnia komenda nie dosiewa danych. Służy do szybkiego sanity checku istniejącego
kompletnego datasetu demo dla podanego `device_type` i kończy się błędem, jeśli taki
zestaw nie istnieje albo nie spełnia oczekiwanego kontraktu dashboardu.

Po zakończeniu skrypt wypisuje teraz nie tylko `DATABASE_URL`, ale też
`DATABASE_PATH`, czyli rzeczywistą lokalną ścieżkę pliku SQLite użytego przez backend.

Po przygotowaniu backendu możesz uruchomić panel:

```bash
cd web-app
npm install
npm run dev
```

Domyślny adres Vite:

```text
http://127.0.0.1:5173
```

## Zmienne środowiskowe

Główne lokalne wartości domyślne są opisane w [`.env.example`](../../.env.example).

Najważniejsze zmienne:

- `DATABASE_URL`
- `STORAGE_DIR`
- `API_HOST`
- `API_PORT`
- `SERVICE_TRACE_ENV`
- `WORK_SESSION_TIMEOUT_MINUTES`

Domyślne wartości nadają się do pracy lokalnej, ale przy walidacji realnego zachowania persistence rekomendowany jest PostgreSQL zamiast SQLite.

## Szybki sanity check backendu

Po starcie:

```bash
curl http://localhost:8000/health
```

Oczekiwana odpowiedź:

```json
{"status":"ok"}
```

Możesz też użyć:

- `http://localhost:8000/docs`
- `http://localhost:8000/openapi.json`
- `http://127.0.0.1:5173`, jeśli działa web-app

## Lokalny setup final-test-runnera

Z katalogu głównego repo:

```bash
cd final-test-runner
pip install -e .[dev]
```

Uruchomienie flow mock:

```bash
python -m servicetrace_runner.main --device ZSS-000123 --backend http://localhost:8000 --mock --work-session-id WS-1234567890AB
```

Ważne:

- runner wymaga dziś poprawnego `work_session_id`, jeśli ma wysłać wynik do backendu
- w realnym flow end-to-end najpierw trzeba utworzyć taką sesję przez API backendu

## Rekomendowana codzienna pętla pracy

1. pobierz najnowsze zmiany
2. uruchom backend albo `py scripts/dev_dashboard_demo.py --reload`
3. zastosuj migracje lub pozwól skryptowi zrobić to za Ciebie
4. uruchom web-app, jeśli zmiana dotyka dashboardu
5. wprowadź zmiany w kodzie
6. uruchom właściwe testy lokalne
7. uruchom testy runnera, jeśli go dotykałeś
8. pushuj dopiero po zielonych checkach

## Częste lokalne pułapki

- zapomnienie o `alembic upgrade head` po zmianie schematu
- traktowanie SQLite tak, jakby zachowywał się identycznie jak PostgreSQL
- próba uruchomienia uploadu final testu bez aktywnej work session
- zmiana modeli backendu bez dodania migracji
- dokładanie logiki do legacy routes zamiast do modułów
- uruchomienie web-app bez działającego backendu na `localhost:8000` albo bez poprawnego `API base`
