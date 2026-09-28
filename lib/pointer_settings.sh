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
    wsi_pointer_gsettings set pointer-enabled "$enabled" || return 1
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
    wsi_pointer_gsettings set pointer-max-length "$length" || return 1
    wsi_log INFO "cursor vector maximum length ${length}px"
}

# Shared settings boundary: installer runs as the desktop target; the installed
# CLI already runs in the user's session. Parameters: operation, key, [value].
wsi_pointer_gsettings() {
    local operation="$1"; shift
    local -a command=(env GSETTINGS_SCHEMA_DIR="${WSI_SETTINGS_DIR:-$WSI_TARGET_DIR/schemas}" \
        gsettings "$operation" "$WSI_SCHEMA" "$@")
    if declare -F run_as_target >/dev/null; then
        run_as_target "${command[@]}"
    else
        "${command[@]}"
    fi
}

# Public status output stays on stdout; logs and validation errors use stderr.
wsi_pointer_status() {
    local enabled length state=off
    enabled="$(wsi_pointer_gsettings get pointer-enabled)" || return 1
    length="$(wsi_pointer_gsettings get pointer-max-length)" || return 1
    [[ "$enabled" == true ]] && state=on
    printf 'ptr %s %spx\n' "$state" "$length"
}

# Dispatch lwsi's pointer command through the same setters as the installer.
# A numeric length also enables the pointer; on/off retain the previous length.
wsi_pointer_command() {
    if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
        printf 'Usage: lwsi ptr [on|off|status|N]\nN: maximum length in pixels (1–1000); a number also enables the pointer.\n'
        return 0
    fi
    if (( $# > 2 )) || [[ $# -gt 0 && "$1" != ptr ]]; then
        wsi_log ERROR 'usage: lwsi ptr [on|off|status|N]'
        return 2
    fi
    local action="${2:-status}"
    case "$action" in
        on|off|status) ;;
        *) wsi_validate_pointer_length "$action" || return $? ;;
    esac
    if [[ ! -f "$WSI_TARGET_DIR/schemas/gschemas.compiled" ]]; then
        wsi_log ERROR 'indicator is not installed; run bash install.sh --select outline,ptr'
        return 1
    fi
    case "$action" in
        on|off) wsi_set_pointer_enabled "$action" || return 1 ;;
        status) ;;
        *)
            wsi_set_pointer_length "$action" || return 1
            wsi_set_pointer_enabled on || return 1 ;;
    esac
    wsi_pointer_status
}
