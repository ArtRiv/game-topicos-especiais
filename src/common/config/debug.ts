// Debug + dev-flow tunables. Anything that toggles diagnostic behavior or skips
// production flow for faster iteration lives here.

export const ENABLE_LOGGING = false;
export const ENABLE_DEBUG_ZONE_AREA = false;
export const DEBUG_COLLISION_ALPHA = 0;

// Spell "ghost" telegraph — a dimmed preview of the real spell that fires immediately
// on cast and lands SPELL_GHOST_LEAD_MS before the real one, so the opposing mage gets
// a reaction window to dodge. Set ENABLED=false to play without telegraphs (e.g. to
// gate behind a future powerup pickup).
//
//   LEAD_MS   = how far ahead of the real spell the ghost lands. 150ms is roughly a
//               human reaction floor; tune up (200) for "easy" or down (100) for "fair".
//   TINT      = ghost color multiplier. Light cyan reads as "not real, but threatening".
//   ALPHA     = ghost opacity. 0.4 is visible but obviously not the real spell.
export const SPELL_GHOST_PREVIEW_ENABLED = false;
export const SPELL_GHOST_LEAD_MS = 250;
export const SPELL_GHOST_TINT = 0x88ddff;
export const SPELL_GHOST_ALPHA = 0.4;

// DEV shortcut: skip the splash → main-menu → lobby → loading chain and jump
// straight into PreloadScene → GameScene with the DataManager defaults. Useful
// when iterating on gameplay tweaks and reloading the page constantly.
// IMPORTANT: leave this false when committing/shipping — multiplayer / match
// setup is bypassed entirely, so this is single-player only.
export const DEV_SKIP_TO_GAMEPLAY = false;
