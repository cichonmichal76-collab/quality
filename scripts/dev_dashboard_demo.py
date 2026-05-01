from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Przygotuj lokalne demo dashboardu i opcjonalnie uruchom backend API."
    )
    parser.add_argument(
        "--database-url",
        default="sqlite:///./servicetrace_dashboard_demo.db",
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
        default="local",
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
        "--no-server",
        action="store_true",
        help="Przygotuj bazę i zakończ bez uruchamiania uvicorn.",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Uruchom uvicorn z --reload.",
    )
    return parser.parse_args()


def run_command(command: list[str], *, env: dict[str, str]) -> None:
    print(f">>> {' '.join(command)}", flush=True)
    subprocess.run(command, cwd=BACKEND_DIR, env=env, check=True)


def build_env(args: argparse.Namespace) -> dict[str, str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = args.database_url
    env["SERVICE_TRACE_ENV"] = args.environment
    return env


def main() -> int:
    args = parse_args()
    env = build_env(args)

    if not args.skip_migrate:
        run_command([sys.executable, "-m", "alembic", "upgrade", "head"], env=env)

    if not args.skip_seed:
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
        run_command(seed_command, env=env)

    if args.no_server:
        print("Demo dashboardu przygotowane. Backend nie został uruchomiony.", flush=True)
        print(f"DATABASE_URL={args.database_url}", flush=True)
        return 0

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


if __name__ == "__main__":
    raise SystemExit(main())
