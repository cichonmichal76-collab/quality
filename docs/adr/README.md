# ADR-y

Ten katalog przechowuje decyzje architektoniczne, które mają długofalowy wpływ na projekt.

Używaj ADR-ów do wyborów wpływających na:

- strukturę systemu
- granice integracyjne
- założenia operacyjne
- ograniczenia technologiczne
- reguły inżynierskie specyficzne dla produktu

## Konwencja nazewnicza

- używaj numerów z zerami wiodącymi, takich jak `0001`, `0002`, `0003`
- używaj krótkich nazw w kebab-case
- jeden plik powinien opisywać jedną decyzję

## Sugerowana struktura ADR

Każdy ADR powinien zawierać:

1. status
2. kontekst
3. decyzję
4. konsekwencje

## Aktualne ADR-y

- [0001 - Modularny monolit backendu](./0001-modular-monolith-backend.md)
- [0002 - Komunikacja z urządzeniem wyłącznie po USB](./0002-usb-only-device-communication.md)
- [0003 - Kolejność dostarczania MVP z backendem na pierwszym planie](./0003-backend-first-mvp-delivery-order.md)

## Kiedy dodać nowy ADR

Dodaj ADR wtedy, gdy odpowiedź na pytanie „dlaczego system jest zbudowany właśnie tak?” jest na tyle ważna, że przyszli współtwórcy nie powinni odtwarzać jej z kodu, historii czatu albo starych commitów.
