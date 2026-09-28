/** Return a cursor-to-frame vector, capped at 100px and zero inside the frame. */
export function pointerVector(frame, x, y) {
    const dx = Math.max(frame.x, Math.min(x, frame.x + frame.width)) - x;
    const dy = Math.max(frame.y, Math.min(y, frame.y + frame.height)) - y;
    const distance = Math.hypot(dx, dy);
    const length = Math.min(distance, 100);
    const scale = distance > 0 ? length / distance : 0;
    return { x, y, dx: dx * scale, dy: dy * scale, length };
}
