import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from servicetrace_runner.api_client import ServiceTraceApiClient
from servicetrace_runner.mcu_client import MockMcuClient, SerialMcuClient


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_final_test(client, device_override: str | None = None) -> dict:
    if not client.ping():
        raise RuntimeError("MCU PING failed")
    info = client.get_device_info()
    status = client.get_status()
    errors = client.get_errors()
    self_test = client.run_self_test()
    logs = client.get_logs()

    device_sn = device_override or info["device_serial_number"]
    result = "PASS" if self_test.get("test_result") == "PASS" and not errors.get("errors") else "FAIL"

    return {
        "test_run_id": f"FT-{device_sn}-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "device_serial_number": device_sn,
        "operator_id": "final-test-runner",
        "started_at": utc_now(),
        "ended_at": utc_now(),
        "result": result,
        "firmware_version": info.get("firmware_version"),
        "bootloader_version": info.get("bootloader_version"),
        "device_info": info,
        "status": status,
        "errors": errors,
        "self_test": self_test,
        "logs": logs,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="http://localhost:8000")
    parser.add_argument("--device", default=None)
    parser.add_argument("--mock", action="store_true")
    parser.add_argument("--port", default=None)
    parser.add_argument("--output", default="final-test-result.json")
    args = parser.parse_args()

    if args.mock or not args.port:
        mcu = MockMcuClient(device_serial_number=args.device or "ZSS-MOCK-001")
    else:
        mcu = SerialMcuClient(args.port)

    result = run_final_test(mcu, device_override=args.device)
    Path(args.output).write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    api = ServiceTraceApiClient(args.backend)
    api.ensure_device(result["device_serial_number"])
    response = api.submit_final_test(
        {
            "test_run_id": result["test_run_id"],
            "device_serial_number": result["device_serial_number"],
            "operator_id": result["operator_id"],
            "result": result["result"],
            "firmware_version": result["firmware_version"],
            "bootloader_version": result["bootloader_version"],
        }
    )
    print(json.dumps({"local_result": result, "backend_response": response}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
