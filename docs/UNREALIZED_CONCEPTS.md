# Niezrealizowane koncepcje i odłożone decyzje

## Wi‑Fi dongle / Access Point

Odrzucone dla MVP, ponieważ urządzenie jest medyczne i nie powinno mieć komunikacji radiowej. Każde radio zwiększa wymagania EMC, cyberbezpieczeństwa i formalną złożoność wyrobu.

## Bluetooth / BLE

Odrzucone z tego samego powodu co Wi‑Fi. Możliwe tylko jako osobny projekt regulacyjny, nie jako domyślny kanał diagnostyczny.

## Firmware update z telefonu

Odłożone. Technicznie możliwe przez bootloader USB, ale dla urządzenia medycznego wymaga podpisanych paczek firmware, rollback/recovery, procedury walidacji, logów aktualizacji i analizy ryzyka. Nie wchodzi do MVP.

## Sterowanie urządzeniem z telefonu

Odrzucone w MVP. Aplikacja mobilna może odczytywać dane, prowadzić procedurę, zapisywać logi i zdjęcia, ale nie steruje napędami ani funkcjami krytycznymi.

## Pełna AI do rozpoznawania wszystkich części

Odłożone. W MVP Service AR działa jako atlas z hotspotami. AI recognition może być później, po zebraniu datasetu i walidacji skuteczności.

## Automatyczne wykrywanie brakujących komponentów PCB

Odłożone. Wymaga kontrolowanych warunków zdjęć, datasetu, wzorca PCB i walidacji. Nie jest potrzebne do pierwszego traceability.

## VR szkoleniowy

Odłożone. Może być użyteczne do szkolenia serwisantów, ale nie jest potrzebne do MVP. Priorytetem jest produkcja, QC, final test i commissioning.

## Integracja z Symfonią

Poza MVP. Architektura ma zapewnić API i możliwość późniejszej synchronizacji kontrahentów, dokumentów, części i stanów magazynowych.

## Integracja z systemem SMS

Poza MVP. Docelowo aplikacja lub backend mogą wysyłać zgłoszenia i paczki do istniejącego systemu serwisowego, jeśli dostępne będzie API albo import.

## Pełny magazyn części zamiennych

Poza MVP. MVP śledzi części i podzespoły w traceability, ale nie zastępuje systemu magazynowego.

## Zaawansowany BI i analiza trendów

Poza MVP. Dane powinny być zapisywane tak, aby później można było analizować awaryjność, NCR, skuteczność QC i powtarzalne problemy.
