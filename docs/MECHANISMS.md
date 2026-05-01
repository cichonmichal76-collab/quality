# Mechanizmy systemowe ServiceTrace

## RFID login i sesja pracy

Operator produkcji, jakości, montażu lub testów zaczyna pracę przez kartę RFID. RFID wiąże użytkownika z sesją pracy, stanowiskiem, maszyną i procesem. Każdy skan kodu, wynik QC, zdjęcie, NCR i decyzja produkcyjna muszą być powiązane z aktywną sesją.

## Barcode / QR / DataMatrix lifecycle

Każda fizyczna część i istotny podzespół ma unikalny kod. Kod oznacza egzemplarz, a nie typ części. System blokuje duplikaty, ponowne użycie tego samego kodu, użycie kodu nieaktywnego i użycie komponentu już przypisanego do innego urządzenia.

## Scan event ledger

Każde skanowanie zapisuje zdarzenie: kto, kiedy, gdzie, co zeskanował, w jakim procesie i jaki był wynik walidacji. Scan event ledger jest podstawą audytu traceability.

## Production item lifecycle

Fizyczna część przechodzi statusy: created, labeled, produced, qc_in_progress, qc_passed, qc_failed, rework_required, blocked, assembled, scrapped. Status decyduje, czy część może być użyta dalej.

## QC engine

QC engine uruchamia checklistę zależną od typu części, rewizji, procesu i etapu. Obsługuje kroki, zdjęcia, pomiary, tolerancje, automatyczny wynik OK/NOK i blokadę przejścia dalej.

## NCR engine

NCR powstaje przy wyniku NOK albo ręcznym zgłoszeniu niezgodności. Krytyczna otwarta NCR blokuje montaż i wysyłkę. NCR ma statusy: open, review, rework_required, rework_done, accepted_as_is, rejected, closed.

## Assembly by scan

Montaż urządzenia odbywa się przez skanowanie komponentów. W obecnym MVP backend sprawdza aktywną sesję pracy, status komponentu, zgodność typu z aktywnym BOM, zgodność `part_number`, `revision`, `drawing_number` i `drawing_revision` z regułami BOM, limit ilości z BOM i to, czy część nie jest już użyta w innym urządzeniu. Jeśli dla `device_type` istnieją już wersje BOM, ale żadna nie jest aktywna, nowy montaż jest blokowany do czasu aktywacji kolejnej wersji. Operacyjnie nową wersję można przygotować przez klonowanie poprzedniej rewizji BOM razem z pozycjami, bez ręcznego przepisywania komponentów, albo przez promocję aktywnej wersji do nowej rewizji w jednym kroku. Aktywny BOM użyty już przez urządzenia dostaje soft-lock na dalsze rozszerzanie i od tego momentu zmiany powinny przechodzić przez nową wersję. Dla wersji nadal mutowalnych backend pozwala już nie tylko dodawać, ale też aktualizować i usuwać pozycje BOM. Dodatkowy odczyt `bindings` pokazuje, które urządzenia są już związane z wersją BOM, odczyt `coverage` pokazuje kompletność tych urządzeń względem BOM, odczyt `diff` pozwala porównać dwie wersje BOM przed aktywacją albo promocją, a odczyt `readiness` i sama aktywacja pilnują, żeby nowa wersja miała co najmniej jedną wymaganą pozycję. Wersja BOM może też przejść jawny release workflow z `approved_by`, `approved_at` i `release_note`, dzięki czemu wejście BOM do produkcji ma ślad zatwierdzenia. Endpoint assembly zapisuje relację device → component, scan event i audit trail.

Dodatkowo aktywny lookup BOM uwzględnia teraz pola `effective_from` i `effective_to`. W praktyce oznacza to, że BOM może być przygotowany wcześniej albo wygaszony w czasie, ale do nowego montażu trafi dopiero wtedy, gdy jest jednocześnie `ACTIVE` i obowiązuje w bieżącym oknie czasu.

Pozycje BOM mogą być też spinane przez `substitution_group`. Dzięki temu jeden slot montażowy może akceptować kilka alternatywnych `component_type`, a system liczy ilość wymaganą na poziomie całej grupy zamiast każdej pozycji osobno.

