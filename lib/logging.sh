#!/usr/bin/env bash
# Shared stderr logger for the installer; stdout remains machine-readable.
wsi_log() {
    printf 'Window Selection Indicator [%s]: %s\n' "$1" "$2" >&2
}
