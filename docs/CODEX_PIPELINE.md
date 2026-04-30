# Pipeline Codex - plan pracy i kolejność implementacji

## Faza 0 - przygotowanie repozytorium

Cel: uporządkować repo, dokumentację i środowisko.
Zakres: `README`, `AGENTS.md`, `PRD`, mechanizmy, backlog, niezrealizowane koncepcje, `docker-compose` i podstawowy CI/CD.
Warunek ukończenia: repo ma czytelną strukturę, `README` opisuje cel i szybki start, a CI uruchamia podstawowe testy.

## Faza 1 - rdzeń backendu i model danych

Cel: utworzyć centralną bazę traceability.
Zakres: operatorzy, karty RFID, stanowiska, maszyny, sesje pracy, etykiety kodów, elementy produkcyjne, zdarzenia skanowania, urządzenia, komponenty urządzeń, relacje montażowe, przebiegi QC, wyniki kroków, NCR, testy końcowe, sesje serwisowe, pliki i zdarzenia audytowe.
Warunek ukończenia: można utworzyć operatora, stanowisko, maszynę i urządzenie, backend ma migracje DB, a testy API przechodzą.

## Faza 2 - RFID i sesje stanowiskowe

Cel: operator zaczyna proces przez RFID.
Zakres: endpoint logowania RFID, rozpoczęcie i zakończenie sesji pracy, przypisanie stanowiska i maszyny, audit trail logowania, walidacja uprawnień operatora.
Warunek ukończenia: operator po RFID dostaje aktywną sesję, a każdy skan, przebieg QC i test może być powiązany z operatorem i stanowiskiem.

## Faza 3 - cykl życia barcode/QR dla fizycznych części

Cel: każda fizyczna część ma unikalną tożsamość.
Zakres: generowanie etykiety, rejestracja kodu, skanowanie kodu, tworzenie elementu produkcyjnego, statusy elementu, blokada duplikatu kodu, historia skanów.
Warunek ukończenia: można nadać kod części, zeskanować część i jednoznacznie wskazać fizyczny egzemplarz.

## Faza 4 - QC mechaniki i elektroniki

Cel: część lub podzespół może przejść kontrolę jakości.
Zakres: szablony checklist, przebieg QC, kroki QC, pomiary i tolerancje, zdjęcia, wynik OK / NOK, automatyczne NCR przy blokującym NOK, status `QC_PASSED` / `QC_FAILED`.
Warunek ukończenia: część może przejść checklistę, wynik NOK blokuje część, a wynik OK dopuszcza do montażu.

## Faza 5 - montaż przez skanowanie

Cel: złożenie urządzenia przez skanowanie konkretnych komponentów.
Zakres: utworzenie urządzenia, skan komponentu do urządzenia, walidacja typu komponentu, statusu QC, NCR i duplikatów, drzewo urządzenia.
Warunek ukończenia: urządzenie pokazuje strukturę komponentów, błędny komponent jest odrzucany, a historia komponentu wskazuje, w jakim urządzeniu został zamontowany.

## Faza 6 - final-test-runner

Cel: gotowe urządzenie przechodzi test końcowy przez USB albo mock MCU.
Zakres: `MockMcuClient`, interfejs `SerialMcuClient`, `RUN_SELF_TEST`, `GET_DEVICE_INFO`, `GET_STATUS`, `GET_ERRORS`, `GET_LOGS`, zapis wyniku, wysyłka do backendu, wynik `PASS` / `FAIL` / `HOLD`, automatyczne NCR przy `FAIL`.
Warunek ukończenia: runner działa z mock MCU, `PASS` ustawia `FINAL_TEST_PASSED`, a `FAIL` ustawia `FINAL_TEST_FAILED` i tworzy NCR.

## Faza 7 - bramka wysyłki

Cel: urządzenie nie może zostać wysłane bez spełnienia warunków.
Zakres: walidacja kompletności komponentów, QC komponentów, testu końcowego, krytycznych NCR i statusu `READY_FOR_SHIPMENT`.
Warunek ukończenia: backend odrzuca status `READY_FOR_SHIPMENT`, jeżeli nie spełniono warunków.

## Faza 8 - aplikacja mobilna commissioning

Cel: serwisant prowadzi uruchomienie u klienta offline.
Zakres: login serwisanta, identyfikacja urządzenia, mock MCU, docelowy `UsbMcuClient`, instrukcja krok po kroku, zdjęcia, komentarze, snapshoty MCU, lokalny zapis, paczka serwisowa, kolejka wysyłki.
Warunek ukończenia: telefon może wykonać pełną sesję offline i wysłać paczkę po odzyskaniu internetu.

## Faza 9 - Service AR Part Identification MVP

Cel: serwisant widzi numer części i historię po rozpoznaniu albo wyborze elementu.
Zakres MVP: atlas widoków urządzenia, zdjęcia referencyjne, hotspoty, wybór elementu, ekran części, numer części, numer seryjny komponentu, historia traceability, dokumentacja i procedura wymiany.
Warunek ukończenia: po wybraniu urządzenia i widoku można wskazać element i zobaczyć jego numer części oraz historię.

## Faza 10 - przygotowanie pod AI recognition

Cel: przygotować strukturę danych pod późniejsze rozpoznawanie obrazu.
Zakres: klasy rozpoznawania, odwołania do datasetów, próg pewności, powiązanie `model_class_id` z `part_number`, format eksportu danych treningowych.
Warunek ukończenia: system może przyjąć wynik z przyszłego modelu AI, ale sam model nie musi być zaimplementowany.
