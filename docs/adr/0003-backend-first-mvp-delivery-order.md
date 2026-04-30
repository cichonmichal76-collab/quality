# ADR 0003: Kolejność dostarczania MVP z backendem na pierwszym planie

- Status: zaakceptowany

## Kontekst

ServiceTrace ma kilka powierzchni aplikacyjnych:

- backend API
- web UI dla produkcji i jakości
- final-test-runner
- aplikację mobilną Android
- przyszłe przepływy AR dla serwisu

Jednak cała wartość produktu opiera się na stabilnym rdzeniu traceability:

- operatorzy i sesje RFID
- tożsamość barcode dla fizycznych części
- historia itemu i urządzenia
- decyzje QC i tworzenie NCR
- zapis final testu
- reguły blokujące shipment
- audit trail

Bez takiego fundamentu backendowego warstwy UI i mobile dawałyby raczej demo niż trwałą zdolność systemową.

## Decyzja

Dostarczanie MVP będzie przebiegać z backendem na pierwszym planie.

Preferowana kolejność:

1. fundament repo i CI
2. backend core i migracje schematu
3. sesje RFID
4. lifecycle barcode
5. flow QC
6. assembly by scan
7. integracja final-test-runnera
8. shipment gate
9. commissioning mobilny offline
10. identyfikacja serwisowa AR

## Konsekwencje

Pozytywne:

- reguły traceability stabilizują się przed rozbudową warstw UI
- klienci sprzętowi i serwisowi integrują się z realnym kontraktem backendowym
- testy mogą skupić się na zachowaniu domenowym przed dopieszczaniem frontendu
- późniejsze aplikacje dostają jaśniejszy target API i przepływu

Koszty i kompromisy:

- repo przez pewien czas może zawierać scaffoldy zanim powstaną pełne aplikacje
- wczesne demo mogą wyglądać mocno backendowo
- widoczność produktu dla osób nietechnicznych może chwilowo odstawać od postępu infrastrukturalnego

Wskazówki implementacyjne:

- priorytetem powinna być kompletność domenowa backendu ponad przedwczesne rozszerzanie frontendu
- szkice aplikacji powinny być jasno opisane, żeby repo nie sugerowało większego poziomu gotowości niż w rzeczywistości
- kontrakt backendowy powinien być wspólnym fundamentem dla dalszej pracy web, runnera i mobile
