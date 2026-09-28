/** Draw a focus outline for normal windows, independent of application state. */
import St from 'gi://St';
import GLib from 'gi://GLib';
import { pointerVector } from './geometry.js';
import { wsiLog } from './logging.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const BORDER_PX = 4;
const BORDER_COLOR = 'rgba(0, 255, 230, 0.6)';

/** Return true for a visible application window eligible for the indicator. */
function isApplicationWindow(window) {
    return Boolean(window && !window.is_skip_taskbar() &&
        !window.minimized && window.get_compositor_private());
}

export default class WindowSelectionIndicator extends Extension {
    enable() {
        this._outline = new St.Widget({
            reactive: false,
            visible: false,
            style: `border: ${BORDER_PX}px solid ${BORDER_COLOR}; border-radius: 7px;`,
        });
        // Keep the indicator in the compositor's window stack. Shell chrome
        // and always-on-top application popups must remain above it.
        global.window_group.add_child(this._outline);
        this._focusWindow = null;
        this._windowSignals = [];
        this._displaySignal = global.display.connect('notify::focus-window',
            () => this._syncFocus());
        this._workspaceSignal = global.workspace_manager.connect('active-workspace-changed',
            () => this._syncFocus());
        this._overviewShowing = Main.overview.connect('showing', () => this._hide());
        this._overviewHidden = Main.overview.connect('hidden', () => this._syncFocus());
        this._pointer = new St.DrawingArea({ reactive: false, visible: false });
        this._pointer.connect('repaint', () => this._paintPointer());
        Main.uiGroup.add_child(this._pointer);
        this._pointerTimer = 0;
        this._settings = this.getSettings();
        this._settingsSignal = this._settings.connect('changed', () => this._syncPointerSettings());
        this._syncPointerSettings();
        this._syncFocus();
        wsiLog('info', 'enabled with cursor vector');
    }

    /** Detach listeners from the previous focused window. */
    _disconnectWindow() {
        if (!this._focusWindow)
            return;
        for (const signal of this._windowSignals)
            this._focusWindow.disconnect(signal);
        this._windowSignals = [];
        this._focusWindow = null;
    }

    _hide() {
        this._outline.hide();
        this._pointer.hide();
    }

    /** Follow focus without examining window titles, classes, or agent states. */
    _syncFocus() {
        const window = global.display.focus_window;
        if (window !== this._focusWindow) {
            this._disconnectWindow();
            if (isApplicationWindow(window)) {
                this._focusWindow = window;
                for (const name of ['position-changed', 'size-changed', 'workspace-changed', 'notify::minimized'])
                    this._windowSignals.push(window.connect(name, () => this._place()));
                this._windowSignals.push(window.connect('unmanaged', () => {
                    this._disconnectWindow();
                    this._hide();
                }));
                wsiLog('debug', 'focus changed');
            }
        }
        this._place();
    }

    /** Match the focused window frame while leaving pointer events untouched. */
    _place() {
        const window = this._focusWindow;
        if (!isApplicationWindow(window) || Main.overview.visible ||
            !window.located_on_workspace(global.workspace_manager.get_active_workspace())) {
            this._hide();
            return;
        }
        const frame = window.get_frame_rect();
        if (frame.width <= 0 || frame.height <= 0) {
            this._hide();
            return;
        }
        this._outline.set_position(frame.x, frame.y);
        this._outline.set_size(frame.width, frame.height);
        const windowActor = window.get_compositor_private();
        global.window_group.set_child_above_sibling(this._outline, windowActor);
        this._outline.show();
        this._updatePointer();
    }

    /** Start polling only while the optional pointer setting is enabled. */
    _syncPointerSettings() {
        this._pointerEnabled = this._settings.get_boolean('pointer-enabled');
        this._pointerMaxLength = this._settings.get_int('pointer-max-length');
        if (this._pointerTimer) {
            GLib.Source.remove(this._pointerTimer);
            this._pointerTimer = 0;
        }
        if (this._pointerEnabled) {
            this._pointerTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
                this._updatePointer();
                return GLib.SOURCE_CONTINUE;
            });
        }
        this._updatePointer();
        wsiLog('info', `cursor vector ${this._pointerEnabled ? 'enabled' : 'disabled'}, max ${this._pointerMaxLength}px`);
    }

    /** Track the pointer only for a visible focused window on this workspace. */
    _updatePointer() {
        const window = this._focusWindow;
        if (!this._pointerEnabled || !isApplicationWindow(window) || Main.overview.visible ||
            !window.located_on_workspace(global.workspace_manager.get_active_workspace())) {
            this._pointer.hide();
            return;
        }
        const frame = window.get_frame_rect();
        if (frame.width <= 0 || frame.height <= 0) {
            this._pointer.hide();
            return;
        }
        const [x, y] = global.get_pointer();
        const vector = pointerVector(frame, x, y, this._pointerMaxLength);
        if (vector.length === 0) {
            this._pointer.hide();
            return;
        }
        const key = `${x},${y},${vector.dx},${vector.dy}`;
        if (this._pointer.visible && key === this._pointerKey)
            return;
        this._pointerKey = key;
        this._vector = vector;
        const left = Math.floor(Math.min(x, x + vector.dx)) - 2;
        const top = Math.floor(Math.min(y, y + vector.dy)) - 2;
        this._pointer.set_position(left, top);
        this._pointer.set_size(Math.ceil(Math.abs(vector.dx)) + 4,
            Math.ceil(Math.abs(vector.dy)) + 4);
        this._pointer.queue_repaint();
        this._pointer.show();
    }

    /** Paint a thin teal line without a hitbox or per-frame journal output. */
    _paintPointer() {
        const cr = this._pointer.get_context();
        try {
            if (!this._vector)
                return;
            const { x, y, dx, dy } = this._vector;
            cr.setSourceRGBA(0, 1, 230 / 255, 0.6);
            cr.setLineWidth(2);
            cr.moveTo(x - this._pointer.x, y - this._pointer.y);
            cr.lineTo(x + dx - this._pointer.x, y + dy - this._pointer.y);
            cr.stroke();
        } finally {
            cr.$dispose();
        }
    }

    disable() {
        this._settings.disconnect(this._settingsSignal);
        if (this._pointerTimer)
            GLib.Source.remove(this._pointerTimer);
        this._pointerTimer = 0;
        this._pointer.destroy();
        this._settings = null;
        this._disconnectWindow();
        global.display.disconnect(this._displaySignal);
        global.workspace_manager.disconnect(this._workspaceSignal);
        Main.overview.disconnect(this._overviewShowing);
        Main.overview.disconnect(this._overviewHidden);
        this._outline.destroy();
        this._outline = null;
        wsiLog('info', 'disabled');
    }
}
