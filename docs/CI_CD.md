# CI/CD - propozycja dla ServiceTrace

## Cel CI/CD

CI/CD ma pilnować jakości kodu, testów, migracji, bezpieczeństwa i powtarzalnego builda wszystkich modułów. System dotyczy urządzenia medycznego, więc pipeline powinien być konserwatywny: najpierw testy i walidacja, dopiero potem build i release.

## Gałęzie

- `main` - stabilna gałąź, tylko kod po review i zielonym CI.
- `develop` - integracja funkcji MVP.
- `feature/*` - pojedyncze funkcje.
- `fix/*` - poprawki.
- `release/*` - stabilizacja wydania.

## Zasady pull requestów

Każdy PR powinien mieć opis celu, wpływ na traceability, wpływ na ryzyko i bezpieczeństwo, listę testów, informację czy zmienia model danych oraz informację czy zmienia proces produkcyjny, QC albo serwisowy.

## Zadania CI

Backend CI: instalacja zależności, `ruff`, `mypy`, `pytest`, test migracji, build obrazu Docker.
Runner CI: `ruff`, `mypy`, `pytest`, test `MockMcuClient`, test parsera odpowiedzi MCU.
Web CI: instalacja zależności, lint, sprawdzanie typów, testy, build.
Android CI: testy Gradle, Android lint, build debug APK.
Security CI: audyt zależności, skan sekretów, skan kontenera, opcjonalnie SAST.

## CD dla MVP

Na MVP CD może być ręczne: merge do `main`, tag release, build obrazów Docker, publikacja artefaktów, deployment na `staging`, ręczna akceptacja, deployment na produkcję.

## Środowiska

`local` - `docker compose`.
`staging` - testy integracyjne i testy procesu produkcyjnego.
`production` - dane rzeczywiste.

## Wymagane artefakty wydania

Changelog, wersja backendu, wersja `final-test-runner`, wersja aplikacji Android, migracje DB, lista zmian procesu, znane ograniczenia i raport testów.
