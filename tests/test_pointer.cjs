// Exercise the actual extension in a silent Shell harness (no GUI processes).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let pointer = [20, 50], activeWorkspace = {}, timer;
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
const main = { overview: { ...signals, visible: false }, uiGroup: { add_child() {} } };
const context = vm.createContext({
    St: { Widget: Actor, DrawingArea: Actor }, Extension: class {},
    Main: main, global: shell, wsiLog() {},
    GLib: { PRIORITY_DEFAULT: 0, SOURCE_CONTINUE: true,
        timeout_add(_priority, _interval, callback) { timer = callback; return 42; },
        Source: { remove(id) { assert.equal(id, 42); timer = null; } } },
});
vm.runInContext(fs.readFileSync(path.join(root, 'window-selection-indicator@local/geometry.js'), 'utf8').replace('export function', 'function'), context);
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
extension.disable();
assert.equal(timer, null, 'timer removed on disable');
assert.ok(actors.every(actor => actor.destroyed));
