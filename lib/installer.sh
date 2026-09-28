#!/usr/bin/env bash
# User-level extension deployment and optional pointer component actions.
# Uses the framework's run_as_target and this project's shared stderr logger.

# Populate the desktop session environment before any user-owned writes.
wsi_resolve_target() {
    TARGET_USER="${SUDO_USER:-${TARGET_USER:-$USER}}"
    TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
    if [[ -z "$TARGET_HOME" || "$TARGET_USER" == root ]]; then
        wsi_log ERROR 'desktop user could not be resolved'
        return 1
    fi
    RUNTIME_DIR="/run/user/$(id -u "$TARGET_USER")"
    USER_BUS="unix:path=$RUNTIME_DIR/bus"
    DISPLAY_VAL="${DISPLAY:-:0}"
    WSI_TARGET_DIR="$TARGET_HOME/.local/share/gnome-shell/extensions/window-selection-indicator@local"
    WSI_SCHEMA="org.gnome.shell.extensions.window-selection-indicator"
}

# Copy every runtime module and compile the schema; preserve other extensions.
wsi_install() {
    wsi_log INFO "installing extension into $WSI_TARGET_DIR"
    local file enabled updated uuid="window-selection-indicator@local"
    for file in extension.js geometry.js logging.js metadata.json; do
        run_as_target install -D -m 0644 "$SCRIPT_DIR/$uuid/$file" "$WSI_TARGET_DIR/$file" || return 1
    done
    run_as_target install -D -m 0644 "$SCRIPT_DIR/$uuid/schemas/$WSI_SCHEMA.gschema.xml" "$WSI_TARGET_DIR/schemas/$WSI_SCHEMA.gschema.xml" || return 1
    run_as_target glib-compile-schemas --strict "$WSI_TARGET_DIR/schemas" || return 1
    enabled="$(run_as_target gsettings get org.gnome.shell enabled-extensions)" || return 1
    if [[ "$enabled" != *"'$uuid'"* ]]; then
        updated="$(python3 - "$enabled" "$uuid" <<'PY'
import ast
import json
import sys

extensions = ast.literal_eval(sys.argv[1].removeprefix('@as '))
extensions.append(sys.argv[2])
print(json.dumps(extensions))
PY
)" || return 1
        run_as_target gsettings set org.gnome.shell enabled-extensions "$updated" || return 1
    fi
    if [[ -n "${LWSI_PTR:-}" ]]; then
        wsi_set_pointer_enabled "$LWSI_PTR" || return 1
    fi
    wsi_log INFO "installed $uuid"
}

# Install and opt in without changing the focused-window outline.
wsi_install_pointer() {
    wsi_install || return 1
    wsi_set_pointer_enabled "${LWSI_PTR:-on}"
}

# Disable just the optional vector; settings apply live after code activation.
wsi_disable_pointer() {
    [[ -f "$WSI_TARGET_DIR/schemas/gschemas.compiled" ]] || return 0
    wsi_set_pointer_enabled off
}

# Side-effect-free probes for the master's detection contract.
wsi_detect_outline() { [[ -f "$WSI_TARGET_DIR/extension.js" ]]; }
wsi_detect_pointer() {
    [[ -f "$WSI_TARGET_DIR/schemas/gschemas.compiled" ]] || return 1
    [[ "$(run_as_target env GSETTINGS_SCHEMA_DIR="$WSI_TARGET_DIR/schemas" gsettings get "$WSI_SCHEMA" pointer-enabled)" == true ]]
}

# Explicit outline uninstall disables the extension and leaves its files intact.
wsi_uninstall_outline() {
    run_as_target gnome-extensions disable window-selection-indicator@local || return 1
    wsi_log INFO 'extension disabled'
}
