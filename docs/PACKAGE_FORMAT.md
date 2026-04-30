# Format paczki serwisowej

Paczka serwisowa jest tworzona przez aplikację mobilną po zakończeniu uruchomienia lub serwisu u klienta. Aplikacja działa offline i nie usuwa paczki lokalnej przed potwierdzeniem odbioru przez serwer.

## Zawartość paczki

- manifest.json — identyfikator paczki, sesji, urządzenia, serwisanta, daty, wersje aplikacji.
- device_info.json — numer seryjny urządzenia, firmware, bootloader, statusy odczytane z MCU.
- commissioning_checklist.json — kroki procedury, wyniki, komentarze i timestamps.
- mcu_status_snapshots.json — snapshoty statusu MCU przypisane do kroków.
- mcu_logs.jsonl — logi MCU.
- photos/ — zdjęcia wykonane przez serwisanta.
- ar_part_identification.json — użycia modułu AR/hotspotów, jeżeli dotyczy.
- report.json — wynik sesji.
- checksums.json — sumy kontrolne plików.

## Reguły

Paczka musi mieć SHA256. Backend musi zwrócić potwierdzenie przyjęcia. Lokalna kopia paczki może zostać oznaczona jako wysłana dopiero po pozytywnym potwierdzeniu serwera.
