/** Return a cursor-to-frame vector, capped at maxLength (default 100px) and zero inside the frame. */
export function pointerVector(frame, x, y, maxLength = 100) {
    const dx = Math.max(frame.x, Math.min(x, frame.x + frame.width)) - x;
    const dy = Math.max(frame.y, Math.min(y, frame.y + frame.height)) - y;
    const distance = Math.hypot(dx, dy);
    const length = Math.min(distance, maxLength);
    const scale = distance > 0 ? length / distance : 0;
    return { x, y, dx: dx * scale, dy: dy * scale, length };
}
