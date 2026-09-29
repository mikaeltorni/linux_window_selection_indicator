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
const scheduledDelays = [];
let pointerQueries = 0;
// GNOME 46 exposes no normal schedule_update() on StageView. Actor setters
// already queue redraws; the extension must work without an extra scheduling API.
const view = {};
const actors = [];
class Actor {
    constructor(props) { Object.assign(this, props); actors.push(this); }
    connect(name, callback) { this[name] = callback; return 1; }
    set_position(x, y) { this.x = x; this.y = y; this.positions = (this.positions || 0) + 1; }
    set_translation(x, y, z) { this.translation_x = x; this.translation_y = y; this.translation_z = z; this.moves = (this.moves || 0) + 1; }
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
    stage: { peek_stage_views: () => [view] },
    get_pointer: () => { pointerQueries++; return pointer; },
};
const main = { overview: { ...signals, visible: false }, uiGroup: { add_child() {} },
    layoutManager: { ...signals, monitors: [{ x: 100, y: 100, width: 1001, height: 201 }] } };
const context = vm.createContext({
    St: { Widget: Actor, DrawingArea: Actor }, Extension: class { getSettings() { return settings; } },
    Main: main, global: shell, wsiLog() {},
    PointerContent: class {
        get radius() { return this.maxLength + 66; }
        invalidate() {}
    },
    Clutter: { Actor, RepaintFlags: { PRE_PAINT: 1 },
        threads_add_repaint_func_full(flags, callback) {
            assert.equal(flags, 1); beforePaint = callback; return 43;
        },
        threads_remove_repaint_func(id) { assert.equal(id, 43); beforePaint = null; } },
    GLib: { PRIORITY_DEFAULT: 0, PRIORITY_HIGH: -100, SOURCE_CONTINUE: true, SOURCE_REMOVE: false,
        get_monotonic_time: () => sampleTime,
        timeout_add(priority, interval, callback) {
            pollPriority = priority; pollInterval = interval; scheduledDelays.push(interval);
            timer = () => { sampleTime += interval * 1000; return callback(); };
            return 42;
        },
        Source: { remove(id) { assert.equal(id, 42); timer = null; } } },
});
vm.runInContext(fs.readFileSync(path.join(root, 'window-selection-indicator@local/geometry.js'), 'utf8').replace(/^export /gm, ''), context);
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
for (const [x, distance] of [[500, 200], [400, 100], [350, 50]]) {
    const vector = context.pointerVector(frame, x, 200, 100, 500);
    assert.ok(Math.abs(vector.length - 100 * Math.sqrt(distance / 500)) < 1e-8);
}
// Full length only at the farthest reachable monitor pixel from this window.
const monitors = main.layoutManager.monitors;
const farthest = context.maximumPointerDistance(frame, monitors);
assert.equal(farthest, 800);
for (const [x, distance] of [[1100, 800], [700, 400], [500, 200], [301, 1], [200, 0]]) {
    const vector = context.pointerVector(frame, x, 200, 100, farthest);
    const expected = Math.min(distance, 100 * Math.sqrt(distance / farthest));
    assert.ok(Math.abs(vector.length - expected) < 1e-8);
}
// On a three-monitor desktop the former linear stroke disappeared beneath the ~28px
// cursor graphic during a horizontal approach, even with the cursor stationary.
const approachFrame = { x: 1934, y: 2246, width: 1920, height: 2075 };
const approachMonitors = [
    { x: 0, y: 2160, width: 3840, height: 2160 },
    { x: 0, y: 0, width: 3840, height: 2160 },
    { x: 3840, y: 1380, width: 2160, height: 3840 },
];
const approachMaximum = context.maximumPointerDistance(approachFrame, approachMonitors);
const approach = context.pointerVector(approachFrame, 1500, 3000, 100, approachMaximum);
assert.ok(approach.length > 28, 'approach stroke extends past the cursor graphic');
assert.equal(context.pointerVector(approachFrame, 1934, 3000, 100, approachMaximum).length, 0);
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
assert.doesNotMatch(source, /PointerMotion|leadUs/, 'restore direct tracking without prediction');
assert.doesNotMatch(source, /\.schedule_update/,
    'early rendering discards presentation deadlines and makes the cursor sample stale at vblank');
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
assert.equal(pollInterval, 4, 'first 288Hz sample uses the next whole millisecond');
assert.equal(pollPriority, 0, 'polling yields to input processing rather than running at high priority');
const timingStart = sampleTime;
for (let count = 0; count < 288; count++) {
    assert.equal(timer(), false, 'one-shot source is removed after scheduling its successor');
}
assert.ok(Math.abs(sampleTime - timingStart - 1000000) <= 1000,
    '288 samples per second without cumulative 4ms rounding drift');
