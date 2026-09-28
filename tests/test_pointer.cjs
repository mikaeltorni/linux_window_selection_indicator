// Exercise the actual extension in a silent Shell harness (no GUI processes).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let pointerEnabled = true, pointerMaxLength = 100, settingsCallback;
const settings = { get_boolean: () => pointerEnabled, get_int: () => pointerMaxLength, connect(_name, callback) { settingsCallback = callback; return 1; }, disconnect() {} };
let pointer = [20, 50], activeWorkspace = {}, timer, beforePaint;
const actors = [];
class Actor {
    constructor(props) { Object.assign(this, props); actors.push(this); }
    connect(name, callback) { this[name] = callback; return 1; }
    set_position(x, y) { this.x = x; this.y = y; }
    set_size(width, height) { this.width = width; this.height = height; }
    show() { this.visible = true; }
    hide() { this.visible = false; }
    destroy() { this.destroyed = true; }
    queue_repaint() { this.repaints = (this.repaints || 0) + 1; }
}
const signals = { connect() { return 1; }, disconnect() {} };
const window = {
    ...signals, is_skip_taskbar: () => false, minimized: false,
    get_compositor_private: () => ({}),
    located_on_workspace: ws => ws === activeWorkspace,
    get_frame_rect: () => ({ x: 100, y: 100, width: 200, height: 200 }),
};
const shell = {
    display: { ...signals, focus_window: window },
    workspace_manager: { ...signals, get_active_workspace: () => activeWorkspace },
    window_group: { add_child() {}, set_child_above_sibling() {} },
    get_pointer: () => pointer,
};
const main = { overview: { ...signals, visible: false }, uiGroup: { add_child() {} },
    layoutManager: { monitors: [{ x: 100, y: 100, width: 1001, height: 201 }] } };
const context = vm.createContext({
    St: { Widget: Actor, DrawingArea: Actor }, Extension: class { getSettings() { return settings; } },
    Main: main, global: shell, wsiLog() {},
    Clutter: { RepaintFlags: { PRE_PAINT: 1 },
        threads_add_repaint_func_full(flags, callback) {
            assert.equal(flags, 1); beforePaint = callback; return 43;
        },
        threads_remove_repaint_func(id) { assert.equal(id, 43); beforePaint = null; } },
    GLib: { PRIORITY_DEFAULT: 0, SOURCE_CONTINUE: true,
        timeout_add(_priority, _interval, callback) { timer = callback; return 42; },
        Source: { remove(id) { assert.equal(id, 42); timer = null; } } },
});
vm.runInContext(fs.readFileSync(path.join(root, 'window-selection-indicator@local/geometry.js'), 'utf8').replaceAll('export function', 'function'), context);
const frame = { x: 100, y: 100, width: 200, height: 200 };
for (const [x, y, expected] of [[400, 200, 100], [1000, 200, 100],
    [350, 200, 50], [150, 150, 0], [100, 100, 0], [-400, -400, 100]]) {
    const vector = context.pointerVector(frame, x, y);
    assert.ok(Math.abs(vector.length - expected) < 1e-8);
    assert.ok(Math.abs(Math.hypot(vector.dx, vector.dy) - expected) < 1e-8);
}
assert.equal(context.pointerVector(frame, 1000, 200, 95).length, 95);
assert.equal(context.pointerVector(frame, 320, 200, 95).length, 20);
// Regression: shorten over the entire desktop, not just the last 100 pixels.
assert.equal(context.pointerVector(frame, 500, 200, 100, 500).length, 40);
assert.equal(context.pointerVector(frame, 400, 200, 100, 500).length, 20);
assert.equal(context.pointerVector(frame, 350, 200, 100, 500).length, 10);
// Full length only at the farthest reachable monitor pixel from this window.
const monitors = main.layoutManager.monitors;
const farthest = context.maximumPointerDistance(frame, monitors);
assert.equal(farthest, 800);
for (const [x, expected] of [[1100, 100], [700, 50], [500, 25], [301, 0.125], [200, 0]]) {
    const vector = context.pointerVector(frame, x, 200, 100, farthest);
    assert.equal(vector.length, expected);
}
const leftMonitor = { x: -900, y: -700, width: 501, height: 601 };
assert.equal(context.maximumPointerDistance(frame, [...monitors, leftMonitor]), Math.hypot(1000, 800));
// A bounding-box corner in a gap between staggered monitors is not a pixel.
assert.equal(context.maximumPointerDistance({ x: 0, y: 0, width: 100, height: 100 }, [
    { x: -1000, y: 0, width: 101, height: 101 },
    { x: 0, y: 1000, width: 101, height: 101 },
]), 1000);
assert.equal(context.maximumPointerDistance(frame, []), 0);
assert.equal(context.maximumPointerDistance(frame, [{ x: 0, y: 0, width: 0, height: 0 }]), 0);
// Independently enumerate every pixel of small offset screens to verify the
// corner optimization covers their full union and uses the window's edges.
const smallFrame = { x: 1, y: 1, width: 2, height: 3 };
const smallMonitors = [{ x: -4, y: 0, width: 3, height: 5 },
    { x: 0, y: -4, width: 6, height: 3 }, { x: 0, y: 4, width: 4, height: 3 }];
