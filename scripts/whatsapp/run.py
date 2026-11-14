#!/usr/bin/env python3
"""Run the existing WhatsApp bridge and gateway with a dedicated local cluster."""

import os
from pathlib import Path
import secrets
import shutil
import signal
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import Request, urlopen


def wait_until_ready(url, children, token=None, timeout=40):
    headers = {"Authorization": "Bearer " + token} if token else {}
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for name, child in children:
            if child.poll() is not None:
                raise RuntimeError(f"{name} encerrou. Consulte o log do WhatsApp.")
        try:
            with urlopen(Request(url, headers=headers), timeout=2) as response:
                if response.status == 200:
                    return
        except (OSError, URLError):
            pass
        time.sleep(0.25)
    raise RuntimeError("O serviço de WhatsApp não respondeu no prazo.")


def prepare_engine(source, state, env):
    tracked = subprocess.check_output(
        ["git", "ls-files", "-z", "go.mod", "go.sum", "cmd", "internal", "migrations"],
        cwd=source,
    ).decode().split("\0")
    staging = state / "engine"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(mode=0o700)
    for name in filter(None, tracked):
        item = Path(name)
        if item.suffix not in {".go", ".sql", ".mod", ".sum"}:
            continue
        original = source / item
        if original.is_symlink() or not original.is_file():
            raise RuntimeError("O checkout do motor está incompleto.")
        target = staging / item
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(original, target)
    patch = Path(__file__).with_name("loopback.patch")
    patch_env = {**env, "GIT_CEILING_DIRECTORIES": str(staging.parent)}
    subprocess.run(["git", "apply", str(patch)], cwd=staging, env=patch_env, check=True)
    for name in ("sdr-whatsapp-engine", "wa-gateway-service"):
        subprocess.run(["go", "build", "-o", str(state / name), "./cmd/" + name],
                       cwd=staging, env=env, check=True)
    return staging


def private_value(path):
    if not path.exists():
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as file:
            file.write(secrets.token_urlsafe(48) + "\n")
    if path.is_symlink() or path.stat().st_mode & 0o077:
        raise RuntimeError("O arquivo de senha deve ser privado.")
    value = path.read_text().strip()
    if len(value) < 40:
        raise RuntimeError("O arquivo de senha local está incompleto.")
    return value


def run(source, state, postgres, token_file):
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    state.chmod(0o700)
    media = state / "media"
    media.mkdir(exist_ok=True, mode=0o700)
    pgdata = state / "pgdata"
    password_file = state / "pg-password"
    password = private_value(password_file)
    token = private_value(token_file)
    database = "arkom_sdr_whatsapp_demo"
    dsn = f"postgres://arkomwa:{password}@127.0.0.1:55496/{database}?sslmode=disable"
    env = {key: os.environ[key] for key in ("PATH", "LANG", "TMPDIR", "GOCACHE", "GOPATH", "GOMODCACHE") if key in os.environ}
    env.update(
        SDR_WHATSAPP_LOCAL_DEMO="true",
        DATABASE_URL=dsn,
        WHATSMEOW_DATABASE_URL=dsn,
        SDR_WHATSAPP_ENGINE_TOKEN_FILE=str(token_file),
        SDR_TRANSPORT_ENABLED="true",
        SDR_TRANSPORT_AUTH_URL="http://127.0.0.1:8081/internal/transport/authorize",
        MEDIA_CACHE_DIR=str(media),
        WA_MAX_RUNTIMES="2",
        WA_MAX_RUNTIMES_PER_TENANT="1",
        WEBHOOK_WORKERS="1",
    )
    build_env = {key: env[key] for key in ("PATH", "LANG", "TMPDIR", "GOPATH", "GOMODCACHE", "GOCACHE") if key in env}
    for key in ("GOPATH", "GOMODCACHE", "GOCACHE"):
        if key not in build_env:
            build_env[key] = subprocess.check_output(
                ["go", "env", key], cwd=source, text=True,
            ).strip()
    staging = prepare_engine(source, state, build_env)
    children = []

    def start(name, args):
        process = subprocess.Popen(args, cwd=staging, env=env)
        children.append((name, process))

    def interrupt(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupt)
    try:
        if not (pgdata / "PG_VERSION").is_file():
            subprocess.run(
                [str(postgres / "initdb"), "-D", str(pgdata), "-U", "arkomwa",
                 "--auth=scram-sha-256", "--pwfile", str(password_file), "--encoding=UTF8",
                 "--no-locale"],
                env=env, stdout=subprocess.DEVNULL, check=True,
            )
        start("postgres", [str(postgres / "postgres"), "-D", str(pgdata),
                           "-h", "127.0.0.1", "-p", "55496", "-c", "unix_socket_directories="])
        for _ in range(80):
            ready = subprocess.run([str(postgres / "pg_isready"), "-q", "-h", "127.0.0.1", "-p", "55496"],
                                   env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if ready.returncode == 0:
                break
            if children[0][1].poll() is not None:
                raise RuntimeError("O PostgreSQL dedicado do WhatsApp encerrou.")
            time.sleep(0.25)
        else:
            raise RuntimeError("O PostgreSQL dedicado do WhatsApp não respondeu.")
        pg_env = {**env, "PGPASSWORD": password}
        psql = [str(postgres / "psql"), "-X", "-w", "-h", "127.0.0.1",
                "-p", "55496", "-U", "arkomwa", "-d", "postgres", "-At"]
        exists = subprocess.check_output(
            [*psql, "-c", "SELECT 1 FROM pg_database WHERE datname='arkom_sdr_whatsapp_demo'"],
            env=pg_env, text=True,
        ).strip()
        if exists != "1":
            subprocess.run([*psql, "-v", "ON_ERROR_STOP=1", "-c", "CREATE DATABASE arkom_sdr_whatsapp_demo"],
                           env=pg_env, check=True, stdout=subprocess.DEVNULL)
        stamp = state / "schema-ready"
        if not stamp.is_file():
            subprocess.run([str(state / "sdr-whatsapp-engine"), "-migrate"],
                           cwd=staging, env=env, check=True)
            stamp.touch(mode=0o600)
        start("bridge", [str(state / "sdr-whatsapp-engine")])
        wait_until_ready("http://127.0.0.1:18083/healthz", children, token)
        start("gateway", [str(state / "wa-gateway-service")])
        wait_until_ready("http://127.0.0.1:18084/healthz", children)
        print("Gateway WhatsApp local pronto.", flush=True)
        while True:
            for name, process in children:
                if process.poll() is not None:
                    raise RuntimeError(f"{name} encerrou. Consulte o log do WhatsApp.")
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        for _, process in reversed(children):
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=6)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == "__main__":
    try:
        run(*(Path(arg).resolve() for arg in sys.argv[1:]))
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"WhatsApp local indisponível: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
