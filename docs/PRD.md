# PRD - ServiceTrace Platform

## Cel produktu

ServiceTrace Platform ma być modularnym systemem traceability, jakości, testu końcowego, uruchomienia i serwisowej identyfikacji części dla urządzenia medycznego.

System ma śledzić fizyczne egzemplarze części i podzespołów od momentu zejścia z maszyny albo stanowiska elektroniki, przez kontrolę jakości, montaż końcowy, test gotowego urządzenia, wysyłkę, uruchomienie u klienta i późniejszy serwis.

Najważniejszy identyfikator dla historii urządzenia to numer seryjny gotowego urządzenia. Najważniejszy identyfikator dla historii części to unikalny kod fizycznego egzemplarza części, naniesiony jako kod kreskowy, QR albo DataMatrix.

## Krytyczne założenia

Urządzenie jest urządzeniem medycznym. Urządzenie nie ma Wi-Fi, Bluetooth ani BLE. Komunikacja techniczna z MCU odbywa się przewodowo przez USB. Telefon serwisanta może mieć internet, ale urządzenie medyczne nie komunikuje się radiowo.

Na produkcji operator pracuje przy komputerze, laptopie albo terminalu stanowiskowym. Operator loguje się kartą RFID. Część albo podzespół dostaje unikalny kod. System zapisuje, kto wykonał czynność, na jakiej maszynie, kiedy, na jakim stanowisku, według jakiej procedury i z jakim wynikiem.

AR / VR jest wyłącznie modułem serwisanta. Nie jest podstawowym mechanizmem traceability. Traceability powstaje przez RFID, unikalne kody części, skanowanie, checklisty, pomiary, testy, niezgodności i test końcowy.

Integracje z Symfonią i istniejącym systemem SMS są poza MVP, ale architektura ma umożliwić późniejszą integrację przez API.

`Firmware update`, sterowanie napędami, sterowanie elementami wykonawczymi i zmiana konfiguracji medycznej z telefonu są poza MVP.

## Główne moduły systemu

System składa się z backendu traceability, panelu produkcyjno-jakościowego, `final-test-runner`, aplikacji mobilnej serwisanta, modułu Service AR Part Identification oraz panelu biura / jakości.

Backend przechowuje dane operatorów, RFID, maszyn, stanowisk, sesji pracy, etykiet, skanów, części, podzespołów, urządzeń, relacji montażowych, checklist, wyników QC, pomiarów, niezgodności, testów końcowych, sesji serwisowych, paczek serwisowych, dokumentacji, zdjęć i audit trail.

Panel produkcyjno-jakościowy obsługuje logowanie RFID, rejestrację części, tworzenie etykiet, skanowanie kodów, checklisty, pomiary, zdjęcia, niezgodności i przypisanie komponentów do urządzenia.

`Final-test-runner` działa na komputerze stanowiskowym. Łączy się z MCU przez USB, odczytuje dane urządzenia, wykonuje test końcowy, zbiera logi i zapisuje wynik w backendzie.

Aplikacja mobilna Android działa offline u klienta. Łączy się przewodowo z MCU przez USB, prowadzi serwisanta krok po kroku przez uruchomienie, zbiera logi, zdjęcia, komentarze i snapshoty statusów, tworzy paczkę serwisową i wysyła ją po odzyskaniu internetu.

Service AR Part Identification działa w aplikacji mobilnej. Serwisant kieruje kamerę na element urządzenia albo wybiera element z widoku referencyjnego. Aplikacja pokazuje nazwę części, numer części, numer seryjny komponentu, historię traceability, dokumentację, diagnostykę i procedurę wymiany.

## Proces end-to-end

Część mechaniczna schodzi z maszyny. Operator loguje się RFID przy stanowisku, część dostaje unikalny kod, operator skanuje kod i uruchamia procedurę rejestracji albo QC. System zapisuje operatora, maszynę, stanowisko, datę, proces, rysunek, rewizję, materiał, zdjęcia, pomiary i wynik.

Część, która przejdzie QC, otrzymuje status dopuszczony. Część z wynikiem NOK otrzymuje status zablokowany albo `rework` i tworzy się NCR. Część z otwartą krytyczną NCR nie może wejść do montażu.

Elektronika działa analogicznie. Każda PCB i podzespół elektroniczny otrzymuje własny kod. System zapisuje wersję PCB, rewizję, BOM, firmware, wynik kontroli wizualnej, test komunikacji, test watchdog, port USB i zdjęcia. Podzespół bez pozytywnego testu nie może być przypisany do gotowego urządzenia.

