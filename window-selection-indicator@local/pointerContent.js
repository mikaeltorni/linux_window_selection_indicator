/** Paint the vector with the cursor's actual position after layout/preparation.
 * The actor reserves a bounded region around its pre-paint anchor. A single
 * four-pixel texture supplies the two-pixel stroke; paint nodes rotate it on
 * the GPU without changing the actor's allocation or its paint volume.
 */
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import { pointerVector } from './geometry.js';

const PAINT_MARGIN = 64;
const STROKE_PADDING = 2;

export const PointerContent = GObject.registerClass({
    Implements: [Clutter.Content],
}, class PointerContent extends GObject.Object {
    _init() {
        super._init();
        this.frame = null;
        this.maxLength = 100;
        this.maxDistance = 0;
        this.anchorX = 0;
        this.anchorY = 0;
        this._matrix = new Graphene.Matrix();
        this._image = new Clutter.Image();
        this._image.set_data(new Uint8Array([
            0, 0, 0, 0,
            0, 255, 230, 153,
            0, 255, 230, 153,
            0, 0, 0, 0,
        ]), Cogl.PixelFormat.RGBA_8888, 1, 4, 4);
    }

    /** Half the fixed allocation, including the allowed late cursor movement. */
    get radius() {
        return this.maxLength + PAINT_MARGIN + STROKE_PADDING;
    }

    vfunc_get_preferred_size() {
        return [true, 2 * this.radius, 2 * this.radius];
    }

    /** Sample at content paint, later than Clutter's global PRE_PAINT callback.
     * Stay inside the region damaged before paint. If a cursor warp exceeds
     * the margin, omit this stroke; the next tracking tick repositions the
     * actor and damages both regions. Never mutate the actor during painting.
     */
    vfunc_paint_content(_actor, node, _paintContext) {
        if (!this.frame)
            return;
        const [x, y] = global.get_pointer();
        const offsetX = x - this.anchorX;
        const offsetY = y - this.anchorY;
        if (Math.abs(offsetX) > PAINT_MARGIN || Math.abs(offsetY) > PAINT_MARGIN)
            return;
        const vector = pointerVector(this.frame, x, y, this.maxLength, this.maxDistance);
        if (vector.length === 0)
            return;
        const cos = vector.dx / vector.length;
        const sin = vector.dy / vector.length;
        this._matrix.init_from_2d(cos, sin, -sin, cos,
            this.radius + offsetX, this.radius + offsetY);
        const transform = new Clutter.TransformNode(this._matrix);
        const texture = new Clutter.TextureNode(this._image.get_texture(), null,
            Clutter.ScalingFilter.LINEAR, Clutter.ScalingFilter.LINEAR);
        texture.set_name('WindowSelectionPointer');
        texture.add_rectangle(new Clutter.ActorBox({
            x1: 0, y1: -STROKE_PADDING, x2: vector.length, y2: STROKE_PADDING,
        }));
        transform.add_child(texture);
        node.add_child(transform);
    }
});
