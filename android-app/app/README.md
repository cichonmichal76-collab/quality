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
8. capture zdjec z kamery i import z galerii do lokalnej sesji
9. generator ZIP paczki commissioning
10. klient uploadu `multipart/form-data` do backendu service sessions
11. kolejke synchronizacji `READY_TO_SYNC -> SYNCED`
12. licznik prob syncu i ostatni blad per sesja
13. auto-sync po odzyskaniu lacznosci i po oznaczeniu sesji jako gotowej przy aktywnej sieci
14. testy JVM dla fabryki draftu, snapshotu, mocka MCU, serializacji paczki, polityki syncu i normalizacji adresu API

Domyslny adres backendu dla syncu to `http://10.0.2.2:8000/api`.

Najblizszy sensowny krok:

1. rozszerzyc snapshoty i artefakty diagnostyczne
2. zapisac konfiguracje backendu oraz historie bledow synchronizacji bardziej trwale
3. przeniesc auto-sync do pracy w tle poza aktywnym ekranem
