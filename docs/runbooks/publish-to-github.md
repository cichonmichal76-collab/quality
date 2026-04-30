# Publikacja zmian do GitHuba

Ten runbook opisuje praktyczny flow publikacji zmian do repozytorium.

## Aktualny stan repo

Repo jest publikowane pod:

[cichonmichal76-collab/Quality](https://github.com/cichonmichal76-collab/Quality)

Lokalne repo śledzi:

```text
origin -> https://github.com/cichonmichal76-collab/Quality.git
```

Domyślny branch to `main`.

## Rekomendowany przepływ

1. wprowadzaj zmiany na czystym lokalnym branchu albo na czystym `main`
2. uruchom odpowiednie testy i checki
3. przejrzyj diff
4. zrób commit z konkretnym zakresem
5. wypchnij zmiany do GitHuba
6. zweryfikuj stan zdalny

## Minimalny zestaw komend

Sprawdzenie lokalnego stanu:

```bash
git status -sb
git log --oneline --decorate -5
git remote -v
```

Commit zmian:

```bash
git add <ścieżki>
git commit -m "krótka-wiadomość"
```

Push do śledzonego brancha:

```bash
git push
```

## Pierwszy push albo konfiguracja remote

Jeśli repo nie ma jeszcze zdalnego `origin`:

```bash
git remote add origin https://github.com/cichonmichal76-collab/Quality.git
git branch -M main
git push -u origin main
```

## Co sprawdzić przed pushem

- working tree jest czysty poza zmianami, które rzeczywiście chcesz opublikować
- migracje są dodane, jeśli zmienił się schemat
- dokumentacja i kod opisują ten sam stan
- commit message opisuje jeden spójny pakiet pracy
- target pushu jest dokładnie tym branchem, który chcesz zaktualizować

## Dobre nawyki publikacyjne

- preferuj małe, reviewowalne commity zamiast jednego dużego pakietu
- utrzymuj kod, dokumentację i migracje w synchronizacji
- nie pushuj zepsutego linta ani typechecku, nawet jeśli CI jest dziś zbyt łagodne
- nie przepisuj wspólnej historii bez wyraźnego powodu

## Uwaga o obecnym środowisku

W środowisku używanym do tej pracy `gh` może nie być zainstalowane. Repo nadal można normalnie publikować zwykłym `git`.

To oznacza, że poprawnym i wspieranym flow jest tutaj:

```bash
git commit -m "wiadomość"
git push
```

## Weryfikacja po pushu

Po pushu sprawdź:

- `git status -sb`
- `git log --oneline --decorate -2`
- stronę repo na GitHubie z najnowszym commitem na `main`

## Bezpieczne kroki naprawcze

Jeśli push nie przejdzie, bo remote się przesunął:

1. zatrzymaj się
2. pobierz najnowsze zmiany
3. sprawdź rozjazd
4. świadomie użyj rebase albo merge
5. w razie potrzeby uruchom checki jeszcze raz
6. wypchnij ponownie

Jeśli push nie przejdzie z powodu autoryzacji:

1. sprawdź URL remote
2. sprawdź lokalny setup credentiali Git
3. spróbuj ponownie po naprawieniu autoryzacji

## Czego nie robić

- nie używaj lekkomyślnie destrukcyjnego przepisywania historii przy pracy współdzielonej
- nie pushuj zmian schematu bez migracji
- nie zakładaj, że CI wychwyci każdy lokalny problem
