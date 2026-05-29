---
phase: 14-core-team-deathmatch-mode
reviewed: 2026-05-29T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - game-server/src/game-room.ts
  - game-server/src/game-room.test.ts
  - game-server/src/server.ts
  - game-server/src/types.ts
  - src/common/config/index.ts
  - src/common/config/tdm.ts
  - src/common/event-bus.ts
  - src/common/runtime-config.ts
  - src/debug/debug-panel.ts
  - src/main.ts
  - src/networking/network-manager.ts
  - src/networking/types.ts
  - src/scenes/game-scene.ts
  - src/scenes/scene-keys.ts
  - src/scenes/tdm-results-scene.ts
  - src/scenes/ui-scene.ts
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-05-29
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Reviewed the Phase 14 Core Team Deathmatch implementation: server-authoritative TDM
scoring + win condition (game-room.ts / server.ts / types.ts), the client HUD score plate
and cinematic HUD reveal (ui-scene.ts), the intro camera cinematic + respawn-invuln pulse
+ results launcher (game-scene.ts), the results overlay scene (tdm-results-scene.ts), the
network bridges (network-manager.ts / event-bus.ts), and the config/debug tunables.

The server-authoritative damage and scoring pipeline is well guarded against client trust:
team is read only from server-side `#playerInfo` (never from the wire), FF is short-circuited
in `validateHit` before any damage/score path, damage is capped, hits are deduped by spellId,
and respawn invuln is server-authoritative with the client pulse explicitly cosmetic. No
critical (security / crash / data-loss) issues were found.

The issues that do exist are correctness/robustness edge cases: a stray `match:team-score`
broadcast on a no-team caster, a results table that overflows the 320px canvas for large
lobbies, a stale client-side type comment, and a couple of defensive-hardening gaps. None
block the mode from functioning in the common 2v2–5v5 case.

## Warnings

### WR-01: TDM results table overflows the canvas for large lobbies

**File:** `src/scenes/tdm-results-scene.ts:105-142`
**Issue:** Rows are laid out at `TABLE_FIRST_ROW_Y (116) + i * ROW_PITCH (16)` with no clamp
or scroll. The lobby supports up to 10v10 (20 players → 20 rows). The 20th row lands at
`116 + 19*16 = 420`, well past the 320px canvas height and past the RETURN TO LOBBY button at
`BUTTON_Y = 276`. Rows will render off-screen and collide with the button for any lobby larger
than roughly 5v5 (10 rows reach y=260, already crowding the button). The scene's docstring
claims it is "Robust to a missing/partial payload ... never blank-screen" but does not handle
a full-size roster.
**Fix:** Cap visible rows and/or scale the layout to the roster size. Minimal version:
```ts
const MAX_VISIBLE_ROWS = 9; // keep clear of BUTTON_Y
const visible = rows.slice(0, MAX_VISIBLE_ROWS);
// optionally shrink ROW_PITCH when rows.length is large:
const pitch = rows.length > 10 ? 12 : ROW_PITCH;
visible.forEach((stat, i) => {
  const rowY = TABLE_FIRST_ROW_Y + i * pitch;
  // ...
});
```
A two-column (team A left / team B right) layout would also resolve this and matches the
team-split intent of the data.

### WR-02: `match:team-score` is broadcast even when no team was actually scored

**File:** `game-server/src/server.ts:333-341`
**Issue:** Inside the `team-deathmatch` block, `recordDeath` + the `match:team-score`
broadcast run unconditionally on every confirmed elimination. `addTeamKill` is correctly a
no-op when the caster has no team (game-room.ts:324), but the score broadcast still fires with
`lastScoringTeam = room.getTeam(claim.casterId) ?? 0`. For a teamless caster (FFA player in a
TDM room — not expected this phase but structurally reachable), this emits a `match:team-score`
with unchanged scores and `lastScoringTeam: 0`, causing the client to play the score-pop tween
on Team A's plate despite no score change. Cosmetic, but it is a real desync between the pop
animation and the actual score.
**Fix:** Only broadcast when a kill was actually credited:
```ts
if (room.matchMode === 'team-deathmatch') {
  room.recordDeath(claim.targetId);
  const casterTeam = room.getTeam(claim.casterId);
  if (casterTeam === 0 || casterTeam === 1) {
    room.addTeamKill(claim.casterId);
    const scores = room.getTeamScores();
    io.to(`lobby:${lobbyId}`).emit('match:team-score', { teamScores: scores, lastScoringTeam: casterTeam });
    // ... win-check using scores
  }
}
```
This also removes the redundant `isSameTeam` re-check (FF is already filtered in `validateHit`).

### WR-03: Client `MatchCountdownTickPayload` type comment is stale and contradicts the server

**File:** `src/networking/types.ts:178-184`
**Issue:** The client mirror still documents the old 3→FIGHT cadence:
`remaining: number; // 3, 2, 1, 0` and `label: string; // '3' | '2' | '1' | 'FIGHT'`. The
server (types.ts:104-114, server.ts:61-67) now emits a 5→4→3→2→1 cadence and the docblock there
explicitly says the old `3 → 2 → 1 → FIGHT` sequence was replaced. The two protocol-mirror files
disagree. The runtime types are still `number`/`string` so nothing breaks, but the comment will
mislead anyone reading the client side and the files are explicitly required to be kept in sync.
**Fix:** Update the client comment to match the server:
```ts
remaining: number;   // 5 | 4 | 3 | 2 | 1 (Phase 14 cadence; permissive number for future modes)
label: string;       // '5' | '4' | '3' | '2' | '1'
```

