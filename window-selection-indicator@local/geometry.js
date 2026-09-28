/** Compute a cursor vector to the nearest point of a window's stage-space frame. */
export function pointerVector(frame, x, y) {
    const dx = Math.max(frame.x, Math.min(x, frame.x + frame.width)) - x;
    const dy = Math.max(frame.y, Math.min(y, frame.y + frame.height)) - y;
    return { x, y, dx, dy, length: Math.hypot(dx, dy) };
}
