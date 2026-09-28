// Exercise the actual extension in a silent Shell harness (no GUI processes).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let pointerEnabled = true, pointerMaxLength = 100, settingsCallback;
const settings = { get_boolean: () => pointerEnabled, get_int: () => pointerMaxLength, connect(_name, callback) { settingsCallback = callback; return 1; }, disconnect() {} };
let pointer = [20, 50], activeWorkspace = {}, timer, beforePaint, pollInterval, pollPriority, frameReads = 0;
let sampleTime = 1000000;
const actors = [];
class Actor {
    constructor(props) { Object.assign(this, props); actors.push(this); }
    connect(name, callback) { this[name] = callback; return 1; }
    set_position(x, y) { this.x = x; this.y = y; this.positions = (this.positions || 0) + 1; }
    set_translation(x, y, z) { this.translation_x = x; this.translation_y = y; this.translation_z = z; }
    set_size(width, height) { this.width = width; this.height = height; this.resizes = (this.resizes || 0) + 1; }
    set_pivot_point(x, y) { this.pivot = [x, y]; }
    set_scale(x, y) { this.scale_x = x; this.scale_y = y; }
    show() { this.visible = true; }
    hide() { this.visible = false; }
    destroy() { this.destroyed = true; }
    queue_repaint() { this.repaints = (this.repaints || 0) + 1; }
}
const signals = { connect(name, callback) { this[name] = callback; return 1; }, disconnect() {} };
const window = {
    ...signals, is_skip_taskbar: () => false, minimized: false,
    get_compositor_private: () => ({}),
    located_on_workspace: ws => ws === activeWorkspace,
    get_frame_rect: () => { frameReads++; return { x: 100, y: 100, width: 200, height: 200 }; },
};
const shell = {
    display: { ...signals, focus_window: window },
    workspace_manager: { ...signals, get_active_workspace: () => activeWorkspace },
    window_group: { add_child() {}, set_child_above_sibling() {} },
    stage: {
        connect(name, callback) {
            assert.equal(name, 'before-paint');
            beforePaint = () => callback(this, { get_refresh_rate: () => 120 });
            return 43;
        },
        disconnect(id) { assert.equal(id, 43); beforePaint = null; },
    },
    get_pointer: () => pointer,
};
const main = { overview: { ...signals, visible: false }, uiGroup: { add_child() {} },
    layoutManager: { ...signals, monitors: [{ x: 100, y: 100, width: 1001, height: 201 }] } };
const context = vm.createContext({
    St: { Widget: Actor, DrawingArea: Actor }, Extension: class { getSettings() { return settings; } },
    Main: main, global: shell, wsiLog() {},
    GLib: { PRIORITY_DEFAULT: 0, PRIORITY_HIGH: -100, SOURCE_CONTINUE: true,
        get_monotonic_time: () => sampleTime,
        timeout_add(priority, interval, callback) { pollPriority = priority; pollInterval = interval; timer = () => { sampleTime += interval * 1000; return callback(); }; return 42; },
        Source: { remove(id) { assert.equal(id, 42); timer = null; } } },
});
vm.runInContext(fs.readFileSync(path.join(root, 'window-selection-indicator@local/geometry.js'), 'utf8').replace(/^export /gm, ''), context);
// Model the hardware cursor advancing while the compositor's frame is queued.
// Compensate steady motion; never extrapolate a warp, stop, reversal or gap.
const motion = vm.runInContext('new PointerMotion()', context);
const monitor = { x: 0, y: 0, width: 2000, height: 1000 };
motion.sample(500, 200, 1000000);
motion.sample(508, 200, 1004000);
motion.sample(516, 200, 1008000);
assert.deepEqual(Array.from(motion.project(1008000, 8000, monitor)), [532, 200],
    '16px of render latency is compensated at 2000px/s');
motion.sample(516, 200, 1020000);
assert.deepEqual(Array.from(motion.project(1020000, 8000, monitor)), [516, 200], 'stop snaps to actual cursor');
assert.equal(motion.steady, false, 'pause discards old velocity');
motion.sample(510, 200, 1024000);
assert.deepEqual(Array.from(motion.project(1024000, 8000, monitor)), [510, 200], 'reversal does not overshoot');
motion.sample(900, 200, 1028000);
assert.deepEqual(Array.from(motion.project(1028000, 8000, monitor)), [900, 200], 'pointer warp is not projected');
motion.sample(910, 200, 1032000);
motion.sample(920, 200, 1036000);
assert.deepEqual(Array.from(motion.project(1100000, 8000, monitor)), [920, 200], 'stale movement expires');
assert.deepEqual(Array.from(motion.project(1036000, 1000000, monitor)), [960, 200], 'lead is bounded to 16ms');
assert.deepEqual(Array.from(motion.project(1036000, 8000, { x: 0, y: 0, width: 930, height: 1000 })), [929, 200],
    'projection stays on actual monitor pixels');
