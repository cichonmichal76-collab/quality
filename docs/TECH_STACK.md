# Proponowany stack technologiczny

## Backend

Język: Python. Framework: FastAPI. Baza: PostgreSQL. ORM: SQLAlchemy. Migracje: Alembic. Walidacja: Pydantic. Testy: pytest. Lint / format: ruff. Typowanie: mypy. Uwierzytelnianie: JWT / OAuth2. Przechowywanie plików: filesystem w MVP, później rozwiązanie zgodne z S3.

Uzasadnienie: Python i FastAPI pozwalają szybko budować API, dobrze pasują do `final-test-runner`, integracji z USB / serial i późniejszych modułów analitycznych.

## Panel web produkcji i jakości

Wariant MVP: HTMX + Jinja / FastAPI albo prosty React. Wariant docelowy: TypeScript + React + Vite. UI: formularze, tabele, kroki procesu, pole skanowania. Testy: Vitest / Playwright.

Uzasadnienie: panel produkcyjny potrzebuje szybkości i stabilności. Jeżeli priorytetem jest MVP, HTMX ogranicza złożoność. Jeżeli planowana jest większa aplikacja, React / TypeScript będzie lepszy.

## Final-test-runner

Język: Python. Biblioteki: `pyserial`, `httpx` / `requests`, `pydantic`, `typer`. Testy: pytest. Tryby: `MockMcuClient`, `SerialMcuClient`.

Uzasadnienie: Python jest najprostszy do stanowisk testowych, integracji z USB / serial, logowania i szybkiej diagnostyki.

## Android mobile

Język: Kotlin. UI: Jetpack Compose. Baza lokalna: Room / SQLite. HTTP: OkHttp / Retrofit. USB: Android USB Host API. Zdjęcia: CameraX albo systemowy mechanizm aparatu. Kolejka offline: WorkManager. Pliki: ZIP + sumy kontrolne.

Uzasadnienie: Kotlin / Compose to natywny, stabilny wybór dla aplikacji serwisowej Android. Android jest lepszy na start niż iOS dla USB / OTG i pracy przemysłowej.

## AR dla serwisanta

MVP: zdjęcia referencyjne + hotspoty. Etap 2: CameraX + etykiety nakładane na obraz. Etap 3: TensorFlow Lite albo ONNX Runtime Mobile. Dataset: zdjęcia i klatki z filmów urządzenia.

Uzasadnienie: MVP nie powinno zaczynać od pełnego AI. Najpierw atlas z hotspotami, potem model rozpoznawania obrazu.

## Protokół MCU

MVP: USB CDC / serial over USB. Format: JSON Lines albo prosty protokół liniowy. Docelowo: ramki z CRC i wersjonowaniem protokołu.

## DevOps

Repo: GitHub. CI/CD: GitHub Actions. Kontenery: Docker, Docker Compose. Registry: GitHub Container Registry. Skanowanie: Trivy / Semgrep opcjonalnie. Dokumentacja: Markdown w `docs/`.

## Języki konieczne

Python - backend, test runner, narzędzia produkcyjne. SQL - PostgreSQL, raportowanie, migracje. TypeScript - panel web, jeśli wybieramy React. Kotlin - Android. Markdown - dokumentacja, PRD, `AGENTS.md`. YAML - Docker Compose, GitHub Actions, konfiguracje.

## Techniki konieczne

REST API, architektura mobile offline-first, komunikacja USB serial, skanowanie barcode / QR, integracja logowania RFID, kontrola uprawnień oparta na rolach, audit trail, rejestr zdarzeń dla skanów, silnik checklist, maszyna stanów dla statusów części i urządzenia, wysyłka plików z sumą kontrolną, generowanie paczek ZIP, bramki jakości CI/CD i walidacja reguł blokujących oparta na testach.