let bruteMaximum = 0;
for (const monitor of smallMonitors) {
    for (let x = monitor.x; x < monitor.x + monitor.width; x++) {
        for (let y = monitor.y; y < monitor.y + monitor.height; y++) {
            const horizontal = Math.max(smallFrame.x - x, 0, x - smallFrame.x - smallFrame.width);
            const vertical = Math.max(smallFrame.y - y, 0, y - smallFrame.y - smallFrame.height);
            bruteMaximum = Math.max(bruteMaximum, Math.hypot(horizontal, vertical));
        }
    }
}
assert.equal(context.maximumPointerDistance(smallFrame, smallMonitors), bruteMaximum);
const source = fs.readFileSync(path.join(root, 'window-selection-indicator@local/extension.js'), 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace('export default class', 'globalThis.Indicator = class');
vm.runInContext(source, context);
const extension = new context.Indicator();
extension.enable();
assert.ok(extension._pointer, 'pointer actor created');
assert.equal(extension._pointer.reactive, false, 'line does not intercept mouse');
assert.equal(extension._pointer.visible, true);
assert.equal(typeof timer, 'function');
assert.equal(typeof beforePaint, 'function');
pointer = [700, 200]; beforePaint();
assert.equal(extension._vector.x, 700, 'sample the latest cursor immediately before rendering');
pointer = [150, 150]; timer();
assert.equal(extension._pointer.visible, false, 'inside the window');
pointer = [400, 200]; timer();
assert.equal(extension._pointer.visible, true);
window.located_on_workspace = () => false; timer();
assert.equal(extension._pointer.visible, false, 'other workspace');
window.located_on_workspace = () => true;
main.overview.visible = true; timer();
assert.equal(extension._pointer.visible, false, 'overview');
main.overview.visible = false; window.minimized = true; timer();
assert.equal(extension._pointer.visible, false, 'minimized');
window.minimized = false;
shell.display.focus_window = null; extension._syncFocus(); timer();
assert.equal(extension._pointer.visible, false, 'no selected window');
pointerEnabled = false; settingsCallback();
assert.equal(timer, null, 'no polling when optional pointer is disabled');
assert.equal(beforePaint, null, 'no pre-paint callback while disabled');
assert.equal(extension._pointer.visible, false);
assert.equal(extension._outline.visible, false); // Focus is still absent.
shell.display.focus_window = window; extension._syncFocus();
assert.equal(extension._outline.visible, true, 'outline remains enabled');
assert.equal(extension._pointer.visible, false);
pointerEnabled = true; settingsCallback();
assert.equal(extension._pointer.visible, true, 'live opt-in');
pointerMaxLength = 95; settingsCallback();
assert.equal(extension._vector.length, 11.875, 'length changes live with desktop distance');
main.layoutManager.monitors = [{ x: 100, y: 100, width: 2001, height: 201 }];
timer();
assert.ok(Math.abs(extension._vector.length - 95 * 100 / 1800) < 1e-8,
    'monitor changes update the proportional scale while the pointer is stationary');
window.get_frame_rect = () => ({ x: 100, y: 100, width: 100, height: 200 });
timer();
assert.ok(Math.abs(extension._vector.length - 95 * 200 / 1900) < 1e-8,
    'window resize updates both distance and normalization');
main.layoutManager.monitors = [];
timer();
assert.equal(extension._pointer.visible, false, 'no available monitor pixels');
extension.disable();
assert.equal(timer, null, 'timer removed on disable');
assert.equal(beforePaint, null, 'pre-paint callback removed on disable');
assert.ok(actors.every(actor => actor.destroyed));
