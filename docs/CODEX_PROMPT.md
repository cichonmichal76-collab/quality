# Główny prompt dla Codex - ServiceTrace Platform

Zbuduj MVP systemu ServiceTrace Platform zgodnie z `docs/PRD.md`, `docs/CODEX_PIPELINE.md`, `docs/MECHANISMS.md` oraz `AGENTS.md`.

System dotyczy urządzenia medycznego. Urządzenie nie ma Wi-Fi, Bluetooth ani BLE. Komunikacja techniczna z MCU odbywa się przewodowo przez USB. Nie implementuj `firmware update` ani sterowania urządzeniem z telefonu w MVP.

Najpierw przygotuj plan implementacji. Następnie realizuj fazy w kolejności z `docs/CODEX_PIPELINE.md`.

Priorytet MVP:
- rdzeń backendu,
- logowanie RFID i sesje pracy,
- cykl życia barcode / QR,
- elementy produkcyjne,
- silnik QC,
- silnik NCR,
- montaż przez skanowanie,
- `final-test-runner` z `MockMcuClient`,
- bramka wysyłki,
- mobilne uruchomienie offline,
- Service AR Part Identification jako atlas z hotspotami.

W każdej fazie dodawaj testy. Nie przechodź do kolejnej fazy, jeśli testy obecnej fazy nie przechodzą.

Warunek ukończenia:
- implementacja spełnia PRD,
- testy przechodzą,
- `README` i dokumentacja są aktualne,
- reguły blokujące są przetestowane,
- nie dodano funkcji poza MVP bez wpisu w backlog.