### WR-04: Client/server SPAWNPOINTS duplication has no sync guard

**File:** `game-server/src/game-room.ts:16-20` and `src/common/config/tdm.ts:8-12`
**Issue:** The `SPAWNPOINTS` literal is hand-duplicated in the server and the client with only a
"KEEP IN SYNC" comment enforcing it. The debug-panel COPY VALUES button (debug-panel.ts:283-315)
emits a single literal that must be pasted into BOTH files manually. A drift between the two
silently produces mismatched spawn positions (server places the player at one coordinate, client
art/expectations assume another) with no test or build-time check. There is also no test covering
`pickSpawn`'s map/team fallback paths (unknown mapId → WORLD, undefined team → teamA) despite the
docstring asserting them.
**Fix:** At minimum add a server test asserting the two literals match (import both, deep-equal),
or generate one from the other at build time. Add `pickSpawn` unit tests for the documented
fallback branches (unknown map, no team, empty enemy list, overflow roster).

## Info

### IN-01: `pickSpawn` empty-list fallback `{100,100}` may be inside a wall

**File:** `game-server/src/game-room.ts:190`
**Issue:** When a map's team spawn list is empty, `pickSpawn` returns a hardcoded `{x:100,y:100}`.
All three real maps define non-empty lists so this is unreachable today, but the magic literal has
no guarantee of being a valid (non-collider) tile and is documented only inline.
**Fix:** Promote to a named constant (e.g. `FALLBACK_SPAWN`) and add a code comment noting it is a
last-resort that may not be collision-safe, or fall back to the map center derived from bounds.

### IN-02: Magic numbers in the intro cinematic and banner pacing

**File:** `src/scenes/game-scene.ts:3819-3823, 3874-3878`
**Issue:** The cinematic (`OUT_ZOOM`, `PAN_MS`, `ZOOM_IN_MS`, `CENTER_HOLD_MS`) and the banner
(`BANNER_MS_PER_CHAR`, clamps, hold, fade) timing literals are inline locals. They are within the
UI-SPEC ranges per the comments, but as the project's own MEMORY note prefers, these are exactly
the kind of feel-tuning values that benefit from the `*_TUNING` + debug-panel loop already used
elsewhere in the codebase.
**Fix:** Optionally hoist into a `TDM_CINEMATIC_TUNING` block (or RUNTIME_CONFIG) so they can be
dialed live like SPAWNPOINTS rather than recompiled.

### IN-03: Cinematic total duration is not coupled to the server COUNTDOWN span

**File:** `src/scenes/game-scene.ts:3818-3855`
**Issue:** The client cinematic runs `CENTER_HOLD_MS(400) + PAN_MS(1100) + ZOOM_IN_MS(900) = 2400ms`
of camera motion, while the server unlocks ACTIVE at `COUNTDOWN_DURATION_MS + FIGHT_HOLD_MS = 5500ms`.
The two are independent literals in different processes. They currently leave comfortable margin, but
nothing enforces "cinematic finishes before ACTIVE", and `#exitCountdownMode` only cancels the banner,
not an in-flight camera pan/zoomTo (a very early ACTIVE would leave the camera mid-tween, though the
final `startFollow` would still correct it). Low risk given the 3.1s margin.
**Fix:** Add a comment cross-referencing the server 5500ms budget, and consider calling
`cam.stopFollow()`/cancelling pending camera tweens (or `cam.pan(..., force)`) in `#exitCountdownMode`
so an early ACTIVE snaps cleanly.

### IN-04: HUD reveal relies on a frame-budget race between cinematic emit and the 6s fallback

**File:** `src/scenes/ui-scene.ts:90, 305-307` and `src/scenes/game-scene.ts:3851`
**Issue:** `HUD_REVEAL_FALLBACK_MS = 6000` must exceed the cinematic's reveal time, which it does. The
guard `if (!this.#hudRevealed && now > 6000)` is correct and `#onHudReveal` is idempotent, so a double
reveal just snaps to alpha 1. This is fine; flagged only because the 6000 fallback and the cinematic's
~2.4s + COUNTDOWN 5.5s timeline are three separate constants in two processes with an implicit ordering
contract (also see IN-03).
**Fix:** Comment the fallback with the exact relationship to the server 5500ms span (already partially
done) and to the cinematic emit point.

### IN-05: `getMvpPlayerId` returns a player even with zero kills across the board

**File:** `game-server/src/game-room.ts:356-369`
**Issue:** Because `bestKills` starts at `-1`, the first registered player (0 kills) is always selected
as MVP when nobody has scored. For a TDM match that ends on the win target this cannot happen, but a
match that ends some other way (e.g. future timeout mode) would crown an arbitrary 0-kill "MVP". Works
for this phase's single win path.
**Fix:** Optionally return `null` when `bestKills <= 0`, or document that MVP is only meaningful for a
kill-target win.

### IN-06: `clearInvuln` is dead code in the Phase 14 wiring

**File:** `game-server/src/game-room.ts:305-307`
**Issue:** `clearInvuln` is defined and documented as a "server-side hook" but is never called anywhere
in server.ts or game-room.ts (the client move/cast cancel is cosmetic-only and intentionally does not
call it). It is harmless API surface but currently unused.
**Fix:** Either wire it to a server-side early-cancel trigger or drop it until needed, to keep the
authoritative surface minimal.

---

_Reviewed: 2026-05-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
