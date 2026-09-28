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
export GSETTINGS_BACKEND=memory
bash "$root/install.sh" >/dev/null
for file in extension.js geometry.js logging.js metadata.json; do
    cmp "$root/window-selection-indicator@local/$file" \
        "$HOME/.local/share/gnome-shell/extensions/window-selection-indicator@local/$file"
done
