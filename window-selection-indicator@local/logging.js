/** Shared GNOME journal logger; pointer polling intentionally emits no records. */
export function wsiLog(level, message) {
    console[level](`Window Selection Indicator: ${message}`);
}
