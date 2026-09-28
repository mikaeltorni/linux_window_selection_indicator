#!/usr/bin/env bash
# Shared validation and GSettings writes for installer pointer overrides.

# Validate environment overrides before any deployment or configuration writes.
wsi_validate_pointer_env() {
    case "${LWSI_PTR:-}" in
        ''|on|off) ;;
        *) wsi_log ERROR 'LWSI_PTR must be on or off'; return 2 ;;
    esac
}

# Persist on/off in the installed schema so the running Shell sees it live.
# Parameters: $1 = on or off (validated by the caller).
wsi_set_pointer_enabled() {
    local enabled=false
    [[ "$1" == on ]] && enabled=true
    run_as_target env GSETTINGS_SCHEMA_DIR="$WSI_TARGET_DIR/schemas" \
        gsettings set "$WSI_SCHEMA" pointer-enabled "$enabled" || return 1
    wsi_log INFO "cursor vector $1"
}
