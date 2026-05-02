# API - ServiceTrace v3

Ten plik jest skróconym indeksem najważniejszych endpointów. Pełniejszy opis przepływów i przykładowych payloadów znajduje się w [docs/api/README.md](./api/README.md).

## Autoryzacja / RFID

```text
POST /api/auth/rfid-login
GET /api/operators
POST /api/operators
```

## Stanowiska / maszyny

```text
POST /api/workstations
GET /api/workstations
POST /api/machines
GET /api/machines
```

## Kody kreskowe / QR

```text
POST /api/barcodes/create
GET /api/barcodes/{barcode_value}
```

## Elementy produkcyjne

```text
POST /api/production-items
GET /api/production-items/{item_serial_number}
GET /api/production-items/by-barcode/{barcode_value}
PATCH /api/production-items/{item_serial_number}/status
```

## Zdarzenia skanowania

```text
POST /api/scan-events
```

## Montaż

```text
POST /api/devices/{device_serial_number}/assembly/scan-component
GET /api/devices/{device_serial_number}/assembly-tree
```

## Zachowane endpointy istniejącego API

```text
GET /health
POST /api/devices
GET /api/devices
GET /api/devices/{serial_number}
PATCH /api/devices/{serial_number}/status
POST /api/qc-runs
POST /api/final-tests
POST /api/service-sessions/upload
  -> odpowiedz zawiera takze `upload_status`, `upload_count`, `package_hash`, `upload_correlation_id`, `uploaded_at`, `client_attempt_id`, `client_attempt_number`, `client_trigger_source`
POST /api/nonconformities
POST /api/files/upload
```
