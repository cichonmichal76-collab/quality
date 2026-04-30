# Final Test Runner

CLI do testowania gotowego urządzenia przez USB/mock MCU.

## Tryb mock

```bash
python -m servicetrace_runner.main --device ZSS-000123 --backend http://localhost:8000 --mock
```

## Tryb serial/USB CDC

```bash
python -m servicetrace_runner.main --device ZSS-000123 --backend http://localhost:8000 --port COM5
```
