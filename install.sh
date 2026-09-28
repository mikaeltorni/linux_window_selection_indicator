#!/usr/bin/env bash
# Install the teal outline plus the opt-in cursor vector, sudo-free by default.
# Usage: bash install.sh [--default|--all|--select outline,ptr|--detect|--uninstall ptr]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/logging.sh"

# Use the same framework resolver as sibling installers; fetch only the loader
# for a standalone checkout, which then resolves/downloads its own dependencies.
for framework in "${ISC_FUNCTIONS_DIR:-}" \
    "$SCRIPT_DIR/../linux_installation_scripts_functions" \
    "${HOME}/projects/linux_installation_scripts_functions"; do
    if [[ -n "$framework" && -f "$framework/component_loader.sh" ]]; then
        source "$framework/component_loader.sh"
        break
    fi
done
if ! declare -F isc_activate_components >/dev/null; then
    framework="${XDG_CACHE_HOME:-$HOME/.cache}/installation_scripts/components"
    mkdir -p "$framework"
    curl -fsSL "https://raw.githubusercontent.com/mikaeltorni/linux_installation_scripts_functions/${ISC_FUNCTIONS_REF:-master}/component_loader.sh" \
        -o "$framework/component_loader.sh"
    source "$framework/component_loader.sh"
fi
isc_load_helpers
isc_activate_components
# Keep installer status on stderr through the project's centralized helper.
msg() { wsi_log INFO "$*"; }
source "$SCRIPT_DIR/lib/installer.sh"
source "$SCRIPT_DIR/installer/components.sh"
wsi_resolve_target
component_main "$@"
