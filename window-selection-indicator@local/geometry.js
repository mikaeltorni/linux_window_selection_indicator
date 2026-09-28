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

/** Return a cursor-to-frame vector scaled by distance / maxDistance.
 * maxLength is its configured visible maximum; maxDistance is in stage pixels.
 * Omitting maxDistance retains the original helper's distance cap for callers.
 */
export function pointerVector(frame, x, y, maxLength = 100, maxDistance = maxLength) {
    const { dx, dy, distance } = frameVector(frame, x, y);
    const ratio = maxDistance > 0 ? Math.min(distance / maxDistance, 1) : 0;
    const length = Math.min(distance, maxLength * ratio);
    const scale = distance > 0 ? length / distance : 0;
    return { x, y, dx: dx * scale, dy: dy * scale, length };
}

/** Estimate the cursor at frame presentation without smoothing its input.
 * All timestamps and lead values are monotonic microseconds. Two consistent
 * movements are required; warps, reversals, pauses and stale samples cancel
 * prediction. Lead is limited to 16ms/64px and stays on the current monitor.
 */
export class PointerMotion {
    constructor() { this.reset(); }

    /** Discard movement history when focus, geometry or enablement changes. */
    reset() {
        this.time = 0;
        this.vx = this.vy = 0;
        this.steady = false;
    }

    /** Record an actual cursor probe; duplicate probes do not invent motion. */
    sample(x, y, time) {
        if (this.time && x === this.x && y === this.y) {
            if (time - this.time > 8000) {
                this.vx = this.vy = 0;
                this.steady = false;
            }
            return;
        }
        const elapsed = time - this.time;
        const dx = x - this.x, dy = y - this.y;
        if (this.time && elapsed > 0 && elapsed <= 24000 && Math.hypot(dx, dy) < 192) {
            this.steady = dx * this.vx + dy * this.vy > 0;
            this.vx = dx / elapsed;
            this.vy = dy / elapsed;
        } else {
            this.vx = this.vy = 0;
            this.steady = false;
        }
        this.x = x;
        this.y = y;
        this.time = time;
    }

    /** Return the bounded presentation position, or the exact stationary one. */
    project(now, lead, monitor) {
        if (!this.steady || now - this.time > 8000 || !monitor || lead <= 0)
            return [this.x, this.y];
        const horizon = Math.min(lead, 16000);
        const dx = this.vx * horizon, dy = this.vy * horizon;
        const scale = Math.min(1, 64 / Math.hypot(dx, dy));
        return [
            Math.max(monitor.x, Math.min(this.x + dx * scale, monitor.x + monitor.width - 1)),
            Math.max(monitor.y, Math.min(this.y + dy * scale, monitor.y + monitor.height - 1)),
        ];
    }
}
