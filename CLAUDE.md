# Mages — Project Notes

## Project-local Phaser 4 skills

There is a `skills/` directory at the repo root containing curated Phaser 4 reference skills. **Before planning, discussing, or implementing anything that touches one of these areas, read the matching `skills/<topic>/SKILL.md` first** — it has Phaser-4-specific syntax, key source paths, and patterns that save round-trips.

Available skill folders (each has a `SKILL.md`; some also have `references/`):

- `actions-and-utilities`
- `animations`
- `audio-and-sound`
- `cameras`
- `curves-and-paths`
- `data-manager`
- `events-system`
- `filters-and-postfx`
- `game-object-components`
- `game-setup-and-config`
- `geometry-and-math`
- `graphics-and-shapes`
- `groups-and-containers`
- `input-keyboard-mouse-touch`
- `loading-assets`
- `particles`
- `physics-arcade`
- `physics-matter`
- `render-textures`
- `scale-and-responsive`
- `scenes`
- `sprites-and-images`
- `text-and-bitmaptext`
- `tilemaps`
- `time-and-timers`
- `tweens`
- `v3-to-v4-migration`
- `v4-new-features`

Trigger examples: any work on tween / animate / ease → `tweens/SKILL.md`. Scene transitions/lifecycle → `scenes/SKILL.md`. HUD/results text rendering → `text-and-bitmaptext/SKILL.md`. Lobby/menu camera or fade transitions → `cameras/SKILL.md` and `tweens/SKILL.md`. Migrating old patterns → `v3-to-v4-migration/SKILL.md`.

These are project-local (not the `~/.claude/skills/` GSD slash commands) and are NOT auto-loaded — you must Read them explicitly when relevant.
