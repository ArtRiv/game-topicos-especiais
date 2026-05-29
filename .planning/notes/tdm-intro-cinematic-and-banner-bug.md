---
title: TDM match-intro cinematic sequence + map-name banner bug root cause
date: 2026-05-29
context: exploration — Team Deathmatch game mode
---

## Match-intro cinematic — exact sequence (upgrades the existing Phase 8 COUNTDOWN)

This is the same "moment" as the Phase 8 COUNTDOWN cinematic (camera `zoomTo` + 3-2-1-FIGHT overlay + `#combatLocked`), but the user wants it richer. The new sequence REPLACES the old one and is folded into the Core TDM phase:

1. **Map-name banner** appears (see bug below — fix the reveal duration).
2. Camera starts at the **map center, zoomed OUT** (wider than play zoom). Characters are already at their spawnpoints.
3. Camera **smoothly pans** from map center toward the local player's character.
4. Once the player is centered, camera **zooms IN** to the normal play distance (today's zoom).
5. **UI reveals** — the Q/E radial menu affordance, mana bar, HP all fade/slide in (they should NOT be visible during steps 1–4).
6. **5 → 4 → 3 → 2 → 1** countdown (replaces 3-2-1-FIGHT).
7. At 0, **movement + spell casting unlock** simultaneously on every client (keep host-authoritative COUNTDOWN→ACTIVE gate from Phase 8).

Players are locked at spawn during the whole sequence (existing `#combatLocked` / `#deathLockActive` machinery).

## Banner bug — ROOT CAUSE (per user)

The map-name banner "cuts the last letters." It is **NOT** a container-width / text-origin / mask clip. The user clarified: **the reveal (typewriter/tween) animation is not long enough to finish before it's torn down**, so the final letters never get rendered.

→ Fix = lengthen / re-pace the banner reveal animation (ideally scale its duration to the map name's character count so long names always complete), NOT widening a container. Do not chase a layout red herring.

## Reuse notes for planner

- i-frame system already exists (`Player.iFrameUntil`, from the dash work) — respawn invuln should reuse it.
- Phase 8 already has `camera.zoomTo` + per-tick overlay text + combat lock — extend, don't rewrite from scratch.
- BitmapText font key in use across scenes: `'press_start_2p'` literal (no ASSET_KEYS export).
