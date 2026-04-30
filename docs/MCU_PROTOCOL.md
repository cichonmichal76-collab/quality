# MCU Protocol — MVP

## Warstwa fizyczna

- USB CDC / serial over USB
- Komunikacja tekstowa
- Komenda zakończona `\n`
- Odpowiedź JSON zakończona `\n`

## Komendy

### PING

Request:

```text
PING
```

Response:

```json
{"status":"ok","response":"PONG"}
```

### GET_DEVICE_INFO

```json
{
  "status": "ok",
  "device_serial_number": "ZSS-000123",
  "device_type": "ZSS",
  "firmware_version": "1.2.4",
  "bootloader_version": "0.9.8",
  "hardware_version": "HW-1.0"
}
```

### GET_STATUS

```json
{
  "status": "ok",
  "state": "READY",
  "v24": 24.1,
  "temperature_mcu": 38.4,
  "watchdog": "OK",
  "mainboard": "OK",
  "induction_board": "OK",
  "active_errors": []
}
```

### GET_ERRORS

```json
{
  "status": "ok",
  "errors": [
    {
      "code": "E013",
      "message": "Induction board communication timeout",
      "severity": "warning",
      "timestamp_ms": 125430
    }
  ]
}
```

### RUN_SELF_TEST

```json
{
  "status": "ok",
  "test_result": "PASS",
  "tests": [
    {"name": "mainboard", "result": "PASS"},
    {"name": "induction_board", "result": "PASS"},
    {"name": "watchdog", "result": "PASS"},
    {"name": "power_24v", "result": "PASS", "value": 24.1}
  ]
}
```

## Komendy niedozwolone w MVP

- firmware update
- sterowanie napędami
- reset błędów krytycznych
- zmiana konfiguracji medycznej
