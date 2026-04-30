# Migracje bazy danych

Ten runbook opisuje, jak pracować z migracjami Alembic w backendzie.

## Dlaczego to ważne

Backend nie tworzy już tabel automatycznie przy starcie aplikacji. Zmiany schematu muszą przechodzić przez Alembic.

To oznacza:

- zmiana modelu bez migracji jest pracą niekompletną
- lokalny drift bazy jest realnym trybem awarii
- testy i runtime zakładają, że schemat został przygotowany jawnie

## Gdzie są migracje

Pliki Alembic znajdują się w:

```text
backend/alembic/
```

Główne pliki wejściowe:

- `backend/alembic.ini`
- `backend/alembic/env.py`
- `backend/alembic/versions/`

## Zastosowanie aktualnego schematu

Z katalogu głównego repo:

```bash
cd backend
alembic upgrade head
```

Uruchamiaj to:

- po pobraniu zmian
- po zmianie brancha
- przed ręcznym testowaniem backendu

## Tworzenie nowej migracji

Typowy flow:

1. zaktualizuj modele SQLAlchemy
2. wygeneruj migrację
3. przeczytaj wygenerowany plik ręcznie
4. zastosuj migrację lokalnie
5. uruchom testy

Generowanie:

```bash
cd backend
alembic revision --autogenerate -m "opis zmiany"
```

## Checklista przeglądu nowej migracji

Zanim commitniesz wygenerowaną migrację, sprawdź:

- czy plik dotyka tylko tych tabel i kolumn, które planowałeś
- czy nie wślizgnął się przypadkowy drop albo rename
- czy nullability i defaulty zgadzają się z logiką aplikacji
- czy indeksy i unikalności są dokładnie takie, jak chcesz
- czy zachowanie danych przy zmianie jest akceptowalne

## Upgrade po wygenerowaniu

```bash
cd backend
alembic upgrade head
```

Następnie uruchom:

```bash
pytest
ruff check .
mypy app
```

## Kiedy model i migracja są wymagane razem

Obie zmiany powinny wejść w tym samym pakiecie, gdy:

- dodajesz nową encję
- dodajesz albo zmieniasz nazwę kolumny
- zmieniasz nullability
- zmieniasz unikalność
- zmieniasz strukturę foreign key

## Typowe błędy przy migracjach

- edycja modeli bez dodania migracji
- bezkrytyczne zaufanie autogenerate bez przeczytania pliku
- pozostawienie niepowiązanego szumu modelowego w wygenerowanej migracji
- brak lokalnego `alembic upgrade head` przed pushem

## Aktualna zasada w tym repo

Backend już przeszedł na przepływ oparty o Alembic, więc przyszła praca backendowa powinna stosować prostą zasadę:

- żadna zmiana schematu nie jest kompletna bez pliku migracji

## Praktyczne kroki naprawcze

Jeśli backend nie startuje po zmianie związanej ze schematem:

1. zatrzymaj backend
2. przejdź do `backend/`
3. uruchom `alembic upgrade head`
4. odpal testy jeszcze raz
5. uruchom ponownie `uvicorn`

Jeśli wygenerowana migracja wygląda podejrzanie:

1. nie commituj jej od razu
2. sprawdź dokładnie zmiany modeli
3. wygeneruj ją ponownie albo popraw ostrożnie ręcznie
4. jeszcze raz uruchom `alembic upgrade head`
