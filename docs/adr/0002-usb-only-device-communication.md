# ADR 0002: Komunikacja z urządzeniem wyłącznie po USB

- Status: zaakceptowany

## Kontekst

Docelowy produkt jest urządzeniem medycznym. Ograniczenia produktowe jednoznacznie odrzucają Wi-Fi, Bluetooth i BLE jako ścieżkę komunikacji między urządzeniem a narzędziami serwisowymi lub testowymi.

Jednocześnie produkcja i późniejszy serwis nadal potrzebują dostępu do:

- numeru seryjnego urządzenia
- wersji firmware i bootloadera
- informacji o stanie i zdrowiu urządzenia
- wyników self-testu
- logów i błędów

## Decyzja

Komunikacja techniczna z MCU urządzenia będzie odbywać się przewodowo po USB.

W aktualnym MVP jest to odwzorowane jako USB CDC albo serial over USB z prostym interfejsem poleceń używanym przez final-test-runner i później przez mobilny przepływ serwisowy.

Łączność bezprzewodowa po stronie samego urządzenia jest poza zakresem.

## Konsekwencje

Pozytywne:

- zgodność z ograniczeniem komunikacyjnym urządzenia medycznego
- prostsza historia bezpieczeństwa i compliance po stronie urządzenia
- przewidywalny transport dla scenariuszy final testu na stanowisku
- spójne założenie transportowe dla backendu, runnera i planowanej aplikacji mobilnej

Koszty i kompromisy:

- przepływy serwisowe zależą od kabla i wsparcia USB Host
- UX na telefonie jest bardziej ograniczony niż przy podejściu bezprzewodowym
- narzędzia muszą bezpośrednio obsługiwać przypadki brzegowe serial/USB

Wskazówki implementacyjne:

- narzędzia MCU powinny być projektowane wokół USB jako założenia transportowego
- nie należy projektować przepływów produkcyjnych ani serwisowych wymagających Wi-Fi albo Bluetooth w urządzeniu
- każda przyszła zmiana transportu wymaga nowego ADR