assert.ok(scheduledDelays.includes(3) && scheduledDelays.includes(4), 'deadline schedule alternates 3/4ms delays');
sampleTime += 1000000;
timer();
assert.ok(pollInterval >= 3 && pollInterval <= 4, 'stalls resume without a catch-up burst');
pointer = [700, 200]; beforePaint();
assert.equal(extension._vector.x, 700, 'sample the latest cursor immediately before rendering');
assert.equal(extension._pointer.translation_x + extension._pointerContent.radius, 700,
    'reserved paint region is anchored on the cursor');
assert.equal(extension._pointerContent.anchorX, 700);
assert.equal(extension._pointerContent.frame.x, frame.x);
const readsBeforeMotion = frameReads, normalizationsBeforeMotion = normalizationCalls;
const positionsBeforeMotion = extension._pointer.positions;
const resizesBeforeMotion = extension._pointer.resizes;
const movesBeforeMotion = extension._pointer.moves;
pointer = [699, 200]; timer();
assert.equal(extension._pointer.moves, movesBeforeMotion + 1, 'motion queues its redraw through the actor');
assert.equal(extension._pointerFramePending, true, 'motion marks the queued redraw pending');
const queriesWhilePending = pointerQueries;
pointer = [698, 200]; timer(); timer();
assert.equal(pointerQueries, queriesWhilePending, 'pending motion frame coalesces redundant X11 probes');
assert.equal(extension._pointer.moves, movesBeforeMotion + 1, 'pending frame does not repeat transforms');
beforePaint();
assert.equal(extension._vector.x, 698, 'pending frame samples newest input before it renders');
assert.equal(extension._pointerFramePending, false, 'pre-paint consumes the pending redraw');
for (let x = 699; x >= 650; x--) { pointer = [x, 200]; timer(); beforePaint(); }
assert.equal(extension._vector.x, 650, 'moving vector uses actual cursor coordinates');
pointer = [660, 200]; timer(); beforePaint();
assert.equal(extension._vector.x, 660, 'direction reversal follows actual coordinates immediately');
for (let count = 0; count < 1000; count++) timer();
const movesAfterPause = extension._pointer.moves;
timer(); beforePaint();
assert.equal(extension._pointer.moves, movesAfterPause, 'stationary cursor does not force compositor frames');
assert.equal(frameReads, readsBeforeMotion, 'cursor tracking reuses window geometry');
assert.equal(normalizationCalls, normalizationsBeforeMotion, 'cursor tracking reuses monitor normalization');
assert.equal(extension._pointer.resizes, resizesBeforeMotion, 'moving cursor does not reallocate its drawing surface');
assert.equal(extension._pointer.positions, positionsBeforeMotion, 'moving cursor does not relayout the actor');
pointer = [150, 150]; timer(); beforePaint();
assert.equal(extension._pointer.visible, false, 'inside the window');
pointer = [400, 200]; timer(); beforePaint();
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
assert.equal(extension._pointerFramePending, false, 'disable clears any pending-motion latch');
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
assert.ok(Math.abs(extension._vector.length - 95 * Math.sqrt(100 / 800)) < 1e-8,
    'length changes live with desktop distance');
assert.equal(extension._pointerContent.maxLength, 95, 'content receives live length changes');
assert.equal(extension._pointer.height, 2 * (95 + 66), 'reserved region includes the late motion margin');
const originalViews = shell.stage.peek_stage_views;
shell.stage.peek_stage_views = () => [];
beforePaint(); pointer = [401, 200]; timer();
assert.equal(extension._pointerFramePending, false, 'missing stage views do not freeze polling');
shell.stage.peek_stage_views = originalViews;
pointer = [400, 200]; timer(); beforePaint();
main.layoutManager.monitors = [{ x: 100, y: 100, width: 2001, height: 201 }];
main.layoutManager['monitors-changed'](); timer();
assert.ok(Math.abs(extension._vector.length - 95 * Math.sqrt(100 / 1800)) < 1e-8,
    'monitor changes update the distance curve while the pointer is stationary');
window.get_frame_rect = () => ({ x: 100, y: 100, width: 100, height: 200 });
window['size-changed'](); timer();
assert.ok(Math.abs(extension._vector.length - 95 * Math.sqrt(200 / 1900)) < 1e-8,
    'window resize updates both distance and normalization');
main.layoutManager.monitors = []; main.layoutManager['monitors-changed']();
timer();
assert.equal(extension._pointer.visible, false, 'no available monitor pixels');
extension.disable();
assert.equal(timer, null, 'timer removed on disable');
assert.equal(beforePaint, null, 'pre-paint callback removed on disable');
assert.ok(actors.every(actor => actor.destroyed));
