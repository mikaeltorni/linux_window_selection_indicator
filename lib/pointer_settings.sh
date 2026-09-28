#!/usr/bin/env bash
# Shared validation and GSettings writes for installer pointer overrides.

# Validate environment overrides before any deployment or configuration writes.
wsi_validate_pointer_env() {
    case "${LWSI_PTR:-}" in
        ''|on|off) ;;
        *) wsi_log ERROR 'LWSI_PTR must be on or off'; return 2 ;;
    esac
    if [[ -n "${LWSI_PTR_LENGTH:-}" ]]; then
        wsi_validate_pointer_length "$LWSI_PTR_LENGTH" || return $?
    fi
}

# Persist on/off in the installed schema so the running Shell sees it live.
# Parameters: $1 = on or off (validated by the caller).
wsi_set_pointer_enabled() {
    local enabled=false
    [[ "$1" == on ]] && enabled=true
    run_as_target env GSETTINGS_SCHEMA_DIR="${WSI_SETTINGS_DIR:-$WSI_TARGET_DIR/schemas}" \
        gsettings set "$WSI_SCHEMA" pointer-enabled "$enabled" || return 1
    wsi_log INFO "cursor vector $1"
}

# Accept a bounded integer, including leading zeros, without arithmetic overflow.
wsi_validate_pointer_length() {
    if [[ ! "$1" =~ ^[0-9]{1,4}$ ]] || (( 10#$1 < 1 || 10#$1 > 1000 )); then
        wsi_log ERROR 'pointer length must be an integer from 1 to 1000 pixels'
        return 2
    fi
}

# Persist the maximum logical-pixel length without changing enablement.
wsi_set_pointer_length() {
    wsi_validate_pointer_length "$1" || return $?
    local length=$((10#$1))
    run_as_target env GSETTINGS_SCHEMA_DIR="${WSI_SETTINGS_DIR:-$WSI_TARGET_DIR/schemas}" \
        gsettings set "$WSI_SCHEMA" pointer-max-length "$length" || return 1
    wsi_log INFO "cursor vector maximum length ${length}px"
}
