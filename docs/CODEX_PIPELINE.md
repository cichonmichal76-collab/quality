# Codex pipeline — plan pracy i kolejność implementacji

## Faza 0 — przygotowanie repozytorium

Cel: uporządkować repo, dokumentację i środowisko. Zakres: README, AGENTS.md, PRD, mechanizmy, backlog, niezrealizowane koncepcje, docker-compose i podstawowy CI/CD. Done when: repo ma czytelną strukturę, README opisuje cel i szybki start, CI uruchamia podstawowe testy.

## Faza 1 — backend core i model danych

Cel: utworzyć centralną bazę traceability. Zakres: operators, RFID cards, workstations, machines, work sessions, barcode labels, production items, scan events, devices, device components, assembly links, QC runs, step results, NCR, final test runs, service sessions, files i audit events. Done when: można utworzyć operatora, stanowisko, maszynę i urządzenie, backend ma migracje DB, testy API przechodzą.

## Faza 2 — RFID i sesje stanowiskowe

Cel: operator zaczyna proces przez RFID. Zakres: endpoint RFID login, rozpoczęcie i zakończenie sesji pracy, przypisanie stanowiska i maszyny, audit trail logowania, walidacja uprawnień operatora. Done when: operator po RFID dostaje aktywną sesję, a każdy scan/QC/run może być powiązany z operatorem i stanowiskiem.

## Faza 3 — barcode/QR lifecycle dla fizycznych części

Cel: każda fizyczna część ma unikalną tożsamość. Zakres: generowanie etykiety, rejestracja kodu, skanowanie kodu, tworzenie production item, statusy itemu, blokada duplikatu kodu, historia skanów. Done when: można nadać kod części, zeskanować część i jednoznacznie wskazać fizyczny egzemplarz.

## Faza 4 — QC mechaniki i elektroniki

Cel: część lub podzespół może przejść kontrolę jakości. Zakres: checklist templates, QC run, kroki QC, pomiary i tolerancje, zdjęcia, wynik OK/NOK, automatyczne NCR przy NOK blokującym, status QC_PASSED/QC_FAILED. Done when: część może przejść checklistę, wynik NOK blokuje część, wynik OK dopuszcza do montażu.

## Faza 5 — assembly by scan

Cel: złożenie urządzenia przez skanowanie konkretnych komponentów. Zakres: utworzenie urządzenia, skan komponentu do urządzenia, walidacja typu komponentu, statusu QC, NCR i duplikatów, drzewo urządzenia. Done when: urządzenie pokazuje strukturę komponentów, błędny komponent jest odrzucany, historia komponentu wskazuje, w jakim urządzeniu został zamontowany.

## Faza 6 — final test runner

Cel: gotowe urządzenie przechodzi test końcowy przez USB lub mock MCU. Zakres: MockMcuClient, SerialMcuClient interface, RUN_SELF_TEST, GET_DEVICE_INFO, GET_STATUS, GET_ERRORS, GET_LOGS, zapis wyniku, upload do backendu, final test PASS/FAIL/HOLD, automatyczne NCR przy FAIL. Done when: runner działa z mock MCU, PASS ustawia FINAL_TEST_PASSED, FAIL ustawia FINAL_TEST_FAILED i tworzy NCR.

## Faza 7 — shipment gate

Cel: urządzenie nie może zostać wysłane bez spełnienia warunków. Zakres: walidacja kompletności komponentów, QC komponentów, final testu, krytycznych NCR i statusu READY_FOR_SHIPMENT. Done when: backend odrzuca status READY_FOR_SHIPMENT, jeżeli nie spełniono warunków.

## Faza 8 — aplikacja mobilna commissioning

Cel: serwisant prowadzi uruchomienie u klienta offline. Zakres: login serwisanta, identyfikacja urządzenia, mock MCU, docelowy UsbMcuClient, tutorial, zdjęcia, komentarze, snapshoty MCU, lokalny zapis, paczka serwisowa, kolejka uploadu. Done when: telefon może wykonać pełną sesję offline i wysłać paczkę po odzyskaniu internetu.

## Faza 9 — Service AR Part Identification MVP

Cel: serwisant widzi numer części i historię po rozpoznaniu albo wyborze elementu. Zakres MVP: atlas widoków urządzenia, zdjęcia referencyjne, hotspoty, wybór elementu, ekran części, numer części, numer seryjny komponentu, historia traceability, dokumentacja i procedura wymiany. Done when: po wybraniu urządzenia i widoku można wskazać element i zobaczyć jego numer części oraz historię.

## Faza 10 — przygotowanie pod AI recognition

Cel: przygotować strukturę danych pod późniejsze rozpoznawanie obrazu. Zakres: klasy rozpoznawania, dataset references, confidence threshold, powiązanie model_class_id z part_number, format eksportu danych treningowych. Done when: system może przyjąć wynik z przyszłego modelu AI, ale sam model nie musi być zaimplementowany.
