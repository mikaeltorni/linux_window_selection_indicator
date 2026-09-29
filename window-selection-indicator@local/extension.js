/** Draw a focus outline for normal windows, independent of application state. */
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import { maximumPointerDistance, pointerVector } from './geometry.js';
import { wsiLog } from './logging.js';
import { PointerContent } from './pointerContent.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const BORDER_PX = 4;
const BORDER_COLOR = 'rgba(0, 255, 230, 0.6)';
const POINTER_SAMPLE_HZ = 288;
const POINTER_SAMPLE_US = 1000000 / POINTER_SAMPLE_HZ;

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
        this._pointerContent = new PointerContent();
        this._pointer = new Clutter.Actor({
            reactive: false, visible: false, content: this._pointerContent,
        });
        this._pointer.set_position(0, 0);
        Main.uiGroup.add_child(this._pointer);
        this._pointerTimer = 0;
        this._pointerBeforePaint = 0;
        this._pointerFramePending = false;
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
        this._pointerFramePending = false;
        this._pointerFrame = null;
        this._pointerContent.frame = null;
        this._pointerLastX = NaN;
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
        this._pointerContent.frame = frame;
        this._pointerContent.maxDistance = this._pointerMaxDistance;
        this._pointerContent.invalidate();
        this._pointerLastX = NaN;
        this._pointerFramePending = false;
        this._updatePointer();
    }

    /** Start polling only while the optional pointer setting is enabled. */
    _syncPointerSettings() {
        this._pointerEnabled = this._settings.get_boolean('pointer-enabled');
        this._pointerMaxLength = this._settings.get_int('pointer-max-length');
        // Reserve enough damage for input arriving after the pre-paint anchor.
        // The content texture is constant; length changes only resize the region.
        this._pointerContent.maxLength = this._pointerMaxLength;
        const diameter = 2 * this._pointerContent.radius;
        this._pointer.set_size(diameter, diameter);
        this._pointerContent.invalidate();
        this._pointerLastX = NaN;
        this._stopPointerTracking();
        if (this._pointerEnabled) {
            // Refresh again before the compositor draws: timer samples may be
            // older than the cursor by the time a scheduled frame is presented.
            this._pointerBeforePaint = Clutter.threads_add_repaint_func_full(
                Clutter.RepaintFlags.PRE_PAINT, () => {
                    this._pointerFramePending = false;
                    this._updatePointer(false);
                    return GLib.SOURCE_CONTINUE;
                });
            this._pointerNextSample = GLib.get_monotonic_time() + POINTER_SAMPLE_US;
            this._queuePointerSample();
        }
        this._updatePointer();
        wsiLog('info', `cursor vector ${this._pointerEnabled ? 'enabled' : 'disabled'}, max ${this._pointerMaxLength}px, ${POINTER_SAMPLE_HZ}Hz direct tracking with late paint-time sampling`);
    }

    /** Schedule the next 288Hz probe without accumulating millisecond drift.
     * GLib timers use whole milliseconds, so deadlines alternate 3/4ms waits.
     * Missed deadlines resume normally instead of flooding the Shell with work.
     */
    _queuePointerSample() {
        if (!this._pointerEnabled)
            return;
        const delay = Math.max(1, Math.ceil(
            (this._pointerNextSample - GLib.get_monotonic_time()) / 1000));
        this._pointerTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._pointerTimer = 0;
            this._updatePointer();
            this._pointerNextSample += POINTER_SAMPLE_US;
            const now = GLib.get_monotonic_time();
            if (this._pointerNextSample <= now)
                this._pointerNextSample = now + POINTER_SAMPLE_US;
            this._queuePointerSample();
            return GLib.SOURCE_REMOVE;
        });
    }

    /** Release both callbacks so disabling the optional vector leaves no work. */
    _stopPointerTracking() {
        this._pointerFramePending = false;
        if (this._pointerBeforePaint) {
            Clutter.threads_remove_repaint_func(this._pointerBeforePaint);
            this._pointerBeforePaint = 0;
        }
        if (this._pointerTimer) {
            GLib.Source.remove(this._pointerTimer);
            this._pointerTimer = 0;
        }
    }

    /** Coalesce polls while a frame is pending; always sample again at paint. */
    _updatePointer(requestFrame = true) {
        if (!this._pointerEnabled || !this._pointerFrame) {
            this._pointer.hide();
            return;
        }
        // X11's get_pointer() blocks on a server round trip. More probes while
        // waiting for a frame cannot display anything and compete with input.
        if (requestFrame && this._pointerFramePending)
            return;
        const [x, y] = global.get_pointer();
        if (x === this._pointerLastX && y === this._pointerLastY)
            return;
        this._pointerLastX = x;
        this._pointerLastY = y;
        const vector = pointerVector(this._pointerFrame, x, y, this._pointerMaxLength,
            this._pointerMaxDistance);
        this._vector = vector;
        if (vector.length === 0) {
            const wasVisible = this._pointer.visible;
            this._pointer.hide();
            if (requestFrame && wasVisible)
                this._markPointerFramePending();
            return;
        }
        // This anchor owns allocation/damage. Content samples the actual cursor
        // again at paint and shifts the stroke inside this reserved region.
        this._pointerContent.anchorX = x;
        this._pointerContent.anchorY = y;
        const radius = this._pointerContent.radius;
        this._pointer.set_translation(x - radius, y - radius, 0);
        this._pointer.show();
        if (requestFrame)
            this._markPointerFramePending();
    }

    /** Coalesce polling until the actor's queued redraw reaches pre-paint.
     * Actor changes already schedule the normal presentation deadline. Forcing
     * an immediate frame renders early and leaves the cursor sample waiting
     * for vblank. No extra stage-view scheduling is necessary.
     */
    _markPointerFramePending() {
        this._pointerFramePending = global.stage.peek_stage_views().length > 0;
    }

    disable() {
        this._settings.disconnect(this._settingsSignal);
        this._stopPointerTracking();
        this._pointer.destroy();
        this._pointerContent = null;
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
