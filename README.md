# ServiceTrace Platform

ServiceTrace Platform to system traceability, Quality, final test, commissioning i serwisowej identyfikacji części dla urządzenia medycznego.

System śledzi fizyczne egzemplarze części i podzespołów od momentu zejścia z maszyny, przez kontrolę jakości, montaż końcowy, test gotowego urządzenia, wysyłkę, uruchomienie u klienta i późniejszy serwis.

## Najważniejsza idea

Każda istotna fizyczna część ma własny unikalny kod kreskowy, QR albo DataMatrix. Operator loguje się kartą RFID, skanuje część i wykonuje procedurę. System zapisuje, kto wykonał czynność, kiedy, na jakiej maszynie, na jakim stanowisku i z jakim wynikiem.

Gotowe urządzenie powstaje przez skanowanie wszystkich komponentów. Dzięki temu system wie, z jakich konkretnych podzespołów składa się dane urządzenie.

## Zakres systemu

- produkcja części mechanicznych,
- kontrola jakości mechaniki,
- produkcja i test elektroniki,
- montaż końcowy przez skanowanie komponentów,
- final test gotowego urządzenia przez USB,
- blokada wysyłki bez pozytywnego testu,
- aplikacja mobilna serwisanta,
- offline commissioning u klienta,
- paczka serwisowa z logami i zdjęciami,
- Service AR Part Identification dla serwisanta.

## Ograniczenia medyczne

Urządzenie nie ma Wi‑Fi, Bluetooth ani BLE. Komunikacja z MCU odbywa się przewodowo przez USB. Telefon serwisanta może mieć internet, ale urządzenie medyczne nie komunikuje się radiowo.

## Moduły repozytorium

- `backend/` — FastAPI + PostgreSQL, centralne API i baza traceability.
- `web-app/` — panel Production / Quality.
- `final-test-runner/` — narzędzie stanowiskowe do testu końcowego przez USB/mock MCU.
- `android-app/` — aplikacja mobilna serwisanta.
- `docs/` — PRD, mechanizmy, backlog, CI/CD, stack, protokół MCU.

## Dokumenty

- `docs/PRD.md` — główne wymagania produktu.
- `docs/CODEX_PIPELINE.md` — kolejność implementacji dla Codex.
- `docs/MECHANISMS.md` — mechanizmy systemowe.
- `docs/BACKLOG.md` — backlog funkcjonalny.
- `docs/UNREALIZED_CONCEPTS.md` — koncepcje odłożone poza MVP.
- `docs/TECH_STACK.md` — proponowane technologie i języki.
- `docs/CI_CD.md` — propozycja CI/CD.
- `AGENTS.md` — instrukcje dla Codex i innych agentów kodujących.

## Koncepcyjna historia zmian — styl commitów

### commit: init-service-app-concept

Początkowa idea: aplikacja mobilna dla serwisanta do rozpoznawania części urządzenia i prowadzenia tutoriala uruchomienia.

### commit: add-offline-mobile-commissioning

Dodano wymóg pracy offline u klienta, lokalnego zapisu zdjęć, checklist i późniejszej wysyłki paczki na serwer.

### commit: reject-wireless-for-medical-device

Odrzucono Wi‑Fi, Bluetooth i BLE w urządzeniu medycznym. Ustalono, że komunikacja diagnostyczna z MCU odbywa się przewodowo przez USB.

### commit: add-mcu-usb-diagnostics

Dodano koncepcję odczytu numeru seryjnego, firmware, statusów, błędów i logów z MCU przez USB.

### commit: add-production-quality-traceability

Rozszerzono zakres poza aplikację mobilną. Dodano produkcję, Quality, testy części, elektronikę, montaż i final test.

### commit: add-rfid-workstation-login

Dodano wymóg logowania operatora kartą RFID na stanowisku produkcyjnym lub QC oraz przypisania każdej czynności do operatora, maszyny i stanowiska.

### commit: add-barcode-lifecycle-for-physical-parts

Ustalono, że unikalny kod dotyczy fizycznego egzemplarza części, a nie tylko typu części. Dodano lifecycle etykiety i scan event ledger.

### commit: add-assembly-by-scan

Dodano montaż końcowy przez skanowanie wszystkich komponentów. System buduje drzewo urządzenia z konkretnych podzespołów.

### commit: add-final-test-gate

Dodano obowiązkowy test końcowy przez USB i blokadę wysyłki bez wyniku PASS.

### commit: add-ncr-engine

Dodano mechanizm niezgodności NCR. Krytyczna otwarta NCR blokuje montaż i wysyłkę.

### commit: scope-ar-to-service-only

Doprecyzowano, że AR/VR dotyczy wyłącznie serwisanta. AR ma służyć rozpoznaniu części i pokazaniu numeru części oraz historii, a nie tworzeniu traceability na produkcji.

### commit: define-codex-pipeline

Dodano AGENTS.md, pipeline pracy dla Codex, backlog, techniczny stack, CI/CD i listę koncepcji odłożonych poza MVP.

## Szybki start lokalny

Backend i baza:

```bash
docker compose up --build
```

Testy backendu:

```bash
cd backend
pytest
```

Final-test-runner:

```bash
cd final-test-runner
pytest
python -m servicetrace_runner.main --mock
```

## Docelowa kolejność implementacji

Najpierw backend i model danych. Potem RFID i sesje stanowiskowe. Następnie barcode lifecycle, QC, elektronika, assembly by scan, final-test-runner, shipment gate, aplikacja mobilna i Service AR Part Identification jako atlas z hotspotami.

## Definicja MVP

MVP jest gotowe, gdy system pozwala zalogować operatora RFID, nadać kod części, zeskanować część, wykonać QC, zablokować część NOK, zarejestrować elektronikę, złożyć urządzenie przez skanowanie komponentów, wykonać final test, zablokować wysyłkę bez PASS, przeprowadzić commissioning z aplikacji mobilnej i zobaczyć historię urządzenia.
