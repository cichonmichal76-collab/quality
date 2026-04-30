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

## Checki final-test-runnera

Z katalogu głównego repo:

```bash
cd final-test-runner
pytest
ruff check .
```

Uwaga:

- obecny plik CI zawiera `mypy servicetrace_runner`, ale optional dependencies pakietu `final-test-runner` nie dodają jeszcze `mypy`

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
- `final-test-runner`
- `docker-build`

## Ważna uwaga o obecnym CI

Obecnie:

- lint backendu jest nieblokujący
- mypy backendu jest nieblokujący
- lint runnera jest nieblokujący
- mypy runnera jest nieblokujący

To oznacza, że CI może pozostać zielone, nawet jeśli część quality checks zawiedzie.

Dopóki to nie zostanie zaostrzone, najbezpieczniejsza lokalna polityka brzmi:

- traktuj `ruff` i `mypy` jako wymagane lokalnie

## Rekomendowana checklista przed pushem

1. uruchom `alembic upgrade head`, jeśli zmienił się schemat backendu
2. uruchom checki backendu, jeśli zmieniałeś backend
3. uruchom checki runnera, jeśli zmieniałeś runner
4. przejrzyj `git diff`
5. commituj świadomie
6. pushuj tylko z czystego working tree

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

- testy integracyjne PostgreSQL nie są jeszcze wymuszane w CI
- quality gates w CI są nadal bardziej miękkie niż sugeruje docelowa architektura
- web i Android nie mają jeszcze sensownych automatycznych checków w tym repo
