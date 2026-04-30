# Backlog - ServiceTrace Platform

## Rdzeń backendu

- Utworzyć migracje bazy danych.
- Dodać modele `operators`, `rfid_cards`, `workstations`, `machines`, `work_sessions`.
- Dodać modele `barcode_labels`, `production_items`, `scan_events`.
- Dodać modele `checklist_templates`, `checklist_steps`, `qc_runs`, `qc_step_results`.
- Dodać modele `devices`, `assembly_links`, `device_components`.
- Dodać modele `nonconformities`, `final_test_runs`, `service_sessions`, `files`, `audit_events`.
- Dodać RBAC i JWT dla użytkowników web / mobile.
- Dodać API historii urządzenia pokazujące pełne drzewo traceability.

## RFID i sesje stanowiskowe

- Obsłużyć login RFID przez endpoint.
- Utworzyć sesję pracy z przypisaniem operatora, stanowiska i maszyny.
- Dodać timeout sesji.
- Dodać wymóg aktywnej sesji dla produkcji, QC, montażu i testu końcowego.
- Dodać audit trail logowania i wylogowania.

## Cykl życia kodów kreskowych

- Generować unikalne identyfikatory części.
- Drukować lub eksportować etykiety.
- Obsługiwać skan kodu kreskowego, QR i DataMatrix.
- Zablokować duplikaty.
- Zablokować nieaktywny kod.
- Zablokować komponent już użyty w urządzeniu.

## QC mechaniki

- Utworzyć checklisty dla części mechanicznych.
- Obsługiwać pomiary `nominal` / `tolerance` / `measured`.
- Automatycznie ustalać OK / NOK.
- Dodać zdjęcia do kroku QC.
- Tworzyć NCR dla NOK.

## QC elektroniki

- Utworzyć checklisty dla PCB i podzespołów.
- Zapisywać wersję PCB, BOM i firmware.
- Obsługiwać test komunikacji i watchdog.
- Zapisywać wynik portu USB serwisowego.
- Blokować podzespół bez pozytywnego testu.

## Montaż przez skanowanie

- Utworzyć urządzenie z numerem seryjnym.
- Zdefiniować wymagane komponenty dla typu urządzenia.
- Skanować komponenty do urządzenia.
- Walidować typ, status QC, NCR i duplikaty.
- Wyświetlać drzewo urządzenia.

## Test końcowy

- Rozwinąć `final-test-runner`.
- Dodać `SerialMcuClient` z `pyserial`.
- Dodać `RUN_SELF_TEST` i `GET_LOGS`.
- Wysyłać wynik do backendu.
- `PASS` ustawia `FINAL_TEST_PASSED`.
- `FAIL` ustawia `FINAL_TEST_FAILED` i tworzy NCR.
- `HOLD` wymaga decyzji jakości.

## Bramka wysyłki

- Endpoint zmiany statusu na `READY_FOR_SHIPMENT`.
- Walidacja kompletności BOM.
- Walidacja testu końcowego `PASS`.
- Walidacja braku krytycznych NCR.
- Audit trail decyzji wysyłki.

## Mobilne uruchomienie

- Aplikacja Android: login serwisanta.
- Identyfikacja urządzenia przez QR, tabliczkę, ręcznie albo USB.
- `MockMcuClient`.
- `UsbMcuClient`.
- Instrukcja uruchomienia krok po kroku.
- Zdjęcia, komentarze, snapshoty MCU.
- Lokalna baza Room.
- Paczka ZIP.
- Kolejka uploadu.

## Service AR Part Identification

- Atlas widoków urządzenia.
- Hotspoty na zdjęciach.
- Ekran szczegółów części.
- Historia komponentu z traceability.
- Procedura diagnostyczna.
- Procedura wymiany.
- Struktura pod przyszły model AI.

## CI/CD i bramki jakości

- GitHub Actions dla backendu.
- GitHub Actions dla `final-test-runner`.
- GitHub Actions dla `web-app`.
- GitHub Actions dla Androida.
- Build obrazów Docker.
- Skan bezpieczeństwa.
- Pokrycie testami.
- Tagi wydań.
