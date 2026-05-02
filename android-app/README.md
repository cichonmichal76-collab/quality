# Android App - ServiceTrace Mobile

`android-app/` ma juz pierwszy dzialajacy slice commissioning offline zgodny z PRD.

## Co dziala teraz

- Kotlin + Jetpack Compose
- lokalna baza `Room`
- ekran tworzenia draftu sesji commissioning
- krok polaczenia `Mock MCU / USB`
- snapshot stanu MCU zapisany lokalnie w sesji
- `UsbMcuClient` oparty o Android USB Host i kontrakt komend zgodny z `final-test-runner`
- robienie zdjec kamera i wybor zdjec z galerii do lokalnej sesji commissioning
- generowanie lokalnej paczki ZIP z `manifest.json`, `draft.json`, `snapshot.json`, `checklist.json` i zdjeciami
- kolejka synchronizacji `READY_TO_SYNC -> SYNCED` do backendu `POST /api/service-sessions/upload`
- licznik prob synchronizacji i ostatni blad sync per sesja
- auto-sync po odzyskaniu lacznosci albo po oznaczeniu sesji jako gotowej przy aktywnej sieci
- trwale zapamietywanie adresu backendu i przelacznika auto-sync
- `WorkManager` z odlozona kolejka synchronizacji dla sesji gotowych offline, takze po zamknieciu ekranu
- rozroznienie bledow retryable i trwalych, z retry workerem tylko dla bledow przejsciowych
- limit automatycznych prob syncu i stan eskalacji do recznej interwencji po wyczerpaniu auto-retry
- zapis `reason code` bledu syncu, np. brak lacznosci, timeout, walidacja albo blad backendu
- lokalna historia prob syncu per sesja z wynikiem, zrodlem uruchomienia i komunikatem
- historia sukcesow zawiera tez `upload_status`, `package_hash`, identyfikator rekordu backendowego, `upload_correlation_id` i `uploaded_at`
- pelna sekcja audytu synchronizacji ze wszystkimi probami, filtrem sukcesow / bledow i szybkim przejsciem do draftu
- eksport aktualnego widoku audytu synchronizacji do lokalnego pliku JSON
- udostepnianie ostatniego eksportu audytu synchronizacji poza aplikacje
- przełącznik anonimizacji dla eksportu i udostepniania audytu synchronizacji
- lokalna checklista 5 krokow
- komentarz ogolny, firmware i bootloader
- status `DRAFT` / `READY_TO_SYNC`

Po uruchomieniu aplikacji serwisant moze:

1. utworzyc lokalna sesje commissioning
2. wpisac numer seryjny, typ urzadzenia i identyfikator technika
3. wybrac tryb polaczenia `Mock MCU` albo `USB`
4. pobrac lokalny snapshot commissioning z `Mock MCU` albo z realnego urzadzenia USB CDC
5. zrobic zdjecia kamera albo dodac je z galerii jako dowody serwisowe
6. wygenerowac lokalna paczke ZIP commissioning
7. przejsc przez checkliste krok po kroku
8. zapisac wynik lokalnie w `Room`
9. oznaczyc sesje jako gotowa do przyszlej synchronizacji
10. zsynchronizowac gotowe sesje do backendu recznie albo poczekac na auto-sync po powrocie sieci
11. sprawdzic ostatni blad lub liczbe prob i ponowic synchronizacje

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

1. rozszerzyc snapshoty MCU o dodatkowe artefakty diagnostyczne
2. rozbudowac worker o upload okresowy albo bardziej agresywne wznowienia po dluzszym offline
3. rozbudowac backend o szersza telemetry uploadu albo eksport audytu
4. rozwazyc podpisywanie eksportu audytu albo bardziej zaawansowane polityki redakcji

## Poza zakresem MVP

- Wi-Fi
- Bluetooth
- firmware update
- sterowanie urzadzeniem
- AI