Dla gotowego urządzenia tworzony jest numer seryjny. Operator montażu loguje się RFID i skanuje wszystkie wymagane komponenty. System sprawdza typ, QC, NCR, unikalność użycia i zgodność z BOM. Po skanowaniu powstaje drzewo urządzenia z konkretnych fizycznych podzespołów.

Po montażu końcowym system uruchamia checklistę montażową. Operator potwierdza mocowania, połączenia, uziemienie, osłony, oznaczenia, port USB serwisowy i elementy bezpieczeństwa. System może wymagać zdjęć określonych miejsc.

Gotowe urządzenie przechodzi test końcowy przez USB. Runner odczytuje z MCU numer seryjny, firmware, bootloader, status mainboarda, płyty indukcji, watchdog, błędy i logi. Test obejmuje zasilanie, mainboard, płytę indukcji, watchdog, HMI, komunikację między płytami, port USB, błędy, procedurę startową i funkcje urządzenia. `PASS` dopuszcza do wysyłki. `FAIL` tworzy NCR i blokuje wysyłkę. `HOLD` wstrzymuje decyzję jakości.

Urządzenie nie może otrzymać statusu gotowe do wysyłki, jeżeli brakuje wymaganego komponentu, komponent nie przeszedł QC, komponent ma blokującą NCR, urządzenie nie przeszło testu końcowego, numer z MCU nie zgadza się z bazą albo dokumentacja montażowa jest niekompletna.

U klienta serwisant loguje się w aplikacji mobilnej, identyfikuje urządzenie przez kod z tabliczki, QR z HMI, ręczny numer seryjny albo odczyt przez USB. Telefon łączy się przewodowo z MCU. Aplikacja odczytuje dane, prowadzi procedurę commissioning, zapisuje zdjęcia, komentarze, checklistę, logi i snapshoty. Po zakończeniu tworzy paczkę serwisową i wysyła ją na serwer po odzyskaniu internetu.

W serwisie późniejszym użytkownik widzi pełną historię urządzenia. Jeżeli wymienia część, skanuje stary i nowy komponent. System zapisuje demontaż, montaż, powód wymiany, osobę, datę, zdjęcia i wynik testu po wymianie.

## Service AR Part Identification

AR służy tylko serwisowi. W MVP działa jako atlas serwisowy z widokami referencyjnymi i hotspotami. Docelowo może używać modelu vision działającego offline na telefonie.

Rozpoznawanie obrazu identyfikuje typ części. Konkretny numer seryjny części jest pobierany z historii urządzenia po numerze seryjnym urządzenia. Aplikacja musi najpierw wiedzieć, z którym urządzeniem pracuje serwisant.

Po rozpoznaniu części aplikacja pokazuje nazwę części, numer części, numer seryjny komponentu, status QC, wynik testu końcowego, datę montażu, dokumentację, diagnostykę, procedurę wymiany i możliwość zgłoszenia usterki.

## MVP

MVP obejmuje backend traceability, operatora / RFID / stanowisko pracy, cykl życia barcode, elementy produkcyjne, QC, QC elektroniki, montaż przez skanowanie, test końcowy z mock MCU i docelowym interfejsem USB, bramkę wysyłki, aplikację mobilną z commissioning offline oraz Service AR Part Identification jako atlas z hotspotami.

## Poza MVP

Poza MVP pozostają pełne AI rozpoznające wszystkie części, VR szkoleniowy, `firmware update`, sterowanie urządzeniem z telefonu, integracje z Symfonią i SMS, magazyn części, zaawansowany BI, automatyczna analiza uszkodzeń ze zdjęć i pełna synchronizacja ERP.

## Kryteria odbioru MVP

System jest akceptowalny jako MVP, jeżeli operator może zalogować się RFID, zarejestrować część, nadać kod, wykonać QC, zapisać wynik, zablokować NOK, zarejestrować podzespół elektroniczny, złożyć urządzenie przez skanowanie komponentów, wykonać test końcowy, zablokować wysyłkę przy braku `PASS`, uruchomić aplikację mobilną, przejść procedurę commissioning, zebrać dane z MCU albo mock MCU, zapisać paczkę offline i wysłać ją na backend.

System musi pokazać historię urządzenia obejmującą części, operatorów, maszyny, QC, NCR, montaż, test końcowy, commissioning i serwis.
