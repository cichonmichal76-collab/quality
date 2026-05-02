# Moduł Android `app`

Moduł `app` nie jest już pustym szkieletem.

Aktualnie zawiera:

1. `AndroidManifest.xml`
2. `MainActivity`
3. pierwszy ekran Compose dla commissioning offline
4. lokalną warstwę `Room`
5. repozytorium offline i `ViewModel`
6. test JVM dla fabryki draftu commissioning

Najbliższy sensowny krok:

1. dodać `MockMcuClient`
2. dołożyć ekran połączenia USB / mock
3. rozszerzyć draft o zdjęcia i snapshoty
4. przygotować ZIP i kolejkę uploadu
