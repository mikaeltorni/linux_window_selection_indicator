# Drag target regression coverage

Run `node tests/test_pointer.cjs` from the project root. The existing harness
loads the actual extension and calls its public enable/settings/disable paths
with fresh Shell state; it opens no windows and changes no live settings.

GNOME DND uses `Clutter.PickMode.ALL`, which includes nonreactive actors.
The original defect is an enabled cursor vector covering a taskbar app icon:
the app can start dragging, but the vector hides the destination from picking.

| Case | Public setup and observation | Saved assertion |
| --- | --- | --- |
| Enabled vector over a taskbar target | Enable the actual extension; pick all visible actors at the cursor hotspot | `drag picking reaches the taskbar through the vector` returns the underlying target. |
| Outline over an application | Enable the actual extension; pick at the focused window centre | `drag picking reaches the window through the outline` returns the underlying window. |
| Vector toggled back on | Existing off/on settings sequence | Both actors remain excluded from all-actor picking; visibility/tracking assertions are retained. |
| Retained behavior | Existing focus/workspace, geometry, timing, length and disable sequences | Existing assertions in test_pointer.cjs are unchanged. |

No new parser or command is introduced. Existing installer and pointer-command
validation is exercised by `bash tests/test_installer.sh`; source copy lists
and clean-install presets remain covered by the existing installer checks.
