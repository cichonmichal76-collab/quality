# ADR 0001: Modular Monolith Backend

- Status: accepted

## Context

ServiceTrace covers tightly connected domains: RFID sessions, traceability, QC, NCR, assembly, final test, shipment decisions, service sessions, and audit history.

These domains share a single source of truth and are linked through strong transactional rules. Examples include:

- a final test failure creating a blocking NCR
- a barcode scan changing production item history
- shipment being blocked by upstream QC or final test state
- audit events needing the same identifiers used by production workflows

At the current stage, the product is still in MVP construction and several modules are only partially implemented.

## Decision

The backend will be built as a modular monolith.

This means:

- one deployable backend service
- one primary relational database
- domain-oriented module boundaries in code
- shared migrations and shared operational tooling
- internal service boundaries expressed through modules, schemas, and services rather than network calls

The intended backend split is represented by modules such as:

- `auth_rfid`
- `traceability`
- `qc`
- `assembly`
- `final_test`
- `shipment`
- `service`
- `files`

## Consequences

Positive:

- easier to enforce cross-domain consistency
- simpler local development and CI
- lower operational overhead for an MVP team
- faster refactoring while domain rules are still changing

Tradeoffs:

- stronger need for discipline inside one codebase
- risk of route and service sprawl if module boundaries are ignored
- future extraction of services would require deliberate interface hardening

Implementation guidance:

- new backend work should prefer module routers and module services
- shared state transitions should stay explicit and test-covered
- microservice extraction is not a goal unless scaling or organizational constraints clearly justify it
