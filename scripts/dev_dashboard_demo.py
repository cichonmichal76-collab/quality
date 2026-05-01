from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
DEFAULT_DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite:///./servicetrace_dashboard_demo.db",
)
DEFAULT_SERVICE_TRACE_ENV = os.environ.get("SERVICE_TRACE_ENV", "local")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Przygotuj lokalne demo dashboardu i opcjonalnie uruchom backend API."
    )
    parser.add_argument(
        "--database-url",
        default=DEFAULT_DATABASE_URL,
        help="DATABASE_URL używany podczas migracji, seeda i startu backendu.",
    )
    parser.add_argument(
        "--device-type",
        default="DEMO-LOCAL",
        help="Wartość device_type dla zasianych danych demo.",
    )
    parser.add_argument(
        "--tag",
        default="LOCAL",
        help="Tag używany w numerach seryjnych i barcode danych demo.",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host backendu uruchamianego przez uvicorn.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port backendu uruchamianego przez uvicorn.",
    )
    parser.add_argument(
        "--environment",
        default=DEFAULT_SERVICE_TRACE_ENV,
        help="Wartość SERVICE_TRACE_ENV ustawiana dla komend backendu.",
    )
    parser.add_argument(
        "--skip-migrate",
        action="store_true",
        help="Pomiń alembic upgrade head.",
    )
    parser.add_argument(
        "--skip-seed",
        action="store_true",
        help="Pomiń seed danych demo.",
    )
    parser.add_argument(
        "--skip-verify",
        action="store_true",
        help="Nie uruchamiaj weryfikacji kolejek dashboardu po seedzie.",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Nie seeduj danych; zweryfikuj tylko istniejący kompletny dataset demo.",
    )
    parser.add_argument(
        "--no-server",
        action="store_true",
        help="Przygotuj bazę i zakończ bez uruchamiania uvicorn.",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Uruchom uvicorn z --reload.",
    )
    args = parser.parse_args()
    if args.verify_only and args.skip_seed:
        parser.error("--verify-only nie może być łączone z --skip-seed.")
    if args.verify_only and args.skip_verify:
        parser.error("--verify-only nie może być łączone z --skip-verify.")
    return args


def run_command(command: list[str], *, env: dict[str, str]) -> None:
    print(f">>> {' '.join(command)}", flush=True)
    subprocess.run(command, cwd=BACKEND_DIR, env=env, check=True)


def run_json_command(command: list[str], *, env: dict[str, str]) -> dict[str, object]:
    print(f">>> {' '.join(command)}", flush=True)
    try:
        completed = subprocess.run(
            command,
            cwd=BACKEND_DIR,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        if exc.stdout:
            print(exc.stdout, end="", flush=True)
        if exc.stderr:
            print(exc.stderr, end="", file=sys.stderr, flush=True)
        raise

    if completed.stdout:
        print(completed.stdout, end="", flush=True)
    if completed.stderr:
        print(completed.stderr, end="", file=sys.stderr, flush=True)
    return json.loads(completed.stdout)


def build_env(args: argparse.Namespace) -> dict[str, str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = args.database_url
    env["SERVICE_TRACE_ENV"] = args.environment
    return env


def resolve_sqlite_database_path(database_url: str) -> Path | None:
    sqlite_file_prefix = "sqlite:///"
    if not database_url.startswith(sqlite_file_prefix):
        return None

    raw_path = database_url[len(sqlite_file_prefix) :]
    if not raw_path or raw_path == ":memory:":
        return None

    path = Path(raw_path)
    if path.is_absolute():
        return path.resolve()
    return (BACKEND_DIR / path).resolve()


def print_dataset_summary(seed_result: dict[str, object]) -> None:
    print(f"DEMO_DEVICE_TYPE={seed_result['device_type']}", flush=True)
    print(f"DEMO_DATA_VERIFIED={seed_result['verified']}", flush=True)
    print(f"SHIPMENT_QUEUE_PATH={seed_result['shipment_queue_url']}", flush=True)
    print(
        f"COMPONENT_QUALITY_QUEUE_PATH={seed_result['component_quality_url']}",
        flush=True,
    )


def print_server_summary(
    *,
    host: str,
    port: int,
    seed_result: dict[str, object] | None,
) -> None:
    base_url = f"http://{host}:{port}"
    print(f"API_BASE_URL={base_url}", flush=True)
    print(f"OPENAPI_URL={base_url}/docs", flush=True)
    if seed_result is not None:
        print(f"SHIPMENT_QUEUE_URL={base_url}{seed_result['shipment_queue_url']}", flush=True)
        print(
            "COMPONENT_QUALITY_QUEUE_URL="
            f"{base_url}{seed_result['component_quality_url']}",
            flush=True,
        )


def build_no_server_message(args: argparse.Namespace) -> str:
    if args.verify_only:
        return "Demo dashboardu zweryfikowane. Backend nie został uruchomiony."
    if args.skip_migrate and args.skip_seed:
        return "Pominięto migracje i seed danych demo. Backend nie został uruchomiony."
    if args.skip_seed:
        return "Migracje wykonane. Seed danych demo pominięty. Backend nie został uruchomiony."
    if args.skip_migrate:
        return "Dane demo przygotowane bez migracji. Backend nie został uruchomiony."
    return "Demo dashboardu przygotowane. Backend nie został uruchomiony."


def main() -> int:
    args = parse_args()
    env = build_env(args)
    seed_result: dict[str, object] | None = None

    try:
        if not args.skip_migrate:
            run_command([sys.executable, "-m", "alembic", "upgrade", "head"], env=env)

        if args.verify_only:
            verify_command = [
                sys.executable,
                "-m",
                "app.services.demo_seed",
                "--device-type",
                args.device_type,
                "--verify-only",
            ]
            seed_result = run_json_command(verify_command, env=env)
        elif not args.skip_seed:
            seed_command = [
                sys.executable,
                "-m",
                "app.services.demo_seed",
                "--device-type",
                args.device_type,
                "--tag",
                args.tag,
            ]
            if not args.skip_verify:
                seed_command.append("--verify")
            seed_result = run_json_command(seed_command, env=env)

        if seed_result is not None:
            print_dataset_summary(seed_result)

        if args.no_server:
            print(build_no_server_message(args), flush=True)
            print(f"DATABASE_URL={args.database_url}", flush=True)
            database_path = resolve_sqlite_database_path(args.database_url)
            if database_path is not None:
                print(f"DATABASE_PATH={database_path}", flush=True)
            return 0

        print_server_summary(host=args.host, port=args.port, seed_result=seed_result)
        server_command = [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            args.host,
            "--port",
            str(args.port),
        ]
        if args.reload:
            server_command.append("--reload")

        print(
            f"Start backendu demo pod http://{args.host}:{args.port} z DATABASE_URL={args.database_url}",
            flush=True,
        )
        run_command(server_command, env=env)
        return 0
    except subprocess.CalledProcessError as exc:
        return exc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
