# Final Test Runner

CLI do testowania gotowego urządzenia przez USB/mock MCU.

## Tryb mock

```bash
python -m servicetrace_runner.main --device ZSS-000123 --backend http://localhost:8000 --mock --work-session-id WS-1234567890AB
```

## Tryb serial/USB CDC

```bash
python -m servicetrace_runner.main --device ZSS-000123 --backend http://localhost:8000 --port COM5 --work-session-id WS-1234567890AB
```
