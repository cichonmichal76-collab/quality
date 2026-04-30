# Data Model — Traceability-first

## Rdzeń identyfikacji

- operators — operatorzy, role i RFID.
- workstations — komputery/stanowiska produkcyjne.
- machines — obrabiarki, stanowiska elektroniki, stanowiska testowe.
- work_sessions — aktywne sesje operatora po logowaniu RFID.
- barcode_labels — unikalne kody kreskowe/QR dla części, podzespołów i urządzeń.
- production_items — fizyczne części i podzespoły.
- scan_events — każdy skan kodu, z kontekstem i wynikiem.
- assembly_links — relacja gotowe urządzenie → komponenty.

## Uzupełniające moduły

- devices — gotowe urządzenia.
- qc_runs — testy i checklisty wykonywane pod konkretny kod.
- final_test_runs — testy gotowego urządzenia przez USB/MCU.
- service_sessions — uruchomienia u klienta i serwis.
- nonconformities — NCR dla części, komponentów lub urządzeń.
- files — zdjęcia, raporty, logi.
