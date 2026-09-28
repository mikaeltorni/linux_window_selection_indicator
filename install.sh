#!/usr/bin/env bash
# Install the state-independent GNOME Shell focus indicator for the desktop user.
set -euo pipefail

source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$source_dir/lib/logging.sh"
target_user="${SUDO_USER:-$USER}"
target_home="$(getent passwd "$target_user" | cut -d: -f6)"
uuid="window-selection-indicator@local"

if [[ -z "$target_home" || "$target_user" == root ]]; then
    wsi_log ERROR 'desktop user could not be resolved'
    exit 1
fi

run_as_target() {
    if [[ "$(id -u)" -eq 0 ]]; then
        sudo -H -u "$target_user" env HOME="$target_home" \
            DISPLAY="${DISPLAY:-:0}" \
            DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u "$target_user")/bus" "$@"
    else
        "$@"
    fi
}

target_dir="$target_home/.local/share/gnome-shell/extensions/$uuid"
wsi_log INFO "installing extension into $target_dir"
for file in extension.js geometry.js logging.js; do
    run_as_target install -D -m 0644 "$source_dir/$uuid/$file" "$target_dir/$file"
done
run_as_target install -D -m 0644 "$source_dir/$uuid/metadata.json" "$target_dir/metadata.json"
# The running Shell may not discover a newly copied extension until its next
# X11 in-place reload or Wayland login. Persist the enablement now so that
# first discovery activates it without a second installer run.
enabled="$(run_as_target gsettings get org.gnome.shell enabled-extensions)"
if [[ "$enabled" != *"'$uuid'"* ]]; then
    updated="$(python3 - "$enabled" "$uuid" <<'PY'
import ast
import json
import sys

extensions = ast.literal_eval(sys.argv[1].removeprefix('@as '))
extensions.append(sys.argv[2])
print(json.dumps(extensions))
PY
)"
    run_as_target gsettings set org.gnome.shell enabled-extensions "$updated"
fi
wsi_log INFO "installed $uuid"
