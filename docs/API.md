# API — ServiceTrace v3

## Auth / RFID

```text
POST /api/auth/rfid-login
GET /api/operators
POST /api/operators
```

## Workstations / machines

```text
POST /api/workstations
GET /api/workstations
POST /api/machines
GET /api/machines
```

## Barcode / QR

```text
POST /api/barcodes/create
GET /api/barcodes/{barcode_value}
```

## Production items

```text
POST /api/production-items
GET /api/production-items/{item_serial_number}
GET /api/production-items/by-barcode/{barcode_value}
PATCH /api/production-items/{item_serial_number}/status
```

## Scan events

```text
POST /api/scan-events
```

## Assembly

```text
POST /api/devices/{device_serial_number}/assembly/scan-component
GET /api/devices/{device_serial_number}/assembly-tree
```

## Existing APIs retained

```text
GET /health
POST /api/devices
GET /api/devices
GET /api/devices/{serial_number}
PATCH /api/devices/{serial_number}/status
POST /api/qc-runs
POST /api/final-tests
POST /api/service-sessions/upload
POST /api/nonconformities
POST /api/files/upload
```
