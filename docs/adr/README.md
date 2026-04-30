# Architecture Decision Records

This directory stores architecture decisions that have long-term impact on the project.

Use ADRs for choices that affect:

- system structure
- integration boundaries
- operational assumptions
- technology constraints
- product-specific engineering rules

## Naming convention

- use zero-padded numbers such as `0001`, `0002`, `0003`
- use short kebab-case titles
- keep one decision per file

## Suggested ADR structure

Each ADR should contain:

1. status
2. context
3. decision
4. consequences

## Current ADRs

- [0001 - Modular monolith backend](./0001-modular-monolith-backend.md)
- [0002 - USB-only device communication](./0002-usb-only-device-communication.md)
- [0003 - Backend-first MVP delivery order](./0003-backend-first-mvp-delivery-order.md)

## When to add a new ADR

Add an ADR when the answer to "why is the system built this way?" is important enough that future contributors should not have to reconstruct it from code, chat history, or old commits.
