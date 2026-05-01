# Testy i CI

Ten runbook opisuje aktualne lokalne checki i zachowanie CI w repozytorium.

## Prosta zasada lokalna

Przed pushem:

- uruchom testy backendu, jeśli zmieniałeś backend
- uruchom testy runnera, jeśli zmieniałeś runner
- zastosuj migracje, jeśli zmienił się schemat
- nie zakładaj, że CI złapie wszystko, co łatwo znaleźć lokalnie

## Checki backendu

Z katalogu głównego repo:

```bash
cd backend
pytest
ruff check .
mypy app
```

Co sprawdza każdy krok:

- `pytest`
  poprawność API i przepływów
- `ruff check .`
  lint i problemy stylu
- `mypy app`
  typecheck backendu

Jeżeli zmiana dotyka migracji albo dashboardowego seeda, warto dodatkowo uruchomić:

```bash
cd backend
python -m app.services.demo_seed --device-type DEMO-LOCAL-CHECK --tag CHECK --verify
```

## Checki final-test-runnera

Z katalogu głównego repo:

```bash
cd final-test-runner
pytest
ruff check .
mypy servicetrace_runner
```

## Checki web-app

Z katalogu głównego repo:

```bash
cd web-app
npm ci
npm test
npm run build
```

Jeżeli zmieniałeś dashboard, filtry, integrację z API albo warstwę renderowania, uruchom też smoke e2e:

```bash
cd web-app
npm run e2e
```

Do e2e potrzebny jest backend pod `http://127.0.0.1:8000` z danymi `DEMO-E2E` albo własnym seedem o tym samym kształcie.

## Check buildu Docker

Z katalogu głównego repo:

```bash
docker compose build
```

Uruchamiaj to, gdy:

- zmieniły się zależności backendu
- zmienił się Dockerfile
- zmienił się `docker-compose.yml`

## Aktualny przepływ CI

Repo uruchamia dziś jeden przepływ GitHub Actions w:

[ci.yml](</C:/Users/cicho/OneDrive/Pulpit/Quality/service-trace-codex-v4/service-trace-v4/.github/workflows/ci.yml>)

Aktualne joby:

- `backend`
- `backend-postgres`
- `final-test-runner`
- `web-app`
- `web-app-e2e`
- `docker-build`

## Ważna uwaga o obecnym CI

Obecnie CI egzekwuje twardo:

- `ruff` i `mypy` dla backendu
- `ruff` i `mypy` dla runnera
- testy backendu na domyślnym środowisku
- osobny przebieg backendu na PostgreSQL z migracjami Alembic, podwójnym bootstrapem danych demo dashboardu oraz smoke testem filtrów i paginacji na zmigrowanej bazie
- testy i build web-app
- smoke test Playwright dla web-app na odpalonym lokalnie API

Najbezpieczniejsza lokalna polityka nadal brzmi:

- traktuj `ruff`, `mypy` i `pytest` jako wymagane lokalnie przed pushem

## Rekomendowana checklista przed pushem

1. uruchom `alembic upgrade head`, jeśli zmienił się schemat backendu
2. uruchom checki backendu, jeśli zmieniałeś backend
3. uruchom checki runnera, jeśli zmieniałeś runner
4. uruchom checki web-app, jeśli zmieniałeś frontend
5. przejrzyj `git diff`
6. commituj świadomie
7. pushuj tylko z czystego working tree

## Jak interpretować błędy

Jeśli pada `pytest`:

- priorytetem są błędy zachowania i przepływu danych

Jeśli pada `ruff`:

- napraw lint przed pushem, nawet jeśli CI dziś to przepuszcza

Jeśli pada `mypy`:

- napraw regresję typów, szczególnie tam, gdzie chodzi o kształty payloadów i opcjonalny kontekst sesji

Jeśli pada build Docker:

- sprawdź zależności, metadane pakietu i założenia dotyczące ścieżek

## Aktualne luki w testowaniu

- obecny przebieg PostgreSQL sprawdza migracje i suite testów, ale nie pokrywa jeszcze pełnych scenariuszy integracyjnych
- obecny przebieg PostgreSQL sprawdza już bootstrap dashboardowego datasetu na zmigrowanej bazie razem z podstawowymi filtrami i paginacją, ale nadal nie pokrywa pełnych scenariuszy integracyjnych poza tym smoke flow
- Playwright sprawdza dziś smoke flow dashboardu, filtry i paginację, ale nie pełne scenariusze regresyjne
- web-app nie ma jeszcze szerokiego pokrycia bardziej rozbudowanych scenariuszy wielostanowych
- Android nadal nie ma automatycznych checków w tym repo
