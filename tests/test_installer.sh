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
export ISC_FUNCTIONS_DIR="${ISC_FUNCTIONS_DIR:-$HOME/projects/linux_installation_scripts_functions}"
export WSI_TEST_HOME="$sandbox/home" HOME="$sandbox/home" PATH="$sandbox/bin:$PATH"
export GSETTINGS_BACKEND=keyfile XDG_CONFIG_HOME="$sandbox/config"
export XDG_CACHE_HOME="$sandbox/cache"
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
LWSI_PTR=on bash "$root/install.sh" --default >/dev/null
[[ "$(gsettings get org.gnome.shell.extensions.window-selection-indicator pointer-enabled)" == true ]]
LWSI_PTR=off bash "$root/install.sh" --all >/dev/null
[[ "$(gsettings get org.gnome.shell.extensions.window-selection-indicator pointer-enabled)" == false ]]
if LWSI_PTR='not on' WSI_TEST_HOME="$sandbox/invalid" bash "$root/install.sh" --default >/dev/null 2>&1; then
    printf 'invalid pointer environment was accepted\n' >&2
    exit 1
fi
[[ ! -e "$sandbox/invalid" ]]
LWSI_PTR_LENGTH=95 bash "$root/install.sh" --select ptr >/dev/null
[[ "$(gsettings get org.gnome.shell.extensions.window-selection-indicator pointer-max-length)" == 95 ]]
bash "$root/install.sh" --ptr-length 75 --default >/dev/null
[[ "$(gsettings get org.gnome.shell.extensions.window-selection-indicator pointer-max-length)" == 75 ]]
for invalid in 0 -1 1001 '95 px' 1.5 99999999999999999999999999; do
    if LWSI_PTR_LENGTH="$invalid" bash "$root/install.sh" --default >/dev/null 2>&1; then
        printf 'invalid length was accepted: %s\n' "$invalid" >&2
        exit 1
    fi
done
[[ "$(gsettings get org.gnome.shell.extensions.window-selection-indicator pointer-max-length)" == 75 ]]
printf '85\n' | bash "$root/install.sh" --configure-component ptr >/dev/null
[[ "$(gsettings get org.gnome.shell.extensions.window-selection-indicator pointer-max-length)" == 85 ]]
[[ "$(bash "$root/install.sh" --list-configurable-components)" == ptr ]]

for args in '--ptr-length=' '--ptr-length'; do
    if bash "$root/install.sh" "$args" >/dev/null 2>&1; then exit 1; fi
done
LWSI_PTR_LENGTH=90 bash "$root/install.sh" --default --ptr-length=0095 >/dev/null
[[ "$(gsettings get org.gnome.shell.extensions.window-selection-indicator pointer-max-length)" == 95 ]]
# Configure before installation: no extension files are deployed by the prompt.
printf '65\n' | env WSI_TEST_HOME="$sandbox/fresh" XDG_CONFIG_HOME="$sandbox/fresh-config" \
    XDG_CACHE_HOME="$sandbox/fresh-cache" bash "$root/install.sh" --configure-component ptr >/dev/null
[[ ! -d "$sandbox/fresh/.local/share/gnome-shell/extensions" ]]
env WSI_TEST_HOME="$sandbox/fresh" XDG_CONFIG_HOME="$sandbox/fresh-config" \
    XDG_CACHE_HOME="$sandbox/fresh-cache" bash "$root/install.sh" --select outline,ptr >/dev/null
[[ "$(env XDG_CONFIG_HOME="$sandbox/fresh-config" \
    GSETTINGS_SCHEMA_DIR="$sandbox/fresh/.local/share/gnome-shell/extensions/window-selection-indicator@local/schemas" \
    gsettings get org.gnome.shell.extensions.window-selection-indicator pointer-max-length)" == 65 ]]
