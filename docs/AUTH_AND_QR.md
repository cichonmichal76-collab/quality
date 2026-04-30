# ServiceTrace — logowanie użytkowników i kody QR

## 1. Logowanie

System musi posiadać konta użytkowników. Pola `operator_id` i `technician_id` nie mogą być wyłącznie ręcznie wpisywanym tekstem w wersji docelowej.

### Role

```text
ADMIN
PRODUCTION_OPERATOR
QUALITY_INSPECTOR
FINAL_TEST_OPERATOR
SERVICE_TECHNICIAN
QUALITY_MANAGER
VIEWER
```

### Minimalny przepływ

```text
1. Użytkownik loguje się w aplikacji webowej albo mobilnej.
2. Backend zwraca token.
3. Klient używa tokenu w nagłówku Authorization: Bearer <token>.
4. Operacje w systemie zapisują user_id w danych oraz audit trail.
```

### Offline mobile

Aplikacja mobilna może działać offline dla ostatnio zalogowanego serwisanta. W takim przypadku paczka serwisowa musi zawierać `auth_context.json`.

## 2. Kody QR

QR nie służy do Wi‑Fi ani Bluetooth. Urządzenie medyczne nie ma komunikacji radiowej.

### QR z HMI

Kod QR z HMI służy do rozpoczęcia lub potwierdzenia sesji serwisowej.

Zawartość:

```json
{
  "type": "SERVICE_SESSION_QR",
  "device_serial_number": "ZSS-000123",
  "device_type": "ZSS",
  "firmware_version": "1.2.4",
  "bootloader_version": "0.9.8",
  "nonce": "8F3A-21CC-91B7",
  "issued_at": "2026-04-30T10:12:00Z",
  "expires_at": "2026-04-30T10:27:00Z",
  "checksum": "SHA256_OR_SIGNATURE_PLACEHOLDER"
}
```

### Walidacja w aplikacji mobilnej

```text
1. Skanuj QR.
2. Podłącz USB.
3. Odczytaj GET_DEVICE_INFO z MCU.
4. Porównaj device_serial_number z QR i z MCU.
5. Jeśli zgodne — rozpocznij sesję.
6. Jeśli niezgodne — zablokuj procedurę i zapisz błąd.
```

### QR z tabliczki

Statyczny QR z tabliczki może zawierać tylko:

```text
device_serial_number
device_type
hardware_version
```

Służy do identyfikacji awaryjnej, gdy HMI nie działa.
