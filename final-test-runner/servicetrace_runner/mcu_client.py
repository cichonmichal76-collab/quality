import json
from abc import ABC, abstractmethod
from typing import Any


class McuClient(ABC):
    @abstractmethod
    def command(self, name: str) -> dict[str, Any]:
        raise NotImplementedError

    def ping(self) -> bool:
        return self.command("PING").get("response") == "PONG"

    def get_device_info(self) -> dict[str, Any]:
        return self.command("GET_DEVICE_INFO")

    def get_status(self) -> dict[str, Any]:
        return self.command("GET_STATUS")

    def get_errors(self) -> dict[str, Any]:
        return self.command("GET_ERRORS")

    def run_self_test(self) -> dict[str, Any]:
        return self.command("RUN_SELF_TEST")

    def get_logs(self) -> dict[str, Any]:
        return self.command("GET_LOGS")


class MockMcuClient(McuClient):
    def __init__(self, device_serial_number: str = "ZSS-MOCK-001"):
        self.device_serial_number = device_serial_number

    def command(self, name: str) -> dict[str, Any]:
        if name == "PING":
            return {"status": "ok", "response": "PONG"}
        if name == "GET_DEVICE_INFO":
            return {
                "status": "ok",
                "device_serial_number": self.device_serial_number,
                "device_type": "ZSS",
                "firmware_version": "1.2.4",
                "bootloader_version": "0.9.8",
                "hardware_version": "HW-1.0",
            }
        if name == "GET_STATUS":
            return {
                "status": "ok",
                "state": "READY",
                "v24": 24.1,
                "temperature_mcu": 38.4,
                "watchdog": "OK",
                "mainboard": "OK",
                "induction_board": "OK",
                "active_errors": [],
            }
        if name == "GET_ERRORS":
            return {"status": "ok", "errors": []}
        if name == "RUN_SELF_TEST":
            return {
                "status": "ok",
                "test_result": "PASS",
                "tests": [
                    {"name": "mainboard", "result": "PASS"},
                    {"name": "induction_board", "result": "PASS"},
                    {"name": "watchdog", "result": "PASS"},
                    {"name": "power_24v", "result": "PASS", "value": 24.1},
                ],
            }
        if name == "GET_LOGS":
            return {
                "status": "ok",
                "logs": [
                    {"mcu_time_ms": 1000, "level": "INFO", "event": "BOOT"},
                    {"mcu_time_ms": 2000, "level": "INFO", "event": "SELF_TEST_PASS"},
                ],
            }
        return {"status": "error", "message": f"Unknown command {name}"}


class SerialMcuClient(McuClient):
    def __init__(self, port: str, baudrate: int = 115200, timeout: float = 2.0):
        import serial

        self.serial = serial.Serial(port=port, baudrate=baudrate, timeout=timeout)

    def command(self, name: str) -> dict[str, Any]:
        self.serial.write((name + "\n").encode("utf-8"))
        raw = self.serial.readline().decode("utf-8").strip()
        if not raw:
            raise TimeoutError(f"No response for {name}")
        return json.loads(raw)
