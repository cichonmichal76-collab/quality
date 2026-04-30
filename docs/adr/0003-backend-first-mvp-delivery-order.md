# ADR 0003: Backend-First MVP Delivery Order

- Status: accepted

## Context

ServiceTrace contains multiple application surfaces:

- backend API
- production and quality web UI
- final-test runner
- Android mobile app
- future service AR workflows

However, all important product value depends on a reliable traceability core:

- operators and RFID sessions
- barcode identity for physical parts
- item and device history
- QC decisions and NCR creation
- final-test recording
- shipment blocking rules
- audit trail

Without that backend foundation, UI and mobile work would produce demos rather than durable system capability.

## Decision

MVP delivery will proceed backend first.

The preferred order is:

1. repository and CI foundation
2. backend core and schema migrations
3. RFID sessions
4. barcode lifecycle
5. QC flows
6. assembly by scan
7. final-test runner integration
8. shipment gate
9. offline mobile commissioning
10. service AR identification

## Consequences

Positive:

- core traceability rules are stabilized before UI layers multiply
- hardware and service clients integrate against a real backend contract
- tests can focus on domain behavior before front-end polish
- later apps have a clearer API and workflow target

Tradeoffs:

- repository may temporarily contain scaffolds before full applications exist
- early demos may look backend-heavy
- product visibility for non-technical stakeholders may lag behind infrastructure progress

Implementation guidance:

- prioritize backend domain completeness over premature front-end breadth
- document placeholder applications clearly so the repo does not overstate implementation status
- use the backend contract as the shared foundation for later web, runner, and mobile work
