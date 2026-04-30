# CI/CD — propozycja dla ServiceTrace

## Cel CI/CD

CI/CD ma pilnować jakości kodu, testów, migracji, bezpieczeństwa i powtarzalnego builda wszystkich modułów. System dotyczy urządzenia medycznego, więc pipeline powinien być konserwatywny: najpierw testy i walidacja, dopiero potem build i release.

## Gałęzie

- main — stabilna gałąź, tylko kod po review i zielonym CI.
- develop — integracja funkcji MVP.
- feature/* — pojedyncze funkcje.
- fix/* — poprawki.
- release/* — stabilizacja wydania.

## Pull request policy

Każdy PR powinien mieć opis celu, wpływ na traceability, wpływ na ryzyko i bezpieczeństwo, listę testów, informację czy zmienia model danych, oraz informację czy zmienia proces produkcyjny/QC/serwisowy.

## Jobs CI

Backend CI: install dependencies, ruff, mypy, pytest, test migracji, build Docker image.
Runner CI: ruff, mypy, pytest, test MockMcuClient, test parsera odpowiedzi MCU.
Web CI: install, lint, typecheck, test, build.
Android CI: Gradle test, Android lint, build debug APK.
Security CI: dependency audit, secret scan, container scan, SAST opcjonalnie.

## CD dla MVP

Na MVP CD może być ręczne: merge do main, tag release, build obrazów Docker, publikacja artefaktów, deployment na staging, ręczna akceptacja, deployment na produkcję.

## Środowiska

local — docker compose. staging — testy integracyjne i testy procesu produkcyjnego. production — dane rzeczywiste.

## Wymagane artefakty release

Changelog, wersja backendu, wersja final-test-runner, wersja aplikacji Android, migracje DB, lista zmian procesu, znane ograniczenia, test report.