motion.sample(1080, 200, 1040000);
motion.sample(1240, 200, 1044000);
assert.deepEqual(Array.from(motion.project(1044000, 16000, monitor)), [1304, 200], 'fast motion lead is capped at 64px');
motion.reset();
motion.sample(400, 200, 2000000);
assert.deepEqual(Array.from(motion.project(2000000, 8000, monitor)), [400, 200], 'focus changes discard old velocity');
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
let normalizationCalls = 0;
const calculateMaximum = context.maximumPointerDistance;
context.maximumPointerDistance = (...args) => { normalizationCalls++; return calculateMaximum(...args); };
const extension = new context.Indicator();
extension.enable();
assert.ok(extension._pointer, 'pointer actor created');
assert.equal(extension._pointer.reactive, false, 'line does not intercept mouse');
assert.equal(extension._pointer.visible, true);
assert.equal(typeof timer, 'function');
assert.equal(typeof beforePaint, 'function');
assert.equal(pollInterval, 4, '250Hz cursor sampling');
assert.equal(pollPriority, -100, 'sample ahead of ordinary GLib tasks');
pointer = [700, 200]; beforePaint();
assert.equal(extension._vector.x, 700, 'sample the latest cursor immediately before rendering');
assert.equal(extension._pointer.translation_x + 2, 700, 'texture pivot stays on cursor hotspot');
assert.equal(extension._pointer.rotation_angle_z, 180);
assert.equal(extension._pointer.scale_x, 0.5);
const readsBeforeMotion = frameReads, normalizationsBeforeMotion = normalizationCalls;
const positionsBeforeMotion = extension._pointer.positions;
const repaintsBeforeMotion = extension._pointer.repaints, resizesBeforeMotion = extension._pointer.resizes;
for (let x = 699; x >= 650; x--) { pointer = [x, 200]; timer(); beforePaint(); }
for (let count = 0; count < 1000; count++) timer();
assert.equal(frameReads, readsBeforeMotion, 'cursor tracking reuses window geometry');
assert.equal(normalizationCalls, normalizationsBeforeMotion, 'cursor tracking reuses monitor normalization');
assert.equal(extension._pointer.repaints, repaintsBeforeMotion, 'moving cursor uses GPU transforms without Cairo repaint');
assert.equal(extension._pointer.resizes, resizesBeforeMotion, 'moving cursor does not reallocate its drawing surface');
assert.equal(extension._pointer.positions, positionsBeforeMotion, 'moving cursor does not relayout the actor');
// Integration: compensate the display frame, then correct on pause and reversal.
pointer = [600, 200]; timer();
pointer = [592, 200]; timer();
pointer = [584, 200]; timer(); beforePaint();
assert.ok(Math.abs(extension._vector.x - (584 - 2000 / 120)) < 1e-8,
    'late stage paint compensates one 120Hz frame');
timer(); timer(); timer(); beforePaint();
assert.equal(extension._vector.x, 584, 'stopped cursor returns to its exact position');
pointer = [590, 200]; timer(); beforePaint();
assert.equal(extension._vector.x, 590, 'reversal draws actual input without old velocity');
pointer = [308, 200]; timer();
pointer = [304, 200]; timer();
pointer = [301, 200]; timer(); beforePaint();
assert.equal(extension._pointer.visible, true, 'prediction does not hide before actual window entry');
assert.equal(extension._vector.x, 301, 'approach keeps actual position if prediction would enter window');
pointer = [150, 150]; timer();
assert.equal(extension._pointer.visible, false, 'inside the window');
pointer = [400, 200]; timer();
assert.equal(extension._pointer.visible, true);
window.located_on_workspace = () => false; window['workspace-changed'](); timer();
assert.equal(extension._pointer.visible, false, 'other workspace');
window.located_on_workspace = () => true; window['workspace-changed']();
main.overview.visible = true; main.overview.showing(); timer();
assert.equal(extension._pointer.visible, false, 'overview');
main.overview.visible = false; main.overview.hidden();
window.minimized = true; window['notify::minimized'](); timer();
assert.equal(extension._pointer.visible, false, 'minimized');
window.minimized = false; window['notify::minimized']();
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
assert.deepEqual(extension._pointer.pivot, [2 / 99, 0.5], 'length changes preserve the cursor pivot');
assert.equal(extension._pointer.height, 4, 'drawing surface stays four pixels high');
main.layoutManager.monitors = [{ x: 100, y: 100, width: 2001, height: 201 }];
main.layoutManager['monitors-changed'](); timer();
assert.ok(Math.abs(extension._vector.length - 95 * 100 / 1800) < 1e-8,
    'monitor changes update the proportional scale while the pointer is stationary');
window.get_frame_rect = () => ({ x: 100, y: 100, width: 100, height: 200 });
window['size-changed'](); timer();
assert.ok(Math.abs(extension._vector.length - 95 * 200 / 1900) < 1e-8,
    'window resize updates both distance and normalization');
main.layoutManager.monitors = []; main.layoutManager['monitors-changed']();
timer();
assert.equal(extension._pointer.visible, false, 'no available monitor pixels');
extension.disable();
assert.equal(timer, null, 'timer removed on disable');
assert.equal(beforePaint, null, 'pre-paint callback removed on disable');
assert.ok(actors.every(actor => actor.destroyed));
