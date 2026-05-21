---
phase: 09-lobby-format-map-configuration
plan: 02
subsystem: assets
tags: [assets, preload, lobby, thumbnails]
requires:
  - public/assets/images/levels/world/ (existing dir)
  - public/assets/images/levels/dungeon_1/ (existing dir)
  - src/common/assets.ts (existing ASSET_KEYS export)
provides:
  - ASSET_KEYS.MAP_THUMB_WORLD: 'MAP_THUMB_WORLD'
  - ASSET_KEYS.MAP_THUMB_DUNGEON_1: 'MAP_THUMB_DUNGEON_1'
  - public/assets/images/levels/world/thumbnail.png (96x64 PNG)
  - public/assets/images/levels/dungeon_1/thumbnail.png (96x64 PNG)
  - assets.json: two new image entries in existing levels/world and levels/dungeon_1 packs
affects:
  - PreloadScene (no code change; picks up new entries automatically via existing this.load.pack call)
  - Plan 09-03 LobbyScene MapPreviewCard (consumes ASSET_KEYS.MAP_THUMB_* by constant)
tech-stack:
  added: []
  patterns:
    - Asset-pack image-entry pattern (assets.json) — extended existing level packs rather than adding new pack entries
    - SCREAMING_SNAKE ASSET_KEYS convention preserved (UI-SPEC's kebab-case illustration reconciled to existing convention)
key-files:
  created:
    - public/assets/images/levels/world/thumbnail.png
    - public/assets/images/levels/dungeon_1/thumbnail.png
  modified:
    - public/assets/data/assets.json
    - src/common/assets.ts
decisions:
  - Solid-color placeholder PNGs (96x64) chosen over downscaled backgrounds — generated programmatically, real pixel-art swap-out tracked in .planning/todos/pending/2026-05-21-replace-map-thumbnail-placeholders.md
  - SCREAMING_SNAKE thumbnail keys (MAP_THUMB_WORLD / MAP_THUMB_DUNGEON_1) — matches existing ASSET_KEYS convention; pattern-mapper recommendation honored
  - assets.json entries appended to EXISTING levels/world and levels/dungeon_1 packs (not new pack entries) — load happens in same round-trip as other level assets
metrics:
  duration: ~15min
  completed: 2026-05-21
  tasks_completed: 3
  files_changed: 4
---

# Phase 09 Plan 02: Map Thumbnail Assets Summary

Registered two 96x64 placeholder map thumbnails (Open Field / Dungeon) as Phaser texture keys MAP_THUMB_WORLD and MAP_THUMB_DUNGEON_1 so Plan 03's MapPreviewCard component has textures to render — backs LBC-04 preview metadata.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Author thumbnail PNGs (placeholder) | 6b33404 | public/assets/images/levels/world/thumbnail.png, public/assets/images/levels/dungeon_1/thumbnail.png |
| 2 | Register thumbnails in assets.json | accab5e | public/assets/data/assets.json |
| 3 | Add ASSET_KEYS constants | d12efb6 | src/common/assets.ts |

## Asset Details

**Thumbnails on disk (placeholder mode):**

| Path | Dimensions | Size | Content |
|------|------------|------|---------|
| public/assets/images/levels/world/thumbnail.png | 96x64 | 352 bytes | Solid green "W" placeholder |
| public/assets/images/levels/dungeon_1/thumbnail.png | 96x64 | 338 bytes | Solid purple "D" placeholder |

Both files are valid PNGs at exactly 96x64 pixels (verified via System.Drawing.Image).

**Placeholder decision:** The thumbnails are temporary solid-color PNGs generated programmatically. Real pixel-art (either hand-authored or ImageMagick `-filter Point` downscales of the existing `world_background.png` / `dungeon_1_background.png`) will replace them later. The swap-out work item is tracked at `.planning/todos/pending/2026-05-21-replace-map-thumbnail-placeholders.md`. Plan 03 will also implement a `0x223366` solid-rectangle runtime fallback per UI-SPEC, so the system is robust even if a thumbnail is missing.

## assets.json Changes

Two new image entries appended to existing level packs (no new pack entry created — entries ride along with the same `this.load.pack(ASSET_PACK_KEYS.MAIN, ...)` call):

```json
// inside { "path": "assets/images/levels/dungeon_1", "files": [ ... ] }
{ "type": "image", "key": "MAP_THUMB_DUNGEON_1", "url": "thumbnail.png" }

// inside { "path": "assets/images/levels/world", "files": [ ... ] }
{ "type": "image", "key": "MAP_THUMB_WORLD", "url": "thumbnail.png" }
```

JSON remains valid (`node -e "JSON.parse(...)"` smoke test prints `OK`).

## ASSET_KEYS Constants Added

```ts
// src/common/assets.ts, inside the ASSET_KEYS `as const` literal,
// grouped with the WORLD_* level keys:
MAP_THUMB_WORLD: 'MAP_THUMB_WORLD',
MAP_THUMB_DUNGEON_1: 'MAP_THUMB_DUNGEON_1',
```

Key name and string value are identical — matches the asset-pack `key` field added in Task 2 and the `thumbnailKey` strings declared in `MAP_POOL` in Plan 01. Three places, one identifier.

## PreloadScene

Not modified. PreloadScene already invokes `this.load.pack(ASSET_PACK_KEYS.MAIN, 'assets/data/assets.json')` — the new asset-pack entries are picked up automatically on the next load.

## Verification

- [x] Both thumbnail PNG files exist at exactly 96x64 (verified via `System.Drawing.Image::FromFile`)
- [x] `node -e "JSON.parse(...)"` on assets.json exits 0 (file remains valid JSON)
- [x] `grep MAP_THUMB_WORLD assets.json` returns one match, inside the `levels/world` pack
- [x] `grep MAP_THUMB_DUNGEON_1 assets.json` returns one match, inside the `levels/dungeon_1` pack
- [x] `grep MAP_THUMB_WORLD src/common/assets.ts` returns one match, key value identical to key name
- [x] `npx tsc --noEmit -p tsconfig.json` produces ZERO new errors on changed files; only pre-existing errors in `node_modules` (vite/rollup moduleResolution + lib.dom.d.ts TextDecoder/TextEncoder) remain — identical output before and after the change (verified via `git stash` round-trip)
- [x] PreloadScene not modified

## Deviations from Plan

### Auto-fixed Issues

None — the only operational note is the documented Task 1 placeholder choice (resolved before this executor ran; see checkpoint_pre_resolved context).

### Pre-existing Issues (Out of Scope)

- `npx tsc --noEmit` reports 5 errors, all in `node_modules` (game-server/node_modules/vite, node_modules/vitest, node_modules/typescript/lib.dom.d.ts) and unrelated to this plan. Verified identical before and after the change via `git stash`. Not fixed (scope boundary — pre-existing tooling/dependency issue, not introduced by this plan).

## Deferred Issues

None.

## Self-Check: PASSED

Verified after writing summary:

- `public/assets/images/levels/world/thumbnail.png` — FOUND (96x64, 352 bytes)
- `public/assets/images/levels/dungeon_1/thumbnail.png` — FOUND (96x64, 338 bytes)
- `public/assets/data/assets.json` — contains MAP_THUMB_WORLD and MAP_THUMB_DUNGEON_1
- `src/common/assets.ts` — contains MAP_THUMB_WORLD and MAP_THUMB_DUNGEON_1 in ASSET_KEYS
- Commit 6b33404 — FOUND (Task 1)
- Commit accab5e — FOUND (Task 2)
- Commit d12efb6 — FOUND (Task 3)
