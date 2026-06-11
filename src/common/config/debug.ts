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

// DEV shortcut: skip splash → main-menu → connect dialogue (name entry + "localhost"
// rune) and boot straight into LobbyScene's lobby browse/create screen. UNLIKE
// DEV_SKIP_TO_GAMEPLAY this still needs a live server connection — LobbyScene auto-
// connects with a default nickname ('Player') to the default IP ('localhost':3000),
// then lands on the lobby list. If that connect fails it falls back to the normal
// connect dialogue so the IP can be corrected. Useful for fast lobby/match iteration.
// IMPORTANT: leave this false when committing/shipping.
export const SKIP_TO_LOBBY = false;

// DEV shortcut: render a small "WIN" button in the bottom-right of GameScene that
// instantly opens the TdmResultsScene (victory screen) with a FAKE MatchEndedPayload —
// the local player as MVP on the winning team with TDM_WIN_TARGET kills. Lets you iterate
// on the results screen without a second browser / actually scoring kills. When a real
// roster is present (matchPlayers) it's reused so the table looks realistic; otherwise a
// minimal solo payload is synthesized. Purely client-side — does NOT touch the server's
// score/win logic. IMPORTANT: leave this false when committing/shipping.
export const DEV_VICTORY_BUTTON = false;

// DEV: simulate the tijolinhos credit STATUS LINE on the results screen without GSI or the
// platform POST (both no-op on localhost, so the real success/error visuals never show
// locally). When set to 'success' or 'error', TdmResultsScene drives the status line
// through the real 'pending' → 'done'/'error' transitions with the computed value, so you
// can verify the text + tints (gold "+N TIJOLINHOS!" / red "ERRO AO CREDITAR :(") on
// localhost. Falls back to the first roster row when there's no networked local stat (WIN
// button under DEV_SKIP_TO_GAMEPLAY). 'off' = real behavior. Leave 'off' when shipping.
export type TijolinhosMockMode = 'off' | 'success' | 'error';
export const DEV_TIJOLINHOS_MOCK: TijolinhosMockMode = 'off';

// DEV: test ONLY the Google login (the real GSI One Tap the credit flow uses), bypassing
// the localhost no-op guard and WITHOUT POSTing to the platform. On the results screen the
// One Tap prompt fires; on success the status line shows the logged-in account (LOGADO:
// <email>) and the full ID token is logged to the console. TAKES PRECEDENCE over
// DEV_TIJOLINHOS_MOCK. Requires this page's origin (e.g. http://localhost:5173) to be an
// AUTHORIZED JS ORIGIN for the shared client id — that's controlled by the platform, NOT
// this repo. If it isn't, GSI logs "origin not allowed" and no prompt shows (test on the
// deployed domain instead). Leave false when shipping.
export const DEV_TIJOLINHOS_TEST_LOGIN = false;
