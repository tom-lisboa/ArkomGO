"""Verify shared identity and the isolated product adapters without deploying."""
import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[2]
finance = root.parent / "financeai-core"
sdr = root.parent / "sdr-next-pilot"
evidence = root / ".local/platform-directory"
evidence.mkdir(parents=True, exist_ok=True)
# Explicit toolchain keeps coverage subprocesses on the same Go installation.
toolchain = Path(subprocess.check_output(["go", "env", "GOROOT"], cwd=root, text=True).strip())
env = {k: v for k, v in os.environ.items() if not k.startswith(("FINANCEAI_", "SDR_", "CLIPS_", "OPENAI_", "SUPABASE_"))}
env.update(PATH=str(toolchain / "bin") + os.pathsep + os.environ["PATH"], GOTOOLCHAIN="local")
steps = [
    ("client", root, ["go", "test", "-race", "./pkg/platformaccess"]),
    ("directory-and-clips", root, ["python3", "pilots/clips/verify-identity-local.py"]),
    ("finance", finance, ["python3", "scripts/test_lab.py"]),
    ("bia-sdr", sdr, ["go", "test", "-race", "./..."]),
    ("root-vet", root, ["go", "vet", "./internal/platformdirectory", "./internal/solutionbus", "./pkg/platformaccess", "./pilots/clips"]),
    ("finance-vet", finance, ["go", "vet", "./..."]),
    ("sdr-vet", sdr, ["go", "vet", "./..."]),
    ("client-copies", root, ["python3", "pilots/clips/sync-platform-access.py", "--check"]),
]
results = []
for name, cwd, command in steps:
    with (evidence / (name + ".log")).open("w") as output:
        result = subprocess.run(command, cwd=cwd, env=env, stdout=output, stderr=subprocess.STDOUT)
    results.append({"step": name, "passed": result.returncode == 0})
    print(name + (": passed" if result.returncode == 0 else ": FAILED"), flush=True)
    if result.returncode != 0:
        print((evidence / (name + ".log")).read_text()[-4000:])
        raise SystemExit(result.returncode)
sources = list((root / "internal/platformdirectory").glob("*")) + list((root / "pkg/platformaccess").glob("*.go"))
hashes = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources if p.is_file()}
(evidence / "validation.json").write_text(json.dumps({
    "verified_at": datetime.now(timezone.utc).isoformat(), "status": "validated_locally",
    "server_changed": False, "production_changed": False, "steps": results, "source_sha256": hashes,
}, indent=2) + "\n")
print("Local directory and product adapters validated; nothing deployed.")
