// Dash (Phase 9.3, D-13) — base movement ability plus VFX. All numeric values are
// also exposed via RUNTIME_CONFIG so they're tweakable from the debug panel.

export const DASH_COOLDOWN_MS = 1200; // ms between dashes
export const DASH_DISTANCE_TILES = 1; // dash distance in tiles (96 px at 32 px/tile)
export const DASH_DURATION_MS = 150; // dash motion duration → velocity = 640 px/s (RESEARCH.md §3)
export const DASH_IFRAMES_ENABLED = false; // i-frames during dash (off by default)
export const DASH_IFRAMES_MS = 150; // i-frame window when enabled
export const DASH_CANCELS_CAST = false; // pressing Shift mid-cast aborts the cast
export const DASH_INTERRUPTABLE_BY_CAST = false; // pressing 1/2/3 mid-dash is ignored

// Dash VFX tunables — adjust live via RUNTIME_CONFIG / debug panel.
export const DASH_SMOKE_ALPHA = 0.5; // smoke puff opacity (0..1)
export const DASH_SMOKE_SCALE = 0.7; // smoke puff size multiplier
export const DASH_ROLL_SCALE = 1.0; // roll sprite size multiplier (Role frames are already 16x16, matching the in-frame character size)
