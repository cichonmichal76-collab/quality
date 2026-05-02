# Android App - ServiceTrace Mobile

`android-app/` ma juz pierwszy dzialajacy slice commissioning offline zgodny z PRD.

## Co dziala teraz

- Kotlin + Jetpack Compose
- lokalna baza `Room`
- ekran tworzenia draftu sesji commissioning
- krok polaczenia `Mock MCU / USB`
- snapshot stanu MCU zapisany lokalnie w sesji
- `UsbMcuClient` oparty o Android USB Host i kontrakt komend zgodny z `final-test-runner`
- wybor zdjec z galerii do lokalnej sesji commissioning
- generowanie lokalnej paczki ZIP z `manifest.json`, `draft.json`, `snapshot.json`, `checklist.json` i zdjeciami
- kolejka synchronizacji `READY_TO_SYNC -> SYNCED` do backendu `POST /api/service-sessions/upload`
- lokalna checklista 5 krokow
- komentarz ogolny, firmware i bootloader
- status `DRAFT` / `READY_TO_SYNC`

Po uruchomieniu aplikacji serwisant moze:

1. utworzyc lokalna sesje commissioning
2. wpisac numer seryjny, typ urzadzenia i identyfikator technika
3. wybrac tryb polaczenia `Mock MCU` albo `USB`
4. pobrac lokalny snapshot commissioning z `Mock MCU` albo z realnego urzadzenia USB CDC
5. dodac zdjecia z galerii jako dowody serwisowe
6. wygenerowac lokalna paczke ZIP commissioning
7. przejsc przez checkliste krok po kroku
8. zapisac wynik lokalnie w `Room`
9. oznaczyc sesje jako gotowa do przyszlej synchronizacji
10. zsynchronizowac gotowe sesje do backendu po adresie API

Domyslny adres backendu w aplikacji to `http://10.0.2.2:8000/api`, co pasuje do emulatora Android. Na fizycznym urzadzeniu trzeba wpisac adres LAN hosta z backendem.

## Struktura MVP mobile

- `app/src/main/java/com/servicetrace/mobile/MainActivity.kt`
- `app/src/main/java/com/servicetrace/mobile/ui/CommissioningScreen.kt`
- `app/src/main/java/com/servicetrace/mobile/ui/CommissioningViewModel.kt`
- `app/src/main/java/com/servicetrace/mobile/files/`
- `app/src/main/java/com/servicetrace/mobile/data/`
- `app/src/main/java/com/servicetrace/mobile/data/local/`
- `app/src/main/java/com/servicetrace/mobile/model/`

## Nastepny sensowny krok

1. dolozyc realny capture z kamery obok importu z galerii
2. rozszerzyc snapshoty MCU o dodatkowe artefakty diagnostyczne
3. zapisac konfiguracje backendu i stan sync bardziej trwale
4. dodac retry / backoff i historie bledow synchronizacji

## Poza zakresem MVP

- Wi-Fi
- Bluetooth
- firmware update
- sterowanie urzadzeniem
- AI
