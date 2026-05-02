# Android App - ServiceTrace Mobile

`android-app/` ma już pierwszy działający slice commissioning offline zgodny z PRD.

## Co działa teraz

- Kotlin + Jetpack Compose
- lokalna baza `Room`
- ekran tworzenia draftu sesji commissioning
- krok połączenia `Mock MCU / USB`
- snapshot stanu MCU zapisany lokalnie w sesji
- lokalna checklista 5 kroków
- komentarz ogólny, firmware i bootloader
- status `DRAFT` / `READY_TO_SYNC`

Po uruchomieniu aplikacji serwisant może:

1. utworzyć lokalną sesję commissioning
2. wpisać numer seryjny, typ urządzenia i identyfikator technika
3. wybrać tryb połączenia `Mock MCU` albo `USB`
4. pobrać lokalny snapshot commissioning z `Mock MCU`
5. przejść przez checklistę krok po kroku
6. zapisać wynik lokalnie w `Room`
7. oznaczyć sesję jako gotową do przyszłej synchronizacji

## Struktura MVP mobile

- `app/src/main/java/com/servicetrace/mobile/MainActivity.kt`
- `app/src/main/java/com/servicetrace/mobile/ui/CommissioningScreen.kt`
- `app/src/main/java/com/servicetrace/mobile/ui/CommissioningViewModel.kt`
- `app/src/main/java/com/servicetrace/mobile/data/`
- `app/src/main/java/com/servicetrace/mobile/data/local/`
- `app/src/main/java/com/servicetrace/mobile/model/`

## Następny sensowny krok

1. dodać `MockMcuClient` i ekran połączenia USB / mock
2. dołożyć właściwy `UsbMcuClient`
3. zapisywać zdjęcia i snapshoty MCU do lokalnej sesji
4. generować paczkę ZIP
5. dodać kolejkę uploadu do backendu `POST /api/service-sessions/upload`

## Poza zakresem MVP

- Wi-Fi
- Bluetooth
- firmware update
- sterowanie urządzeniem
- AI
