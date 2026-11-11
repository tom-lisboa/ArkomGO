"""Preserve explicit identity adoption across application-only updates."""
import re
from pathlib import Path


def preserve_directory_settings(previous: Path, target: Path) -> None:
    values = {}
    for line in previous.read_text().splitlines():
        key, separator, value = line.partition("=")
        if separator and key in ("CLIPS_DIRECTORY_ENABLED", "CLIPS_DIRECTORY_BACKEND", "CLIPS_REMIX_ENABLED", "CLIPS_REMIX_BACKEND"):
            if key in values:
                raise ValueError("duplicate directory activation setting")
            values[key] = value
    for family in ("DIRECTORY", "REMIX"):
        enabled_key, backend_key = f"CLIPS_{family}_ENABLED", f"CLIPS_{family}_BACKEND"
        if values.get(enabled_key, "0") not in ("0", "1"):
            raise ValueError("invalid identity activation setting")
        backend = values.get(backend_key, "")
        if backend and (values.get(enabled_key) != "1" or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}", backend)):
            raise ValueError("invalid identity backend setting")
    if values:
        existing = target.read_text()
        if any(line.partition("=")[0] in values for line in existing.splitlines()):
            raise ValueError("candidate overrides the existing identity adoption")
        target.write_text(existing.rstrip("\n") + "\n" + "".join(f"{key}={value}\n" for key, value in sorted(values.items())))
