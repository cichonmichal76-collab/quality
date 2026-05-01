# Runbooki

Ten katalog zawiera praktyczne procedury operacyjne do codziennej pracy w repo ServiceTrace.

Celem jest to, żeby powtarzalne zadania inżynierskie nie wymagały rekonstruowania kroków z kilku README albo historii rozmów.

## Dostępne runbooki

- [Lokalny development](./local-development.md)
- [Migracje bazy danych](./database-migrations.md)
- [Testy i CI](./testing-and-ci.md)
- [Publikacja zmian do GitHuba](./publish-to-github.md)

Najwygodniejszy szybki start dashboardu demo jest opisany w [Lokalnym developmencie](./local-development.md) i opiera się na skrypcie `scripts/dev_dashboard_demo.py`.

## Sugerowana kolejność czytania

1. zacznij od [Lokalnego developmentu](./local-development.md)
2. potem przeczytaj [Migracje bazy danych](./database-migrations.md)
3. użyj [Testów i CI](./testing-and-ci.md) przed każdym pushem
4. na końcu skorzystaj z [Publikacji zmian do GitHuba](./publish-to-github.md), gdy chcesz wypchnąć pracę

## Uwagi o zakresie

- runbooki opisują aktualny przepływ MVP z backendem na pierwszym planie
- preferują komendy, które już dziś działają w tym repo
- tam, gdzie repo nadal ma zachowanie legacy, runbooki mówią o tym wprost
