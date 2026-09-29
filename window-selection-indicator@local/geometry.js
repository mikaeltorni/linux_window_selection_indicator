/** Stage-space geometry shared by pointer drawing and monitor normalization. */

/** Return the shortest vector and Euclidean distance from a pixel to a frame. */
function frameVector(frame, x, y) {
    const dx = Math.max(frame.x, Math.min(x, frame.x + frame.width)) - x;
    const dy = Math.max(frame.y, Math.min(y, frame.y + frame.height)) - y;
    return { dx, dy, distance: Math.hypot(dx, dy) };
}

/** Return the greatest cursor-to-frame distance over all actual monitor pixels.
 * Distance to a rectangle is convex, so checking each monitor's four corners
 * covers its entire pixel area without scanning every pixel. Use width/height
 * minus one to include the last reachable pixel, excluding gaps between screens.
 * Empty/zero-sized layouts return zero and suppress the line until available.
 */
export function maximumPointerDistance(frame, monitors) {
    let maximum = 0;
    for (const monitor of monitors) {
        if (monitor.width <= 0 || monitor.height <= 0)
            continue;
        for (const x of [monitor.x, monitor.x + monitor.width - 1]) {
            for (const y of [monitor.y, monitor.y + monitor.height - 1])
                maximum = Math.max(maximum, frameVector(frame, x, y).distance);
        }
    }
    return maximum;
}

/** Return a cursor-to-frame vector with a square-root distance curve.
 * maxLength is the visible maximum at maxDistance stage pixels. The curve
 * keeps short approaches visible beyond the cursor graphic, yet reaches zero
 * at the frame; never extend the stroke past the nearest window edge.
 */
export function pointerVector(frame, x, y, maxLength = 100, maxDistance = maxLength) {
    const { dx, dy, distance } = frameVector(frame, x, y);
    const ratio = maxDistance > 0 ? Math.min(distance / maxDistance, 1) : 0;
    const length = Math.min(distance, maxLength * Math.sqrt(ratio));
    const scale = distance > 0 ? length / distance : 0;
    return { x, y, dx: dx * scale, dy: dy * scale, length };
}
