/** Return a cursor-to-frame vector scaled by distance / maxDistance.
 * maxLength is its configured visible maximum; maxDistance is in stage pixels.
 * Omitting maxDistance retains the original helper's distance cap for callers.
 */
export function pointerVector(frame, x, y, maxLength = 100, maxDistance = maxLength) {
    const dx = Math.max(frame.x, Math.min(x, frame.x + frame.width)) - x;
    const dy = Math.max(frame.y, Math.min(y, frame.y + frame.height)) - y;
    const distance = Math.hypot(dx, dy);
    const ratio = maxDistance > 0 ? Math.min(distance / maxDistance, 1) : 0;
    const length = Math.min(distance, maxLength * ratio);
    const scale = distance > 0 ? length / distance : 0;
    return { x, y, dx: dx * scale, dy: dy * scale, length };
}
