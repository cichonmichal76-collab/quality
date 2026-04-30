# Model danych - traceability w centrum

## Rdzeń identyfikacji

- `operators` - operatorzy, role i RFID.
- `workstations` - komputery i stanowiska produkcyjne.
- `machines` - obrabiarki, stanowiska elektroniki i stanowiska testowe.
- `work_sessions` - aktywne sesje operatora po logowaniu RFID.
- `barcode_labels` - unikalne kody kreskowe / QR dla części, podzespołów i urządzeń.
- `production_items` - fizyczne części i podzespoły.
- `scan_events` - każdy skan kodu wraz z kontekstem i wynikiem.
- `assembly_links` - relacja gotowe urządzenie -> komponenty.

## Uzupełniające moduły

- `devices` - gotowe urządzenia.
- `qc_runs` - testy i checklisty wykonywane dla konkretnego kodu.
- `final_test_runs` - testy gotowego urządzenia przez USB / MCU.
- `service_sessions` - uruchomienia u klienta i serwis.
- `nonconformities` - NCR dla części, komponentów albo urządzeń.
- `files` - zdjęcia, raporty i logi.
