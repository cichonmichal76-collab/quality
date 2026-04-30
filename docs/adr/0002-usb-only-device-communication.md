# ADR 0002: USB-Only Device Communication

- Status: accepted

## Context

The target product is a medical device. Product constraints explicitly reject Wi-Fi, Bluetooth, and BLE as the communication path between the device and the service or test tooling.

Both production diagnostics and field service workflows still need access to:

- device serial number
- firmware and bootloader versions
- health and status information
- self-test results
- logs and error information

## Decision

Technical communication with the device MCU will use wired USB communication.

For the current MVP this is represented as USB CDC or serial-over-USB behavior, with a simple command interface used by the final-test runner and later by the Android service flow.

Wireless connectivity is out of scope for the device itself.

## Consequences

Positive:

- aligned with the medical-device communication constraint
- simpler security and compliance story for the device
- predictable transport for workstation final-test scenarios
- consistent transport assumption for backend, runner, and mobile planning

Tradeoffs:

- service workflows depend on cable and USB host support
- mobile UX is more constrained than a wireless pairing approach
- tooling must handle serial and USB edge cases directly

Implementation guidance:

- keep MCU tooling built around USB transport assumptions
- do not design production or service flows that require device Wi-Fi or Bluetooth
- any future transport expansion would require a new ADR
