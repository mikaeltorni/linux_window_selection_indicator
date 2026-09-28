# Linux Window Selection Indicator

A small GNOME Shell extension that draws a 4px teal outline at 60% opacity
around the focused application window. It follows focus, moves, resizes, and
workspace changes on every normal window, including terminals, browsers, and
editors.
The extension does not inspect agent processes, statuses, or terminal classes.

The optional `ptr` component draws a thin teal line from the cursor hotspot
toward the nearest edge of the focused window, only on the active workspace. It disappears
when the cursor enters the window, focus is absent, or the overview is open.
The line shortens proportionally as the cursor approaches the nearest window
edge. Its length is the configured maximum (100px by default) multiplied by
its current distance divided by the farthest possible distance from this window
across every connected monitor. Half that distance gives half the line length;
the farthest reachable monitor pixel gives the full length. Monitor positions,
resolutions, and window moves/resizes are included automatically; empty gaps in
staggered monitor layouts do not count. The line never intercepts clicks.

The pointer uses the original direct tracking behavior without motion prediction
or smoothing. High-priority polling targets 144 samples per second (about 6.94ms)
with monotonic deadlines and 6/7ms timer delays, preventing cumulative rounding
drift. A delayed callback resumes normally instead of issuing a catch-up burst.
The tracker also samples in Clutter's pre-paint callback. Visible updates still
depend on compositor/display timing: a 120Hz monitor cannot display 144 frames
per second just because the tracker targets 144Hz. The installer preserves
display settings. Window/monitor geometry is
cached until it changes; a reusable thin line texture moves, rotates and scales
on the GPU without repainting or resizing its drawing surface on every motion.
Stationary samples skip geometry and drawing updates, and disabling `ptr`
removes both tracking callbacks.

## Install

Run `bash install.sh` from this checkout for the component menu (or defaults
without a terminal). The outline is default-on; the cursor vector is default-off.
Use `bash install.sh --select outline,ptr` to install both. Use
`bash install.sh --uninstall ptr` to disable only the vector. `--default`, `--all`,
`--list-components`, `--detect`, and `--reconfigure ptr` use the shared framework.

The installer copies the extension to the desktop user's `~/.local/share/gnome-shell/extensions` and enables it.
On X11, new extension code requires GNOME Shell's in-place Alt+F2 `r` reload;
on Wayland, sign out and back in after installation. No extra Python packages
or root access are required.

Set `LWSI_PTR=on` or `LWSI_PTR=off` when running the installer to explicitly
persist pointer enablement, for example `LWSI_PTR=off bash install.sh --default`.
The override takes precedence over selecting `ptr`; omitting it preserves your
current setting unless you explicitly install or uninstall `ptr`. GNOME Shell
reads the saved setting live, so an export in a terminal alone has no effect.

Configure the maximum length in the installer menu's `ptr` settings, or use
`bash install.sh --select outline,ptr --ptr-length 95`. `LWSI_PTR_LENGTH=95`
provides the same setting through the environment; the CLI option takes
precedence. The accepted range is 1–1000 logical pixels. Length changes apply
live and preserve the pointer's on/off setting. `--configure-component ptr`
opens the same length prompt, including before the first install.

## Live pointer controls

The installer adds `lwsi` to `~/.local/bin`. It controls just the pointer:

```sh
lwsi ptr 95      # maximum 95px and enable
lwsi ptr off     # hide the vector, keeping its length and the outline
lwsi ptr on      # enable at the saved length
lwsi ptr status  # print e.g. "ptr on 95px"
lwsi ptr         # same status; plain "lwsi" also shows status
lwsi --help
```

These commands apply immediately through the same saved settings as the
installer. `on` and `off` preserve the maximum length. Invalid lengths or extra
arguments fail without changing settings. If `~/.local/bin` is absent from your
shell's PATH, use `~/.local/bin/lwsi` directly.

Agent Command Center can install this component from a sibling checkout. It
continues to decide agent lifecycle colors and renders those in its own Kitty
outlines; this repository owns only the focused-window indication.

The indicator reads GNOME Shell's focused window directly. It does not read or
publish Phrase Automation notes, ACC status snapshots, prompts, or agent state,
so the teal focus indicator never appears as content in the Phrase Automation
note display. When an ACC terminal is focused, its ACC status outline and this
focus indicator are independent layers.

The focused-window outline is stacked immediately above the window in GNOME's
window group. Always on top application popups, including Phrase Automation's
notes overlay, and GNOME Shell chrome remain above it.

## Verification

From the project checkout, run:

```sh
node tests/test_pointer.cjs
bash tests/test_installer.sh
bash tests/test_extension_contract.sh
```

The pointer tests use a mocked Shell; installer tests use a temporary home and
an isolated settings backend. They cover workspace/focus visibility, shrinking
and length limits, live enablement, installer selection, configuration before
the first install, invalid input, and the installed command and copy lists.
They do not open windows or reload your desktop. Node is only needed for tests.

## Disclaimer

This software is provided under the MIT License on an **“as is”** basis, without warranties of any kind. To the maximum extent permitted by applicable law, the authors and copyright holders shall not be liable for any claims, damages, losses, or other liability arising from the use of this software.

You are solely responsible for determining whether this software is suitable, safe, lawful, and appropriate for your intended use. Unless explicitly stated otherwise, this project is general-purpose software and is not designed, tested, certified, or approved for safety-critical, medical, automotive, aviation, industrial-control, life-support, cybersecurity-critical, financial-critical, or other high-risk use cases.

The authors and copyright holders make no guarantees regarding security, reliability, availability, correctness, compliance, non-infringement, or fitness for any particular purpose.

This notice is intended to clarify the nature of the project and does not impose additional restrictions beyond the MIT License.
