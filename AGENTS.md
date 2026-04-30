# AGENTS.md — instrukcje dla Codex

## Cel repozytorium

Repozytorium implementuje ServiceTrace Platform: system traceability, Quality, final test, mobile commissioning i serwisowej identyfikacji części dla urządzenia medycznego.

Codex ma traktować `docs/PRD.md` jako nadrzędne źródło wymagań. Dla kolejności prac używaj `docs/CODEX_PIPELINE.md`. Dla mechanizmów systemowych używaj `docs/MECHANISMS.md`. Dla backlogu używaj `docs/BACKLOG.md`.

## Zasady krytyczne

Nie dodawaj Wi‑Fi, Bluetooth ani BLE do urządzenia medycznego. Nie implementuj firmware update w MVP. Nie implementuj sterowania napędami ani funkcjami krytycznymi z aplikacji mobilnej. Nie implementuj integracji z Symfonią ani SMS w MVP. Nie traktuj AR jako podstawowego mechanizmu traceability; AR służy tylko serwisantowi do rozpoznania części i pokazania numeru części oraz historii.

## Priorytet implementacji

Najpierw backend i model danych. Potem RFID, stanowiska, barcode lifecycle i QC. Potem assembly by scan. Potem final-test-runner. Potem aplikacja mobilna. Na końcu Service AR Part Identification jako atlas/hotspoty.

## Stack docelowy

Backend: Python, FastAPI, PostgreSQL, SQLAlchemy, Pydantic, Alembic, pytest.
Panel web: TypeScript + React albo prosty panel HTMX na MVP.
Final-test-runner: Python, pyserial, httpx/requests, pytest.
Android: Kotlin, Jetpack Compose, Room, USB Host API, OkHttp/Retrofit.
CI/CD: GitHub Actions, Docker, pytest, ruff, mypy, Gradle tests, optional Trivy/Semgrep.

## Komendy weryfikacyjne

Backend: `pytest`, `ruff check .`, `mypy app`.
Final-test-runner: `pytest`, `ruff check .`, `mypy servicetrace_runner`.
Android: `./gradlew test`, `./gradlew lint`.
Docker: `docker compose build`.

## Done means

Zadanie jest zakończone tylko wtedy, gdy kod spełnia wymaganie z PRD, dodano lub zaktualizowano testy, testy przechodzą, dokumentacja została zaktualizowana, nie naruszono ograniczeń medycznych i bezpieczeństwa, a zmiana jest możliwa do przejrzenia w małym commicie.
