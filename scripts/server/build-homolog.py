#!/usr/bin/env python3
"""Package the Linux homologation from previously compiled Flutter and BIA assets."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "scripts/whatsapp"))
from run import prepare_engine

if len(sys.argv) != 3:
    sys.exit("Uso: build-homolog.py checkout-whatsapp diretório-novo")
whatsapp = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
if out.exists() or not out.parent.is_dir():
    sys.exit("Informe um diretório novo para o pacote.")
env = {**os.environ, "GOOS": "linux", "GOARCH": "amd64", "CGO_ENABLED": "0"}

with tempfile.TemporaryDirectory(prefix=".arkomgo-release-", dir=out.parent) as staging:
    staging = Path(staging)
    bundle = staging / "bundle"
    binaries = bundle / "bin"
    binaries.mkdir(parents=True)
    for module, name, target in (
        ("services/sdr", "bia", "."),
        ("packages/deeph", "deeph", "./cmd/deeph"),
        ("services/core", "clips", "./pilots/clips"),
        ("services/crm", "crm", "./cmd/crm-worker"),
    ):
        subprocess.run(["go", "build", "-trimpath", "-o", str(binaries / name), target],
                       cwd=root / module, env=env, check=True)

    wa_state = staging / "whatsapp"
    wa_state.mkdir()
    patch = wa_state / "loopback.patch"
    text = (root / "scripts/whatsapp/loopback.patch").read_text()
    for old, new in ((18083, 18283), (18084, 18284), (8081, 13081)):
        text = text.replace(f"127.0.0.1:{old}", f"127.0.0.1:{new}")
    patch.write_text(text)
    wa_source = prepare_engine(whatsapp, wa_state, env, patch)
    for name in ("sdr-whatsapp-engine", "wa-gateway-service"):
        shutil.copy2(wa_state / name, binaries / name)
    shutil.copytree(wa_source / "migrations", bundle / "whatsapp/migrations")

    for source, name in (("apps/genesis_flutter/build/web", "flutter"),
                         ("apps/agents/bia/dist", "bia-web")):
        if not (root / source / "index.html").is_file():
            sys.exit(f"Build de frontend ausente: {source}")
        shutil.copytree(root / source, bundle / name)
    frontend = bundle / "genesis-frontend"
    frontend.mkdir()
    for name in ("compiler.mjs", "navigation.mjs", "package.json", "package-lock.json"):
        shutil.copy2(root / "packages/genesis-frontend" / name, frontend / name)
    shutil.copytree(root / "services/sdr/demo/deeph", bundle / "deeph",
                    ignore=shutil.ignore_patterns(".deeph"))
    for name in ("run-homolog.sh", "arkomgo-homolog@.service", "sandbox-docker"):
        shutil.copy2(root / "scripts/server" / name, bundle / name)
    shutil.copy2(root / "scripts/server/docker", binaries / "docker")
    bundle.rename(out)
