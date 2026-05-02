# Aplikacja webowa - Operacje ServiceTrace

Panel webowy dla produkcji i jakości. Aktualny MVP skupia się na dwóch
kolejkach operacyjnych:

- gotowość wysyłki (`GET /api/shipment-readiness`)
- jakość zamontowanych komponentów (`GET /api/component-quality`)

Obie kolejki wspierają filtrowanie, paginację opartą o `offset/limit`
i zapamiętanie w `localStorage`:

- pola `adres bazowy API`
- aktywnej zakładki `Wysyłka` / `Komponenty`
- ostatnich filtrów dla obu widoków

Tekstowe filtry są odpytywane z debounce `250 ms`. W trakcie oczekiwania panel
pokazuje znacznik `Oczekuje na zastosowanie`, a klawisz `Enter` wymusza
natychmiastowe wysłanie bieżącego filtra.

Kliknięcie numeru seryjnego w tabeli otwiera drawer szczegółów urządzenia.
Drawer łączy dane z shipment readiness, component quality i historii shipment
gate, żeby od razu pokazać blokady, rekomendowaną akcję, stan BOM oraz
szczegóły blokujących komponentów.

Drawer nie jest już tylko podglądem. Panel pozwala teraz wykonać sześć
bezpośrednie kroki operacyjne:
- `Oznacz gotowe do wysyłki` dla urządzeń, które przechodzą shipment gate
- `Oznacz jako wysłane` dla urządzeń już gotowych do wysyłki
- `Zamontuj komponent` dla urządzeń z rekomendacją `COMPLETE_ASSEMBLY`
- `Zamknij krytyczne NCR` dla blokujących NCR urządzenia albo komponentów
- `Zapisz final test PASS/FAIL` dla urządzeń z rekomendacją `RUN_FINAL_TEST`
- `Zapisz komponentowy QC PASS/FAIL` dla urządzeń z rekomendacją `RUN_COMPONENT_QC_OR_REWORK`

Akcja montażu korzysta z aktywnej sesji operatora o roli `PRODUCTION_OPERATOR`,
`QUALITY_INSPECTOR` albo `ADMIN`. Drawer sam podpowiada brakujące typy komponentów
na podstawie `component_coverage` z BOM i wysyła `scan-component` dla wybranego
barcode.

Akcja final test korzysta z aktywnej sesji operatora o roli `FINAL_TEST_OPERATOR`,
`QUALITY_MANAGER` albo `ADMIN`. Panel sam pobiera aktywne sesje z backendu
(`GET /api/work-sessions` + `GET /api/operators`) i pozwala wybrać właściwy
kontekst bez ręcznego wpisywania `work_session_id`.

Akcja komponentowego QC korzysta z aktywnej sesji operatora o roli
`QUALITY_INSPECTOR`, `QUALITY_MANAGER` albo `ADMIN`. Dashboard tworzy `QC run`,
zamyka go wynikiem `PASS/FAIL` i po sukcesie odświeża kolejki oraz drawer
szczegółów urządzenia.

## Uruchomienie lokalne

Backend powinien działać pod `http://localhost:8000`.

```bash
npm install
npm run dev
```

Domyślny adres API w aplikacji to `/api`. Vite proxy przekazuje ten ruch do
backendu, więc panel działa bez dodatkowej konfiguracji CORS. Jeżeli backend
działa na innym adresie, ustaw:

```bash
$env:VITE_BACKEND_TARGET="http://localhost:8001"
npm run dev
```

W panelu można też ręcznie zmienić pole `adres bazowy API`, na przykład na pełny adres
`http://localhost:8000/api`.

Jeżeli chcesz szybko wrócić do stanu domyślnego, użyj przycisku
`Wyczyść zapisany stan`. Resetuje on adres API, aktywną zakładkę i zapisane
filtry obu widoków.

Jeżeli chcesz szybko zobaczyć niepuste kolejki, najwygodniej uruchom z katalogu
repo:

```bash
python scripts/dev_dashboard_demo.py --reload
```

Skrypt wykona migracje, zasieje dane demo, zweryfikuje kolejki i uruchomi
backend pod `http://127.0.0.1:8000`.

## Dostępne widoki

- `Wysyłka` - liczba urządzeń gotowych i zablokowanych, główne blokady,
  rekomendowane akcje, ostatni wynik shipment gate, tabela urządzeń,
  drawer szczegółów urządzenia i paginacja kolejki.
- `Komponenty` - gate jakości komponentów, blokujące typy komponentów,
  główny status jakości, rekomendowane akcje, tabela urządzeń z
  komponentami blokującymi, drawer szczegółów urządzenia i paginacja wyników.

## Walidacja

```bash
npm test
npm run build
npm run lint
npm run e2e
```

`npm run lint` wykonuje obecnie strict TypeScript check bez osobnego stosu ESLint.
`npm run e2e` uruchamia Playwright smoke test panelu i wymaga backendu na
`http://127.0.0.1:8000` z zasianymi danymi `DEMO-E2E`. Smoke obejmuje też
odtworzenie aktywnej zakładki i filtrów po przeładowaniu strony, reset
zapisanego stanu do wartości domyślnych, otwarcie drawera szczegółów
urządzenia z kolejki komponentów oraz mockowane scenariusze wykonania akcji
`Oznacz gotowe do wysyłki`, `Oznacz jako wysłane`, `Zamontuj komponent`,
`Zamknij krytyczne NCR` oraz `Zapisz final test PASS` i
`Zapisz komponentowy QC PASS`.
