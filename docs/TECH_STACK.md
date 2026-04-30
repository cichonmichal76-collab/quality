# Proponowany stack technologiczny

## Backend

Język: Python. Framework: FastAPI. Baza: PostgreSQL. ORM: SQLAlchemy. Migracje: Alembic. Walidacja: Pydantic. Testy: pytest. Lint/format: ruff. Typowanie: mypy. Auth: JWT/OAuth2. Storage: filesystem na MVP, później S3-compatible.

Uzasadnienie: Python i FastAPI pozwalają szybko budować API, dobrze pasują do final-test-runnera, integracji z USB/serial i późniejszych modułów analitycznych.

## Panel web Production / Quality

Wariant MVP: HTMX + Jinja/FastAPI albo prosty React. Wariant docelowy: TypeScript + React + Vite. UI: formularze, tabele, workflow steps, scan input. Testy: Vitest/Playwright.

Uzasadnienie: panel produkcyjny potrzebuje szybkości i stabilności. Jeśli priorytetem jest MVP, HTMX ogranicza złożoność. Jeśli planowana jest duża aplikacja, React/TypeScript będzie lepszy.

## Final-test-runner

Język: Python. Biblioteki: pyserial, httpx/requests, pydantic, typer. Testy: pytest. Tryby: MockMcuClient, SerialMcuClient.

Uzasadnienie: Python jest najprostszy do stanowisk testowych, integracji z USB/serial, logowania i szybkiej diagnostyki.

## Android mobile

Język: Kotlin. UI: Jetpack Compose. Baza lokalna: Room/SQLite. HTTP: OkHttp/Retrofit. USB: Android USB Host API. Zdjęcia: CameraX albo systemowy Camera Intent. Kolejka offline: WorkManager. Pliki: ZIP + checksums.

Uzasadnienie: Kotlin/Compose to natywny, stabilny wybór dla aplikacji serwisowej Android. Android jest lepszy na start niż iOS dla USB/OTG i pracy przemysłowej.

## AR dla serwisanta

MVP: zdjęcia referencyjne + hotspoty. Etap 2: CameraX + overlay labels. Etap 3: TensorFlow Lite albo ONNX Runtime Mobile. Dataset: zdjęcia i klatki z filmów urządzenia.

Uzasadnienie: MVP nie powinno zaczynać od pełnego AI. Najpierw atlas/hotspoty, potem model vision.

## Protokół MCU

MVP: USB CDC / serial over USB. Format: JSON Lines lub prosty line protocol. Docelowo: ramki z CRC i wersjonowaniem protokołu.

## DevOps

Repo: GitHub. CI/CD: GitHub Actions. Kontenery: Docker, Docker Compose. Registry: GitHub Container Registry. Skanowanie: Trivy/Semgrep opcjonalnie. Dokumentacja: Markdown w docs/.

## Języki konieczne

Python — backend, test runner, narzędzia produkcyjne. SQL — PostgreSQL, raportowanie, migracje. TypeScript — panel web, jeśli wybieramy React. Kotlin — Android. Markdown — dokumentacja, PRD, AGENTS.md. YAML — Docker Compose, GitHub Actions, konfiguracje.

## Techniki konieczne

REST API, offline-first mobile, USB serial communication, barcode/QR scanning, RFID login integration, RBAC, audit trail, event ledger dla scan events, checklist engine, state machine dla statusów części i urządzenia, file upload + checksum, ZIP package generation, CI/CD quality gates, test-driven validation dla reguł blokujących.
