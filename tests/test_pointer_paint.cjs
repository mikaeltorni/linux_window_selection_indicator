// Verify the cursor sample used for painting, including motion after pre-paint.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let pointer = [500, 200], queries = 0, uploads = 0;
class ObjectBase { constructor() { this._init(); } _init() {} }
class Matrix { init_from_2d(...values) { this.values = values; return this; } }
class Node {
    constructor(value) { this.value = value; this.children = []; this.rectangles = []; }
    add_child(child) { this.children.push(child); }
    add_rectangle(rectangle) { this.rectangles.push(rectangle); }
    set_name() {}
}
class Image {
    set_data(data, format, width, height, stride) { uploads++; this.data = data; this.dimensions = [width, height, stride]; }
    get_texture() { return this; }
}
const context = vm.createContext({
    GObject: { Object: ObjectBase, registerClass: (_metadata, cls) => cls },
    Clutter: { Content: {}, Image, TransformNode: Node, TextureNode: Node,
        ScalingFilter: { LINEAR: 1 }, ActorBox: class { constructor(props) { Object.assign(this, props); } } },
    Cogl: { PixelFormat: { RGBA_8888: 1 } }, Graphene: { Matrix },
    global: { get_pointer() { queries++; return pointer; } },
});
const root = path.resolve(__dirname, '..');
vm.runInContext(fs.readFileSync(path.join(root, 'window-selection-indicator@local/geometry.js'), 'utf8').replace(/^export /gm, ''), context);
vm.runInContext(fs.readFileSync(path.join(root, 'window-selection-indicator@local/pointerContent.js'), 'utf8')
    .replace(/^import .*;$/gm, '').replace('export const PointerContent', 'globalThis.PointerContent'), context);
const content = new context.PointerContent();
content.frame = { x: 100, y: 100, width: 200, height: 200 };
content.maxLength = 100; content.maxDistance = 800;
content.anchorX = 500; content.anchorY = 200;
const paint = () => { const node = new Node(); content.vfunc_paint_content({}, node, {}); return node; };
const radius = content.radius;
pointer = [508, 200]; // Input changed AFTER the actor was positioned for paint.
const node = paint();
assert.equal(node.children.length, 1);
assert.equal(node.children[0].value.values[4], radius + 8, 'actual paint uses the newest cursor x');
assert.equal(node.children[0].value.values[5], radius, 'y stays aligned to the hotspot');
assert.equal(node.children[0].value.values[0], -1, 'line points left toward the target');
const rectangle = node.children[0].children[0].rectangles[0];
assert.ok(Math.abs(rectangle.x2 - 100 * Math.sqrt(208 / 800)) < 1e-8, 'length also uses the paint-time position');
assert.equal(rectangle.y2 - rectangle.y1, 4, 'transparent padding surrounds the two-pixel stroke');
assert.equal(uploads, 1, 'one texture upload for the entire content lifetime');
for (const p of [[492, 200], [500, 208], [510, 215]]) { pointer = p; assert.equal(paint().children.length, 1); }
assert.equal(uploads, 1, 'movement does not allocate or upload another texture');
pointer = [500 + 65, 200];
assert.equal(paint().children.length, 0, 'a warp outside the damaged paint region waits for the next positioned frame');
content.anchorX = 565; pointer = [565, 200];
assert.equal(paint().children.length, 1, 'the next positioned frame recovers after a warp');
content.anchorX = 310; pointer = [295, 200];
assert.equal(paint().children.length, 0, 'late motion into the window paints no stroke');
content.frame = null;
const before = queries;
assert.equal(paint().children.length, 0);
assert.equal(queries, before, 'no pointer queries without an eligible target');
