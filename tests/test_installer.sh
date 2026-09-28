#!/usr/bin/env bash
# Run installation in an isolated home with an in-memory settings backend.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sandbox="$(mktemp -d "$root/.test-install.XXXXXX")"
trap 'rm -rf "$sandbox"' EXIT
mkdir -p "$sandbox/bin" "$sandbox/home"
cat > "$sandbox/bin/getent" <<'SH'
#!/usr/bin/env bash
printf '%s:x:%s:%s::%s:/bin/bash\n' "$USER" "$(id -u)" "$(id -g)" "$WSI_TEST_HOME"
SH
chmod +x "$sandbox/bin/getent"
export WSI_TEST_HOME="$sandbox/home" HOME="$sandbox/home" PATH="$sandbox/bin:$PATH"
export GSETTINGS_BACKEND=keyfile XDG_CONFIG_HOME="$sandbox/config"
export ISC_FUNCTIONS_DIR="${ISC_FUNCTIONS_DIR:-/home/mk/projects/linux_installation_scripts_functions}"
export XDG_STATE_HOME="$sandbox/state" ISC_LOG_DIR="$sandbox/log"
listing="$(bash "$root/install.sh" --list-components)"
[[ "$listing" == *$'ptr\tCursor vector toward the focused window\toff'* ]]
[[ ! -d "$HOME/.local/share/gnome-shell/extensions" ]]
bash "$root/install.sh" --default >/dev/null
export GSETTINGS_SCHEMA_DIR="$HOME/.local/share/gnome-shell/extensions/window-selection-indicator@local/schemas"
[[ "$(gsettings get org.gnome.shell.extensions.window-selection-indicator pointer-enabled)" == false ]]
bash "$root/install.sh" --select outline,ptr >/dev/null
[[ "$(gsettings get org.gnome.shell.extensions.window-selection-indicator pointer-enabled)" == true ]]
bash "$root/install.sh" --default >/dev/null
[[ "$(gsettings get org.gnome.shell.extensions.window-selection-indicator pointer-enabled)" == true ]]
bash "$root/install.sh" --uninstall ptr >/dev/null
for file in extension.js geometry.js logging.js metadata.json; do
    cmp "$root/window-selection-indicator@local/$file" \
        "$HOME/.local/share/gnome-shell/extensions/window-selection-indicator@local/$file"
done

export GSETTINGS_SCHEMA_DIR="$HOME/.local/share/gnome-shell/extensions/window-selection-indicator@local/schemas"
[[ "$(gsettings get org.gnome.shell.extensions.window-selection-indicator pointer-enabled)" == false ]]
glib-compile-schemas --strict --dry-run "$root/window-selection-indicator@local/schemas"
