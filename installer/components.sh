#!/usr/bin/env bash
# Independent outline and opt-in pointer rows for standalone and master menus.
ISC_REPO_NAME="linux_window_selection_indicator"
ISC_REPO_LABEL="Teal window selection indicator"
ISC_COMPONENTS=(
    "outline|Teal focused-window outline|on|wsi_install|wsi_detect_outline|wsi_uninstall_outline"
    "ptr|Cursor vector toward the focused window|off|wsi_install_pointer|wsi_detect_pointer|wsi_disable_pointer||outline|wsi_configure_pointer|wsi_pointer_config_status"
)
