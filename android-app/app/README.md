# Moduł Android `app`

Moduł `app` nie jest już pustym szkieletem.

Aktualnie zawiera:

1. `AndroidManifest.xml`
2. `MainActivity`
3. pierwszy ekran Compose dla commissioning offline
4. krok połączenia `Mock MCU / USB`
5. lokalną warstwę `Room`
6. repozytorium offline i `ViewModel`
7. testy JVM dla fabryki draftu i mocka MCU

Najbliższy sensowny krok:

1. dołożyć właściwy `UsbMcuClient`
2. rozszerzyć draft o zdjęcia i snapshoty
3. przygotować ZIP i kolejkę uploadu
