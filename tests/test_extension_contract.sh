#!/usr/bin/env bash
# Verify the focus outline stays in the application-window stack.
set -euo pipefail

source_file="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/window-selection-indicator@local/extension.js"

grep -Fq 'global.window_group.add_child(this._outline)' "$source_file"
grep -Fq 'global.window_group.set_child_above_sibling(this._outline, windowActor)' "$source_file"
if grep -Fq 'Main.uiGroup.add_child(this._outline)' "$source_file"; then
    printf 'focus outline must not use the Shell chrome layer\n' >&2
    exit 1
fi
