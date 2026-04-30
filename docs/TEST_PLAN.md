# Plan testów - MVP

## Backend

- healthcheck
- utworzenie urządzenia
- przypisanie komponentu
- blokada `READY_FOR_SHIPMENT` bez `FINAL_TEST_PASSED`
- wynik `PASS` testu końcowego zmienia status
- wynik `FAIL` testu końcowego tworzy NCR
- upload paczki serwisowej wylicza `SHA256`

## Final-test-runner

- `MockMcuClient` dla `PING`
- `MockMcuClient` dla `RUN_SELF_TEST` z wynikiem `PASS`
- generowanie wyniku JSON
- wysyłka do backendu

## Mobile

- utworzenie lokalnej sesji
- wykonanie checklisty 10-krokowej
- dodanie komentarza
- dodanie zdjęcia
- wygenerowanie ZIP
- ustawienie wysyłki w kolejce przy braku internetu
- wysyłka po powrocie sieci
