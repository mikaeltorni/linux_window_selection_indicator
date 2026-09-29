#!/usr/bin/env bash
# Verify standalone default and empty presets match the component manifest.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "$ROOT" <<'PY'
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
manifest = (root / "installer" / "components.sh").read_text(encoding="utf-8")
manifest_defaults = dict(
    re.findall(r'"([^"|]+)\|[^"|]*\|(on|off)\|', manifest)
)
default = json.loads(
    (root / "installation_configs" / "default.json").read_text(encoding="utf-8")
)
empty = json.loads(
    (root / "installation_configs" / "empty.json").read_text(encoding="utf-8")
)

assert default["repo"] == "linux_window_selection_indicator"
assert default["scope"] == "standalone"
assert set(default["components"]) == set(manifest_defaults)
assert {
    component_id: "on" if state["on"] else "off"
    for component_id, state in default["components"].items()
} == manifest_defaults
assert empty["repo"] == "linux_window_selection_indicator"
assert empty["scope"] == "standalone"
assert empty["components"] == {}
PY
