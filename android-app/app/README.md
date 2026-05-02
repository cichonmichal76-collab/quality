# Modul Android `app`

Modul `app` nie jest juz pustym szkieletem.

Aktualnie zawiera:

1. `AndroidManifest.xml`
2. `MainActivity`
3. pierwszy ekran Compose dla commissioning offline
4. krok polaczenia `Mock MCU / USB`
5. lokalna warstwe `Room`
6. repozytorium offline i `ViewModel`
7. `UsbMcuClient` zgodny z USB Host i kontraktem runnera
8. import zdjec z galerii do lokalnej sesji
9. generator ZIP paczki commissioning
10. klient uploadu `multipart/form-data` do backendu service sessions
11. kolejke synchronizacji `READY_TO_SYNC -> SYNCED`
12. testy JVM dla fabryki draftu, snapshotu, mocka MCU, serializacji paczki i normalizacji adresu API

Domyslny adres backendu dla syncu to `http://10.0.2.2:8000/api`.

Najblizszy sensowny krok:

1. dolozyc realny capture z kamery
2. rozszerzyc snapshoty i artefakty diagnostyczne
3. zapisac konfiguracje backendu oraz historie bledow synchronizacji
