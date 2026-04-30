# Lokalny development

Ten runbook opisuje, jak uruchomić repo lokalnie do pracy skoncentrowanej głównie na backendzie.

## Aktualna rzeczywistość

Najłatwiej pracuje się dziś z repo w kolejności:

1. backend
2. final-test-runner
3. dokumentacja
4. web i Android później

Backend jest najbardziej kompletną częścią repo i stanowi centrum ciężkości dla lokalnego developmentu.

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
2. uruchom backend
3. zastosuj migracje
4. wprowadź zmiany w kodzie
5. uruchom testy i lint backendu
6. uruchom testy runnera, jeśli go dotykałeś
7. pushuj dopiero po zielonych checkach

## Częste lokalne pułapki

- zapomnienie o `alembic upgrade head` po zmianie schematu
- traktowanie SQLite tak, jakby zachowywał się identycznie jak PostgreSQL
- próba uruchomienia uploadu final testu bez aktywnej work session
- zmiana modeli backendu bez dodania migracji
- dokładanie logiki do legacy routes zamiast do modułów
