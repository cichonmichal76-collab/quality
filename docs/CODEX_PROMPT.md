# Prompt główny dla Codex — ServiceTrace Platform

Zbuduj MVP systemu ServiceTrace Platform zgodnie z `docs/PRD.md`, `docs/CODEX_PIPELINE.md`, `docs/MECHANISMS.md` oraz `AGENTS.md`.

System dotyczy urządzenia medycznego. Urządzenie nie ma Wi‑Fi, Bluetooth ani BLE. Komunikacja techniczna z MCU odbywa się przewodowo przez USB. Nie implementuj firmware update ani sterowania urządzeniem z telefonu w MVP.

Najpierw przygotuj plan implementacji. Następnie realizuj fazy w kolejności z `docs/CODEX_PIPELINE.md`.

Priorytet MVP:
- backend core,
- RFID login i work sessions,
- barcode/QR lifecycle,
- production items,
- QC engine,
- NCR engine,
- assembly by scan,
- final-test-runner z MockMcuClient,
- shipment gate,
- mobile commissioning offline,
- Service AR Part Identification jako atlas/hotspoty.

W każdej fazie dodawaj testy. Nie przechodź do kolejnej fazy, jeśli testy obecnej fazy nie przechodzą.

Done when:
- implementacja spełnia PRD,
- testy przechodzą,
- README/dokumentacja są aktualne,
- reguły blokujące są przetestowane,
- nie dodano funkcji poza MVP bez wpisu w backlog.
