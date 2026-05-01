# Web App - ServiceTrace Operations

Panel webowy dla produkcji i jakości. Aktualny MVP skupia się na dwóch
kolejkach operacyjnych:

- gotowość wysyłki (`GET /api/shipment-readiness`)
- jakość zamontowanych komponentów (`GET /api/component-quality`)

## Uruchomienie lokalne

Backend powinien działać pod `http://localhost:8000`.

```bash
npm install
npm run dev
```

Domyślny adres API w aplikacji to `/api`. Vite proxy przekazuje ten ruch do
backendu, więc panel działa bez dodatkowej konfiguracji CORS. Jeśli backend
działa na innym adresie, ustaw:

```bash
$env:VITE_BACKEND_TARGET="http://localhost:8001"
npm run dev
```

W panelu można też ręcznie zmienić pole `API base`, np. na pełny adres
`http://localhost:8000/api`.

Jeśli chcesz szybko zobaczyć niepuste kolejki, po migracjach backendu uruchom:

```bash
cd ../backend
python -m app.services.demo_seed
```

Skrypt dopisze przykładowe urządzenia dla `device_type=DEMO-OPS`.

## Dostępne widoki

- `Wysyłka` - liczba urządzeń gotowych i zablokowanych, główne blokady,
  rekomendowane akcje, ostatni wynik shipment gate oraz tabela urządzeń.
- `Komponenty` - gate jakości komponentów, blokujące typy komponentów,
  primary quality status, rekomendowane akcje oraz tabela urządzeń z
  komponentami blokującymi.

## Walidacja

```bash
npm test
npm run build
npm run lint
```

`npm run lint` wykonuje obecnie strict TypeScript check bez osobnego stosu ESLint.
