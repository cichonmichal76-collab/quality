# Final Test Runner

Python CLI for running final device tests and sending the result to the ServiceTrace backend.

The runner supports:

- mock MCU mode for local development
- serial over USB mode for workstation testing
- local JSON result output
- backend upload of final test metadata

## Prerequisites

- Python 3.11+
- reachable ServiceTrace backend
- active `work_session_id` from an RFID-authenticated workstation session
- USB serial connection when using hardware mode

## Install

```bash
cd final-test-runner
pip install -e .[dev]
```

## Quick start

Mock mode:

```bash
python -m servicetrace_runner.main --device ZSS-000123 --backend http://localhost:8000 --mock --work-session-id WS-1234567890AB
```

Serial / USB CDC mode:

```bash
python -m servicetrace_runner.main --device ZSS-000123 --backend http://localhost:8000 --port COM5 --work-session-id WS-1234567890AB
```

The CLI also exposes the console script:

```bash
servicetrace-final-test --device ZSS-000123 --backend http://localhost:8000 --mock --work-session-id WS-1234567890AB
```

## CLI arguments

- `--backend`
  Backend base URL. Default: `http://localhost:8000`
- `--device`
  Device serial number override. If omitted in mock mode, a default mock serial is used.
- `--mock`
  Use the in-process mock MCU client.
- `--port`
  Serial port for USB CDC communication, for example `COM5`.
- `--output`
  Local JSON output path. Default: `final-test-result.json`
- `--work-session-id`
  Required for backend upload. Must point to an active workstation session.

## What the runner does

The runner performs this sequence:

1. connect to MCU
2. `PING`
3. `GET_DEVICE_INFO`
4. `GET_STATUS`
5. `GET_ERRORS`
6. `RUN_SELF_TEST`
7. `GET_LOGS`
8. compute a local PASS or FAIL
9. write the local result JSON file
10. ensure the device exists in backend
11. upload final test metadata to `/api/final-tests`

Current result logic is intentionally simple:

- `PASS` when self-test returns `PASS` and no MCU errors are reported
- `FAIL` otherwise

## Backend contract

Before upload, the runner calls:

- `POST /api/devices` to ensure the device exists
- `POST /api/final-tests` to store the final test run

Uploaded payload fields currently include:

- `test_run_id`
- `device_serial_number`
- `operator_id`
- `result`
- `firmware_version`
- `bootloader_version`
- `work_session_id`

The full local JSON result also contains raw MCU data such as:

- `device_info`
- `status`
- `errors`
- `self_test`
- `logs`

## Output artifact

By default the runner writes `final-test-result.json` in the current directory.

That file is useful for:

- local troubleshooting
- attaching artifacts to a future workstation workflow
- debugging backend integration without rerunning hardware steps

## Mock MCU behavior

The mock client returns deterministic values for:

- device info
- status
- error list
- self-test output
- logs

This makes it suitable for backend development, CI-oriented local checks, and demos without hardware access.

## Tests and lint

```bash
cd final-test-runner
pytest
ruff check .
```

## Current limitations

- no retry strategy on backend upload
- no persisted artifact bundle beyond the local JSON file
- no workstation-side workflow orchestration yet
- no advanced PASS, FAIL, HOLD rule engine yet
- no protocol version negotiation yet
