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
  rekomendowane akcje, ostatni wynik shipment gate, tabela urządzeń
  i paginacja kolejki.
- `Komponenty` - gate jakości komponentów, blokujące typy komponentów,
  główny status jakości, rekomendowane akcje, tabela urządzeń z
  komponentami blokującymi i paginacja wyników.

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
odtworzenie aktywnej zakładki i filtrów po przeładowaniu strony.
