#!/usr/bin/env python3
"""Run FinanceAI against the dedicated homologation database."""
from contextlib import ExitStack
import os
from pathlib import Path
import secrets
import signal
import subprocess
import sys
import threading
import time

root = Path("/opt/arkomgo-homolog/finance")
state = Path("/var/lib/arkomgo-homolog/finance")
# Reuse this provisioning module without running the laptop-specific launcher.
from provision import call, prepare_maia, private_file, provision
from web import API_PORT, ORIGINS, server

binaries = root / "bin"
provision_key = state / "provisioning.key"
password = Path("/etc/arkomgo-homolog/secrets/finance-postgres").read_text().strip()
database = "financeai_lab_arkom"
base = {
    "PATH": "/usr/bin:/bin",
    "HOME": str(state),
    "FINANCEAI_DATABASE_URL": f"postgres://financeai_arkom:{password}@127.0.0.1:55496/{database}?sslmode=disable",
    "FINANCEAI_BANKING_MODE": "simulated",
    "FINANCEAI_AI_MODE": "simulated",
    "FINANCEAI_FISCAL_MODE": "simulated",
}

def stop(*_):
    raise KeyboardInterrupt

def main():
    os.umask(0o077)
    os.chdir(state)
    signal.signal(signal.SIGTERM, stop)
    if not provision_key.exists():
        private_file(provision_key, secrets.token_urlsafe(48))
    secret = provision_key.read_text().strip()
    subprocess.run([binaries / "lab", "-operation", "migrate"], env=base, timeout=45, check=True)
    api_env = {
        **base,
        "FINANCEAI_ADDRESS": f"127.0.0.1:{API_PORT}",
        "FINANCEAI_PROVISIONING_SECRET_FILE": str(provision_key),
        "FINANCEAI_ALLOWED_ORIGINS": ",".join(ORIGINS.values()),
    }
    children = []
    with ExitStack() as cleanup:
        def stop_children():
            for process in children:
                if process.poll() is None:
                    process.terminate()
            for process in children:
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        cleanup.callback(stop_children)
        children.append(subprocess.Popen([binaries / "api"], env=api_env))
        for _ in range(40):
            try:
                if call("/health")["status"] == "ok":
                    break
            except (OSError, RuntimeError):
                time.sleep(0.4)
        else:
            raise RuntimeError("FinanceAI API unavailable")
        if not (state / "bindings.json").exists():
            provision(secret, state / "bindings.json")
        roles = ("worker", "transactions-worker", "finance-worker", "classification-worker",
                 "reports-worker", "finance-execution-worker")
        for role in roles:
            children.append(subprocess.Popen([binaries / role], env=base))
        prepare_maia(secret, ["-h", "127.0.0.1", "-p", "55496", "-U", "financeai_arkom"],
                     state=state, pg=Path("/usr/bin"), database=database,
                     env={**base, "PGPASSWORD": password})
        web = server(root / "web")
        cleanup.callback(web.server_close)
        thread = threading.Thread(target=web.serve_forever, daemon=True)
        thread.start()
        cleanup.callback(web.shutdown)
        print("FinanceAI homologation ready", flush=True)
        while thread.is_alive() and all(process.poll() is None for process in children):
            time.sleep(1)
        raise RuntimeError("FinanceAI process exited")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