## Digital device tree

Po montażu system pokazuje drzewo urządzenia z konkretnymi numerami części i podzespołów. Historia urządzenia powinna pozwalać zejść do historii każdego komponentu.

## Final test gate

Gotowe urządzenie musi przejść final test. Wynik PASS dopuszcza do wysyłki. FAIL tworzy NCR. HOLD blokuje wysyłkę do decyzji jakości.

## Shipment gate

Status READY_FOR_SHIPMENT jest możliwy tylko wtedy, gdy urządzenie ma wymagane komponenty, nie ma komponentów nadmiarowych ani nieoczekiwanych względem BOM, komponenty mają pozytywne QC, final test jest PASS i nie ma blokujących NCR.

W obecnym MVP wymagane komponenty są odczytywane z aktywnego BOM zapisanego w tabelach `device_bom_templates` i `device_bom_items`. Backend porównuje ilości wymagane z faktycznie zainstalowanymi `AssemblyLink`, a bazowa migracja dostarcza minimalny BOM dla `ZSS`, wymagający `CONTROL_PCB`. Część walidacji BOM dzieje się już podczas assembly scan, a pierwszy poprawny montaż przypina urządzenie do konkretnej wersji BOM zapisanej na `AssemblyLink`. Wersja BOM ma jawny status lifecycle `ACTIVE`, `INACTIVE` albo `RETIRED`, a wersja `RETIRED` jest traktowana jako niemodyfikowalna. Shipment pozostaje końcową bramką kompletności i korzysta z tej samej wersji, jeśli urządzenie zostało już do niej przypięte; dla nowych, jeszcze nieprzypiętych urządzeń brak aktywnej wersji BOM blokuje przejście dalej.

Jeśli dla nowego urządzenia istnieje tylko aktywna, ale jeszcze nieobowiązująca albo już wygasła wersja BOM, shipment traktuje to tak samo jak brak aktywnego skutecznego BOM i blokuje `READY_FOR_SHIPMENT` do czasu wejścia właściwej wersji w życie.

To samo dotyczy grup zamienników: shipment uznaje wymóg za spełniony, jeśli łączna ilość zainstalowanych komponentów z danej `substitution_group` zgadza się z BOM, nawet jeżeli fizycznie użyto tylko jednego z dopuszczonych wariantów.

## Mobile offline commissioning

Aplikacja mobilna serwisanta pracuje offline. Lokalnie zapisuje kroki uruchomienia, zdjęcia, komentarze, snapshoty MCU i logi. Po odzyskaniu internetu wysyła paczkę na serwer.

## Service package integrity

Paczka serwisowa ma manifest, sumy kontrolne i status uploadu. Aplikacja nie usuwa lokalnej kopii bez potwierdzenia serwera.

## USB MCU diagnostics

Komunikacja z urządzeniem odbywa się przewodowo. MVP zakłada protokół USB CDC / serial over USB albo mock MCU. Komendy diagnostyczne są tylko do odczytu albo do sesji logowania, bez sterowania funkcjami krytycznymi.

## Service AR Part Identification

Moduł AR dla serwisanta identyfikuje część lub pozwala ją wskazać z hotspotu. Pokazuje numer części, numer seryjny komponentu, historię, dokumentację i procedury. Nie tworzy traceability na produkcji.

## Audit trail

Każda istotna operacja zapisuje kto, kiedy, gdzie, co zrobił, na jakim obiekcie, z jakim wynikiem. Audit trail jest wymagany dla jakości, serwisu i analizy błędów. Obejmuje to także lifecycle BOM: utworzenie wersji, klonowanie wersji, promocję aktywnej wersji, dodanie pozycji, aktualizację pozycji, usunięcie pozycji, aktywację, dezaktywację i wycofanie wersji BOM.

## Versioning

Checklisty, procedury, BOM, dokumentacja, firmware i rewizje części muszą być wersjonowane. Historia urządzenia musi wskazywać, według której wersji procedury wykonano kontrolę albo test.
