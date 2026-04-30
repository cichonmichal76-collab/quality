# ADR 0001: Modularny monolit backendu

- Status: zaakceptowany

## Kontekst

ServiceTrace obejmuje ściśle powiązane domeny: sesje RFID, traceability, QC, NCR, assembly, final test, decyzje shipment, sesje serwisowe i historię audytową.

Te domeny współdzielą jedno źródło prawdy i są spięte silnymi regułami transakcyjnymi. Przykłady:

- final test FAIL tworzy blokującą NCR
- skan barcode zmienia historię production itemu
- shipment może zostać zablokowany przez wcześniejsze QC albo final test
- audit eventy muszą używać tych samych identyfikatorów co przepływy produkcyjne

Na obecnym etapie produkt nadal jest w budowie MVP, a kilka modułów jest zaimplementowanych tylko częściowo.

## Decyzja

Backend będzie budowany jako modularny monolit.

To oznacza:

- jeden wdrażalny serwis backendowy
- jedną główną relacyjną bazę danych
- granice domenowe wyrażone przez moduły w kodzie
- wspólne migracje i wspólne narzędzia operacyjne
- granice usługowe realizowane przez moduły, schematy i serwisy, a nie przez wywołania sieciowe

Docelowy podział backendu reprezentują moduły takie jak:

- `auth_rfid`
- `traceability`
- `qc`
- `assembly`
- `final_test`
- `shipment`
- `service`
- `files`

## Konsekwencje

Pozytywne:

- łatwiej egzekwować spójność między domenami
- prostszy lokalny development i CI
- mniejszy narzut operacyjny dla zespołu budującego MVP
- szybszy refaktor, gdy reguły domenowe nadal się zmieniają

Koszty i kompromisy:

- większa potrzeba dyscypliny wewnątrz jednego codebase
- ryzyko rozrastania się routerów i serwisów, jeśli granice modułów będą ignorowane
- ewentualne wydzielanie serwisów w przyszłości będzie wymagało świadomego utwardzenia interfejsów

Wskazówki implementacyjne:

- nowa praca backendowa powinna trafiać do routerów i serwisów modułowych
- współdzielone przejścia stanów powinny być jawne i pokryte testami
- wydzielanie mikroserwisów nie jest celem, dopóki skala albo organizacja nie uzasadni tego wprost
