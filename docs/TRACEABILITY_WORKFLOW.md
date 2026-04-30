# Traceability Workflow — RFID + barcode/QR

## Główna zasada

Traceability zaczyna się od fizycznej części, nie dopiero od gotowego urządzenia.

Każda fizyczna część, płytka PCB, podzespół i gotowe urządzenie otrzymuje unikalny kod kreskowy albo QR. Operator loguje się do stanowiska kartą RFID, skanuje kod elementu i wykonuje procedurę kontroli/testu przypisaną do tego konkretnego kodu.

## 1. Produkcja części mechanicznej

```text
Maszyna produkuje część
↓
Operator zdejmuje część z maszyny
↓
Operator loguje się kartą RFID przy komputerze stanowiskowym
↓
System generuje unikalny kod kreskowy / QR
↓
Operator nakleja etykietę na część
↓
Operator skanuje kod
↓
System zakłada rekord konkretnej fizycznej części
↓
System otwiera checklistę/test/pomiary dla tej części
↓
Operator wpisuje pomiary, dodaje zdjęcia, komentarze, wynik OK/NOK
↓
Wynik zapisuje się pod konkretnym kodem części
```

## 2. Produkcja elektroniki

```text
PCB / moduł elektroniczny otrzymuje unikalny kod
↓
Operator skanuje kod
↓
System zapisuje typ PCB, rewizję PCB, rewizję BOM, firmware, bootloader
↓
Operator wykonuje kontrolę wizualną i test funkcjonalny
↓
Wynik zapisuje się pod kodem tej płytki / podzespołu
```

## 3. Montaż końcowy

```text
Operator loguje się RFID
↓
Skanuje kod gotowego urządzenia
↓
System otwiera sesję montażową
↓
Operator skanuje po kolei wszystkie kody komponentów
↓
System waliduje statusy komponentów i zgodność z BOM
↓
System buduje drzewo: urządzenie → komponenty → historia komponentów
↓
Po komplecie skanów urządzenie otrzymuje status ASSEMBLED
```

## 4. Test gotowego urządzenia

```text
Operator skanuje kod urządzenia
↓
Komputer testowy łączy się z MCU przez USB
↓
System porównuje numer seryjny z kodu z numerem seryjnym z MCU
↓
Testuje mainboard, płytę indukcji, watchdog, HMI, zasilanie, komunikację
↓
PASS pozwala przejść do READY_FOR_SHIPMENT
FAIL tworzy NCR i blokuje wysyłkę
```

## 5. Serwis

Serwis widzi pełną historię urządzenia:

```text
- z jakich komponentów się składa,
- kiedy każdy komponent został wyprodukowany,
- na jakiej maszynie,
- przez kogo,
- kto go sprawdzał,
- jakie były pomiary i zdjęcia,
- jakie były testy elektroniki,
- jaki był final test gotowego urządzenia,
- co działo się przy uruchomieniu u klienta.
```
