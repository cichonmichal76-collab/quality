# Final Test Runner

Pythonowy CLI do uruchamiania final testu urządzenia i wysyłania wyniku do backendu ServiceTrace.

Runner wspiera:

- tryb mock MCU do lokalnego developmentu
- tryb serial over USB do testów stanowiskowych
- lokalny zapis wyniku do JSON
- upload metadanych final testu do backendu

## Wymagania wstępne

- Python 3.11+
- dostępny backend ServiceTrace
- aktywne `work_session_id` z sesji RFID na stanowisku
- połączenie USB serial przy użyciu trybu sprzętowego

## Instalacja

```bash
cd final-test-runner
pip install -e .[dev]
```

## Szybki start

Tryb mock:

```bash
python -m servicetrace_runner.main --device ZSS-000123 --backend http://localhost:8000 --mock --work-session-id WS-1234567890AB
```

Tryb serial / USB CDC:

```bash
python -m servicetrace_runner.main --device ZSS-000123 --backend http://localhost:8000 --port COM5 --work-session-id WS-1234567890AB
```

CLI wystawia też skrypt konsolowy:

```bash
servicetrace-final-test --device ZSS-000123 --backend http://localhost:8000 --mock --work-session-id WS-1234567890AB
```

## Argumenty CLI

- `--backend`
  Bazowy URL backendu. Domyślnie: `http://localhost:8000`
- `--device`
  Nadpisanie numeru seryjnego urządzenia. Jeśli nie podasz go w trybie mock, zostanie użyty domyślny numer mocka.
- `--mock`
  Używa wbudowanego klienta mock MCU.
- `--port`
  Port serial dla USB CDC, na przykład `COM5`.
- `--output`
  Ścieżka lokalnego pliku JSON. Domyślnie: `final-test-result.json`
- `--work-session-id`
  Wymagane przy uploadzie do backendu. Musi wskazywać na aktywną sesję stanowiskową.

## Co robi runner

Runner wykonuje sekwencję:

1. łączy się z MCU
2. `PING`
3. `GET_DEVICE_INFO`
4. `GET_STATUS`
5. `GET_ERRORS`
6. `RUN_SELF_TEST`
7. `GET_LOGS`
8. wylicza lokalny wynik PASS lub FAIL
9. zapisuje lokalny plik JSON
10. upewnia się, że urządzenie istnieje w backendzie
11. wysyła metadane final testu do `/api/final-tests`

Aktualna logika wyniku jest celowo prosta:

- `PASS`, jeśli self-test zwraca `PASS` i MCU nie raportuje błędów
- `FAIL` w przeciwnym razie

## Kontrakt z backendem

Przed uploadem runner wywołuje:

- `POST /api/devices`, żeby upewnić się, że urządzenie istnieje
- `POST /api/final-tests`, żeby zapisać wynik final testu

Aktualnie wysyłany payload zawiera:

- `test_run_id`
- `device_serial_number`
- `operator_id`
- `result`
- `firmware_version`
- `bootloader_version`
- `work_session_id`

Pełny lokalny wynik JSON zawiera też surowe dane z MCU, takie jak:

- `device_info`
- `status`
- `errors`
- `self_test`
- `logs`

## Artefakt wyjściowy

Domyślnie runner zapisuje `final-test-result.json` w bieżącym katalogu.

Ten plik jest przydatny do:

- lokalnego diagnozowania problemów
- późniejszego podpięcia artefaktów do przepływu stanowiskowego
- debugowania integracji z backendem bez powtarzania kroków sprzętowych

## Zachowanie mock MCU

Mock client zwraca deterministyczne dane dla:

- informacji o urządzeniu
- statusu
- listy błędów
- wyniku self-testu
- logów

To sprawia, że nadaje się do developmentu backendu, lokalnych sprawdzeń i demo bez sprzętu.

## Testy i lint

```bash
cd final-test-runner
pytest
ruff check .
```

## Aktualne ograniczenia

- brak strategii retry przy uploadzie do backendu
- brak trwałej paczki artefaktów poza lokalnym plikiem JSON
- brak pełnej orkiestracji przepływu stanowiskowego
- brak rozbudowanego silnika PASS / FAIL / HOLD
- brak negocjacji wersji protokołu
