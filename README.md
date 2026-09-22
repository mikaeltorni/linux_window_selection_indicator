# Linux Window Selection Indicator

A small GNOME Shell extension that draws a white, translucent outline around
the focused application window. It follows focus, moves, resizes, and workspace
changes on every normal window, including terminals, browsers, and editors.
The extension does not inspect agent processes, statuses, or terminal classes.

## Install

Run `bash install.sh` from this checkout. The installer copies the extension to
the desktop user's `~/.local/share/gnome-shell/extensions` and enables it.
On X11, new extension code requires GNOME Shell's in-place Alt+F2 `r` reload;
on Wayland, sign out and back in after installation. No extra Python packages
or root access are required.

Agent Command Center can install this component from a sibling checkout. It
continues to decide agent lifecycle colors and renders those in its own Kitty
outlines; this repository owns only the focused-window indication.

The indicator reads GNOME Shell's focused window directly. It does not read or
publish Phrase Automation notes, ACC status snapshots, prompts, or agent state,
so the white selector never appears as content in the Phrase Automation note
display. When an ACC terminal is focused, its ACC status outline and this focus
indicator are independent layers.

The indicator is stacked immediately above the focused window in GNOME's
window group. Always on top application popups, including Phrase Automation's
notes overlay, and GNOME Shell chrome remain above it.

## Disclaimer

This software is provided under the MIT License on an **“as is”** basis, without warranties of any kind. To the maximum extent permitted by applicable law, the authors and copyright holders shall not be liable for any claims, damages, losses, or other liability arising from the use of this software.

You are solely responsible for determining whether this software is suitable, safe, lawful, and appropriate for your intended use. Unless explicitly stated otherwise, this project is general-purpose software and is not designed, tested, certified, or approved for safety-critical, medical, automotive, aviation, industrial-control, life-support, cybersecurity-critical, financial-critical, or other high-risk use cases.

The authors and copyright holders make no guarantees regarding security, reliability, availability, correctness, compliance, non-infringement, or fitness for any particular purpose.

This notice is intended to clarify the nature of the project and does not impose additional restrictions beyond the MIT License.
