/** Draw a focus outline for normal windows, independent of application state. */
import St from 'gi://St';
import GLib from 'gi://GLib';
import { maximumPointerDistance, pointerVector, PointerMotion } from './geometry.js';
import { wsiLog } from './logging.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const BORDER_PX = 4;
const BORDER_COLOR = 'rgba(0, 255, 230, 0.6)';
const POINTER_POLL_MS = 4;
const POINTER_PADDING = 2;

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
        this._monitorSignal = Main.layoutManager.connect('monitors-changed', () => this._place());
        this._overviewShowing = Main.overview.connect('showing', () => this._hide());
        this._overviewHidden = Main.overview.connect('hidden', () => this._syncFocus());
        this._pointer = new St.DrawingArea({ reactive: false, visible: false });
        this._pointer.set_position(0, 0);
        this._pointer.connect('repaint', () => this._paintPointer());
        Main.uiGroup.add_child(this._pointer);
        this._pointerTimer = 0;
        this._pointerBeforePaint = 0;
        this._pointerMotion = new PointerMotion();
        this._settings = this.getSettings();
        this._settingsSignal = this._settings.connect('changed', () => this._syncPointerSettings());
        this._syncPointerSettings();
        this._syncFocus();
        wsiLog('info', 'enabled with cursor vector scaled across all monitors');
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
        this._pointerFrame = null;
        this._pointerLastX = NaN;
        this._pointerMotion.reset();
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
        // Window and layout signals own these values. Cursor samples should
        // only query the pointer, not repeatedly call Meta or scan monitors.
        this._pointerFrame = frame;
        this._pointerMaxDistance = maximumPointerDistance(frame, Main.layoutManager.monitors);
        this._pointerLastX = NaN;
        this._pointerMotion.reset();
        this._updatePointer();
    }

    /** Start polling only while the optional pointer setting is enabled. */
    _syncPointerSettings() {
        this._pointerEnabled = this._settings.get_boolean('pointer-enabled');
        this._pointerMaxLength = this._settings.get_int('pointer-max-length');
        // Draw one horizontal texture and transform it on the GPU as the
        // cursor moves; only a length setting change needs a Cairo repaint.
        this._pointer.set_size(this._pointerMaxLength + 2 * POINTER_PADDING,
            2 * POINTER_PADDING);
        this._pointer.set_pivot_point(POINTER_PADDING /
            (this._pointerMaxLength + 2 * POINTER_PADDING), 0.5);
        this._pointer.queue_repaint();
        this._pointerLastX = NaN;
        this._pointerMotion.reset();
        this._stopPointerTracking();
        if (this._pointerEnabled) {
            // PRE_PAINT repaint functions run before layout/frame preparation.
            // This stage signal samples later, immediately before drawing.
            this._pointerBeforePaint = global.stage.connect('before-paint',
                (_stage, view) => {
                    const rate = view.get_refresh_rate();
                    this._updatePointer(rate > 0 ? 1000000 / rate : 0);
                });
            this._pointerTimer = GLib.timeout_add(GLib.PRIORITY_HIGH, POINTER_POLL_MS, () => {
                this._updatePointer();
                return GLib.SOURCE_CONTINUE;
            });
        }
        this._updatePointer();
        wsiLog('info', `cursor vector ${this._pointerEnabled ? 'enabled' : 'disabled'}, max ${this._pointerMaxLength}px, ${POINTER_POLL_MS}ms samples with late-paint motion compensation`);
    }

    /** Release both callbacks so disabling the optional vector leaves no work. */
    _stopPointerTracking() {
        if (this._pointerBeforePaint) {
            global.stage.disconnect(this._pointerBeforePaint);
            this._pointerBeforePaint = 0;
        }
        if (this._pointerTimer) {
            GLib.Source.remove(this._pointerTimer);
            this._pointerTimer = 0;
        }
    }

    /** Sample actual input; leadUs compensates at most one presentation frame. */
    _updatePointer(leadUs = 0) {
        if (!this._pointerEnabled || !this._pointerFrame) {
            this._pointer.hide();
            return;
        }
        const [actualX, actualY] = global.get_pointer();
        const now = GLib.get_monotonic_time();
        this._pointerMotion.sample(actualX, actualY, now);
        const predicting = leadUs > 0 && this._pointerMotion.steady &&
            now - this._pointerMotion.time <= 8000;
        if (!predicting && actualX === this._pointerLastX && actualY === this._pointerLastY)
            return;
        // Actual input owns window entry: prediction must never keep a line
        // visible inside the window or hide it early on approach.
        let vector = pointerVector(this._pointerFrame, actualX, actualY,
            this._pointerMaxLength, this._pointerMaxDistance);
        let x = actualX, y = actualY;
        if (predicting && vector.length > 0) {
            const monitor = Main.layoutManager.monitors.find(item =>
                actualX >= item.x && actualX < item.x + item.width &&
                actualY >= item.y && actualY < item.y + item.height);
            const [projectedX, projectedY] = this._pointerMotion.project(now, leadUs, monitor);
            const projected = pointerVector(this._pointerFrame, projectedX, projectedY,
                this._pointerMaxLength, this._pointerMaxDistance);
            if (projected.length > 0) {
                x = projectedX;
                y = projectedY;
                vector = projected;
            }
        }
        if (x === this._pointerLastX && y === this._pointerLastY)
            return;
        this._pointerLastX = x;
        this._pointerLastY = y;
        this._vector = vector;
        if (vector.length === 0) {
            this._pointer.hide();
            return;
        }
        // Pivot is the texture's line start, so rotation and scaling keep the
        // origin exactly on the cursor without allocating another surface.
        this._pointer.set_translation(x - POINTER_PADDING, y - POINTER_PADDING, 0);
        this._pointer.rotation_angle_z = Math.atan2(vector.dy, vector.dx) * 180 / Math.PI;
        this._pointer.set_scale(vector.length / this._pointerMaxLength, 1);
        this._pointer.show();
    }

    /** Paint a reusable two-pixel horizontal stroke; motion changes transforms. */
    _paintPointer() {
        const cr = this._pointer.get_context();
        try {
            cr.setSourceRGBA(0, 1, 230 / 255, 0.6);
            cr.setLineWidth(2);
            cr.moveTo(POINTER_PADDING, POINTER_PADDING);
            cr.lineTo(POINTER_PADDING + this._pointerMaxLength, POINTER_PADDING);
            cr.stroke();
        } finally {
            cr.$dispose();
        }
    }

    disable() {
        this._settings.disconnect(this._settingsSignal);
        this._stopPointerTracking();
        this._pointer.destroy();
        this._settings = null;
        this._disconnectWindow();
        global.display.disconnect(this._displaySignal);
        global.workspace_manager.disconnect(this._workspaceSignal);
        Main.layoutManager.disconnect(this._monitorSignal);
        Main.overview.disconnect(this._overviewShowing);
        Main.overview.disconnect(this._overviewHidden);
        this._outline.destroy();
        this._outline = null;
        wsiLog('info', 'disabled');
    }
}
