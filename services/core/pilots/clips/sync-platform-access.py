"""Synchronize the small, standard-library identity client into the isolated backends."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
sources = root / "pkg/platformaccess"
targets = [root.parent / "financeai-core/internal/platformaccess", root.parent / "sdr-next-pilot/internal/platformaccess"]
files = {p.name: p.read_bytes() for p in sources.glob("*.go") if not p.name.endswith("_test.go")}
manifest = json.dumps({"source": "Arkon/pkg/platformaccess", "files": {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}}, indent=2).encode() + b"\n"
for target in targets:
    if args.check:
        for name, data in {**files, "SOURCE.json": manifest}.items():
            if not (target / name).is_file() or (target / name).read_bytes() != data:
                raise SystemExit(f"Identity client differs: {target / name}")
    else:
        target.mkdir(parents=True, exist_ok=True)
        for name, data in {**files, "SOURCE.json": manifest}.items():
            (target / name).write_bytes(data)
print("Identity client sources match both isolated backends." if args.check else "Identity client synchronized into the isolated backends.")
