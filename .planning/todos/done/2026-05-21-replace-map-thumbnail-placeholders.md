---
created: 2026-05-21
source: phase-09 plan 09-02 checkpoint
priority: low
---

# Replace placeholder map thumbnails with real art

Phase 9 shipped with solid-color placeholder thumbnails (green "W" / purple "D") because the real maps were still being built from the tileset. Replace once map art is finalized.

## Files to replace

- `public/assets/images/levels/world/thumbnail.png` (Open Field — currently green w/ "W")
- `public/assets/images/levels/dungeon_1/thumbnail.png` (Dungeon — currently purple w/ "D")

## Constraints

- Exactly 96×64 px PNG
- Pixel-art aesthetic, no anti-aliasing
- No baked-in border (lobby UI draws its own 2px gold selected / 1px grey unselected border)
- No baked-in text (displayName rendered as separate label below the card)

## How

Either hand-pixel each thumbnail or downscale the finished background with:
```
magick public/assets/images/levels/<map>/<bg>.png -resize 96x64^ -gravity center -extent 96x64 -filter Point public/assets/images/levels/<map>/thumbnail.png
```

Zero code change required — `assets.json` + `ASSET_KEYS.MAP_THUMB_*` already wired in Phase 9 Plan 02.
