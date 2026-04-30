import requests


class ServiceTraceApiClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def ensure_device(self, device_serial_number: str, device_type: str = "ZSS") -> None:
        payload = {"device_serial_number": device_serial_number, "device_type": device_type}
        response = requests.post(f"{self.base_url}/api/devices", json=payload, timeout=10)
        if response.status_code not in (200, 409):
            response.raise_for_status()

    def submit_final_test(self, payload: dict) -> dict:
        response = requests.post(f"{self.base_url}/api/final-tests", json=payload, timeout=20)
        response.raise_for_status()
        return response.json()
