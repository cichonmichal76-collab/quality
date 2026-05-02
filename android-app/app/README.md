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
14. trwale ustawienia syncu: adres backendu i wlaczony / wylaczony auto-sync
15. `WorkManager` z odlozonym workerem synchronizacji dla sesji gotowych offline
16. retry worker tylko dla bledow przejsciowych typu transport / 5xx / 429
17. limit auto-retry i czytelny stan `wymaga recznej interwencji` po wyczerpaniu prob
18. trwały `reason code` bledu syncu zapisany w draftcie i pokazany w UI
19. lokalna historia prob syncu per sesja z triggerem i wynikiem
20. testy JVM dla fabryki draftu, snapshotu, mocka MCU, serializacji paczki, polityki syncu i normalizacji adresu API

Domyslny adres backendu dla syncu to `http://10.0.2.2:8000/api`.

Najblizszy sensowny krok:

1. rozszerzyc snapshoty i artefakty diagnostyczne
2. rozbudowac worker o strategia okresowa albo batch sync dla dluzszego offline
3. dolozyc telemetry backendowe, correlation id i ewentualny ekran audytu historii syncu
