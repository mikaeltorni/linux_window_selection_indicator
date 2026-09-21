/** Draw a focus outline for normal windows, independent of application state. */
import St from 'gi://St';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const BORDER_PX = 4;
const BORDER_COLOR = 'rgba(245, 247, 255, 0.82)';

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
        Main.uiGroup.add_child(this._outline);
        this._focusWindow = null;
        this._windowSignals = [];
        this._displaySignal = global.display.connect('notify::focus-window',
            () => this._syncFocus());
        this._workspaceSignal = global.workspace_manager.connect('active-workspace-changed',
            () => this._syncFocus());
        this._overviewShowing = Main.overview.connect('showing', () => this._hide());
        this._overviewHidden = Main.overview.connect('hidden', () => this._syncFocus());
        this._syncFocus();
        console.info('Window Selection Indicator enabled');
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
    }

    /** Follow focus without examining window titles, classes, or agent states. */
    _syncFocus() {
        const window = global.display.focus_window;
        if (window !== this._focusWindow) {
            this._disconnectWindow();
            if (isApplicationWindow(window)) {
                this._focusWindow = window;
                for (const name of ['position-changed', 'size-changed'])
                    this._windowSignals.push(window.connect(name, () => this._place()));
                this._windowSignals.push(window.connect('unmanaged', () => {
                    this._disconnectWindow();
                    this._hide();
                }));
                console.debug('Window Selection Indicator focus changed');
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
        Main.uiGroup.set_child_above_sibling(this._outline, null);
        this._outline.show();
    }

    disable() {
        this._disconnectWindow();
        global.display.disconnect(this._displaySignal);
        global.workspace_manager.disconnect(this._workspaceSignal);
        Main.overview.disconnect(this._overviewShowing);
        Main.overview.disconnect(this._overviewHidden);
        this._outline.destroy();
        this._outline = null;
        console.info('Window Selection Indicator disabled');
    }
}
