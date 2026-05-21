---
created: 2026-05-21T00:00:00.000Z
title: Menu & Lobby motion / transitions (Phaser animations)
area: ui
files:
  - src/scenes/main-menu-scene.ts
  - src/scenes/lobby-scene.ts
---

## Problem

The game's transitions and "scene-life" moments feel static. Specifically:

- **Main menu** — the "click anything to..." screen jumps straight into the lobby browser after the click. No celebratory / cinematic transition tied to the menu music that was added recently.
- **Lobby start** — when the host starts the match, the lobby → loading/countdown handoff lacks a visual flourish; could feel more dramatic for the live event crowd.
- Likely more transitions worth polishing (scene-to-scene, between game states, on death/elimination, etc.) — to be catalogued.

## Idea

Author a deliberate motion pass for the pre-match flow:

1. **Main-menu click transition** — when the user clicks past "click anything to..." play a short animation that visually syncs with the menu music (beat hits, swell, drop). Could be a flash, camera shake, particle burst, text dissolve, logo wipe — needs design exploration.
2. **Lobby start animation** — between "host clicks Start" and the LOADING screen, play a transition that telegraphs "match incoming" (e.g. UI panels slide off, screen darkens, music ducks, sigil/logo whoosh).
3. **Audit other scene boundaries** for motion gaps once inspiration is collected.

## Notes / Open Questions

- Need to gather Phaser-specific references first — what's idiomatic, what plugins exist (`phaser3-rex-plugins`, built-in `Tweens`, `Timeline`, camera effects).
- Need to capture concrete inspirations (videos, GIFs, other games) before locking scope.
- Music sync may need `Phaser.Sound` events / beat markers — investigate during research.
- Out of scope of Phase 9 (lobby format/map config). This is a separate "motion & polish" phase to plan later once references are gathered.

## Next Step

When ready: gather references → flesh out spec → promote to a real phase via `/gsd-add-phase` → `/gsd-ui-phase` → `/gsd-plan-phase`.
