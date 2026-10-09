# Linux Window Selection Indicator

A small GNOME Shell extension that draws a 4px teal outline at 60% opacity
around the focused application window. It follows focus, moves, resizes, and
workspace changes on every normal window, including terminals, browsers, and
editors.
The extension does not inspect agent processes, statuses, or terminal classes.

The optional `ptr` component draws a 4px teal line from the cursor hotspot
toward the nearest edge of the focused window, only on the active workspace. It disappears
when the cursor enters the window, focus is absent, or the overview is open.
The line shortens smoothly as the cursor approaches the nearest window edge.
Its length is the lesser of the actual window distance and the configured maximum
(100px by default) multiplied by the square root of the current distance divided
by the farthest possible distance from this window across every connected monitor.
This curve keeps the stroke visible past the cursor graphic during an approach;
a strictly linear scale made the line disappear under the cursor well before it
reached the window. The farthest reachable monitor pixel gives the full configured
length, and the line reaches zero at the window edge. Monitor positions,
resolutions, and window moves/resizes are included automatically; empty gaps in
staggered monitor layouts do not count. Neither indicator intercepts clicks or
drag targets. Both actors are explicitly excluded from Shell actor picking:
GNOME drag and drop uses `Clutter.PickMode.ALL`, which also includes actors
marked `reactive: false`. Without that exclusion, the cursor vector could hide
taskbar favourites from drop detection and prevent reordering.

The pointer uses the original direct tracking behavior without motion prediction
or smoothing. Polling targets 1000 probes per second with 1ms timer delays
and monotonic deadlines. This is a best-effort target: other Shell work can
delay [GLib timer dispatch](https://docs.gtk.org/glib/func.timeout_add.html).
A delayed callback resumes normally instead of issuing a catch-up burst.
Polling runs at normal priority so it yields to input processing. A cursor move
queues a normal compositor redraw; while that frame is pending, redundant polls
are skipped. The pre-paint callback positions a bounded paint region, then the
vector's own `Clutter.Content` callback samples the actual cursor again when its
paint nodes are built, after layout and frame preparation. This removes the
extra stale-input interval between the global pre-paint sample and drawing the
line. It leaves the hardware cursor unchanged and uses no prediction or smoothing.

The region includes a 64px margin for input arriving during frame preparation.
A sudden warp beyond that margin omits the stroke for the current frame; the
next tracking tick moves the region and redraws it safely. The line is never
painted outside the area the compositor has reserved for this frame. A single
1×6 texture supplies the four-pixel stroke, with one transparent row on each
side. GPU paint nodes place and rotate it without Cairo repainting or per-motion allocation changes. The region resizes
only when the configured maximum length changes. Window/monitor geometry stays
cached until it changes. Stationary input does not force redraws; disabling
`ptr` removes both tracking callbacks.

Visible updates still depend on compositor/display timing: a 120Hz monitor
cannot display 1000 frames per second just because the tracker targets 1000Hz.
The installer preserves display settings. The hardware cursor can still update
between compositor presentations, so zero separation at every instant is not
promised. The paint-time sampling follows GNOME's
[content rendering interface](https://raw.githubusercontent.com/GNOME/gnome-shell/gnome-46/js/ui/magnifier.js)
and the [Mutter frame sequence](https://raw.githubusercontent.com/GNOME/mutter/gnome-46/clutter/clutter/clutter-stage-view.c).

## Install

Run `bash install.sh` from this checkout for the component menu (or defaults
without a terminal). The outline is default-on; the cursor vector is default-off.
Use `bash install.sh --select outline,ptr` to install both. The master setup's
`installation_configs/default.json` preset selects the outline and leaves the pointer
vector off; `installation_configs/empty.json` selects no components. Use
`bash install.sh --uninstall ptr` to disable only the vector. `--default`, `--all`,
`--list-components`, `--detect`, and `--reconfigure ptr` use the shared framework.

The installer copies the extension to the desktop user's `~/.local/share/gnome-shell/extensions` and enables it.
On X11, new extension code requires GNOME Shell's in-place Alt+F2 `r` reload;
on Wayland, sign out and back in after installation. No extra Python packages
or root access are required.

If the cursor vector disappears while the outline is still visible, check
`lwsi ptr status`. A saved `off` setting persists across logins and ordinary
outline reinstalls; use `lwsi ptr on` to restore it at its saved maximum length.
The pointer intentionally hides when the cursor is inside the focused window,
when no eligible window is focused, and while the overview is open.

If favourite dragging is blocked by an older loaded copy, `lwsi ptr off` disables
the vector immediately while keeping the outline. Install the corrected code
and activate it with the X11 reload or the next Wayland login described above,
then use `lwsi ptr on`. The current code excludes both indicators from drag-target
picking, so the restored vector allows taskbar favourites to be reordered.

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
node tests/test_pointer_paint.cjs
bash tests/test_installer.sh
bash tests/test_extension_contract.sh
bash tests/test_installation_configs.sh
```

The pointer tests use a mocked Shell; installer tests use a temporary home and
an isolated settings backend. They cover workspace/focus visibility, shrinking
and length limits, live enablement, installer selection, configuration before
the first install, invalid input, and the installed command and copy lists.
They do not open windows or reload your desktop. Node is only needed for tests.
The pointer suite also checks drag-target transparency before and after live
pointer enablement; its cases are mapped in [drag target coverage](tests/drag_target_coverage.md).
The restoration and four-pixel paint cases are mapped in
[pointer restoration coverage](tests/restoration_coverage.md).

## Disclaimer

This software is provided under the MIT License on an **“as is”** basis, without warranties of any kind. To the maximum extent permitted by applicable law, the authors and copyright holders shall not be liable for any claims, damages, losses, or other liability arising from the use of this software.

You are solely responsible for determining whether this software is suitable, safe, lawful, and appropriate for your intended use. Unless explicitly stated otherwise, this project is general-purpose software and is not designed, tested, certified, or approved for safety-critical, medical, automotive, aviation, industrial-control, life-support, cybersecurity-critical, financial-critical, or other high-risk use cases.

The authors and copyright holders make no guarantees regarding security, reliability, availability, correctness, compliance, non-infringement, or fitness for any particular purpose.

This notice is intended to clarify the nature of the project and does not impose additional restrictions beyond the MIT License.
