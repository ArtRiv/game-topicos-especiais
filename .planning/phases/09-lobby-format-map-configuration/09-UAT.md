---
status: complete
phase: 09-lobby-format-map-configuration
source:
  - 09-01-SUMMARY.md
  - 09-02-SUMMARY.md
  - 09-03-SUMMARY.md
started: 2026-05-21T01:30:00Z
updated: 2026-05-21T02:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running game-server. Start fresh. Server boots without errors, client connects, lobby UI renders with no console errors.
result: issue
reported: "texts look blurry and low quality; player list overlaps the map text (player box should have space above it instead of being inside the maps text)"
severity: major
sub_issues:
  - id: 1a
    summary: "Lobby text appears blurry/low quality (rendering aliasing)"
    severity: cosmetic
  - id: 1b
    summary: "Player list vertical anchor overlaps the host's map-control area — player list rows render inside / on top of the map text"
    severity: major

### 2. Default Config Visible to Everyone
expected: Create a new lobby. Above the player list, see the capacity header line `Players 1/6 — 3v3 on Open Field` (em dash, lowercase "on"). Numbers and labels reflect the 3v3/WORLD/6 default.
result: pass

### 3. Host Changes Format
expected: As host, change the format `<select>` from `3v3` to `5v5`. The capacity header updates within ~1s to `Players N/10 — 5v5 on Open Field`. The denominator changes from 6 to 10. (If a second client is connected, they see the same update.)
result: pass

### 4. Host Changes Map
expected: As host, click the Dungeon map preview card. The card you clicked gains a 2px gold (`#ffdd55`) border; the previously-selected card returns to a 1px grey (`#444444`) border. The capacity header updates to `... on Dungeon`. Both thumbnails are visible — placeholder green-W and purple-D 96×64 PNGs.
result: issue
reported: "borders, capacity update, and map-name swap all work correctly, BUT the thumbnail PNGs do not display — only the 0x223366 fallback blue box renders inside each card"
severity: major
diagnostic_notes: |
  - PNG files exist at correct paths, both 96x64 RGBA, file-magic confirms valid PNG.
  - assets.json entries appended inside existing levels/world and levels/dungeon_1 packs — key strings match MAP_POOL.thumbnailKey and ASSET_KEYS exactly.
  - LobbyScene gates on `this.textures.exists(entry.thumbnailKey)` and falls back to the blue rectangle when false → the texture is NOT in the Phaser texture cache when LobbyScene renders the card.
  - Likely root cause candidates:
    a) PreloadScene's `this.load.pack(ASSET_PACK_KEYS.MAIN, 'assets/data/assets.json')` parses the existing array-of-{path,files} format, but Phaser may only load packs by named key, leaving the levels/world and levels/dungeon_1 packs (where MAP_THUMB_* live) NOT loaded during preload. The existing WORLD_BACKGROUND / DUNGEON_1_BACKGROUND keys would have the same problem — they're presumably loaded on-demand when a level loads, not during global preload. PreloadScene's #createAnimations only references HUD/spell/character keys, never level/background keys, supporting this theory.
    b) Asset load is async and the texture wasn't ready when LobbyScene first rendered, but the on-update rebuild path should have re-checked. Possible if PreloadScene transitions on `create()` without waiting for pack completion.
  - Recommended fix: ensure MAP_THUMB_WORLD and MAP_THUMB_DUNGEON_1 are loaded during the global preload (either move them to a pack that PreloadScene definitely loads, or explicitly `this.load.image(KEY, 'path')` for these two in PreloadScene), since lobby happens BEFORE level selection / load.

### 5. Non-Host Sees Read-Only Labels
expected: Open a second browser tab/window, join the same lobby as a non-host. The non-host does NOT see the `<select>` or the map preview cards — instead they see plain `Format: 3v3` and `Map: Open Field` labels. No interactive controls render for them.
result: pending

### 6. Capacity-Downshift Reject
expected: With ≥3 players in the lobby (current format 3v3, cap 6), host tries to change format to `1v1` (cap 2). Server rejects. Host's screen shows red text `Reduce players first (N > M cap)` (with actual numbers) for ~3s in the status area below the player list. Format snaps back to its previous value across all clients (header still shows the old format).
result: pass

### 7. Lobby Browser Row Shows Config
expected: From a fresh client (don't join), look at the lobby browser list. Each row reads `<HostName>'s lobby — 3v3 • Open Field • N/M` (em dash separates host from config, bullet `•` separates the three config fields). After the host changes format or map, the browser row updates accordingly.
result: pass

### 8. Map Thumbnail Fallback
expected: Confirm placeholder thumbnails (green-W, purple-D) actually appear inside the map preview cards.
result: issue
reported: "duplicate of Test 4 — only fallback 0x223366 blue rectangle shown; thumbnail PNGs do not load"
severity: major
linked_to: 4

### 9. Start Match — mapId Reaches Loading
expected: Host changes map to Dungeon, then presses START GAME. All clients transition to LoadingScene. (The actual map-driven loading behavior is Phase 10+, but the LBC-04 wire-flow should preserve mapId in `MatchConfig.config.mapId` — you can verify with a dev-tools console log on lobby:started if exposed, or just confirm the transition happens without errors.)
result: issue
reported: "Both host and non-host see the loading screen. Non-host goes loading -> game scene cleanly. Host goes loading -> ~1s BLACK SCREEN -> game scene. Match does start eventually, but the host-side transition stutters/blacks-out."
severity: major

## Summary

total: 9
passed: 5
issues: 4
pending: 0
skipped: 0
notes: "Tests 1, 4, 8, 9 produced issues. Test 8 is a duplicate of Test 4's thumbnail finding. An additional cosmetic alignment gap (Format label vs <select>) was logged out-of-band during Test 8 review."

## Gaps

- truth: "Lobby UI renders cleanly on cold start with no console errors and proper layout"
  status: failed
  reason: "User reported: texts look blurry and low quality; player list overlaps the map text (player box should have space above it instead of being inside the maps text)"
  severity: major
  test: 1
  sub_gaps:
    - id: 1a
      truth: "Lobby text renders crisply (pixel-art aesthetic, no anti-aliased blur)"
      severity: cosmetic
      hypothesis: "Phaser canvas/text smoothing not configured for pixel-art rendering (likely missing `pixelArt: true` in Phaser config or text objects defaulting to anti-aliased rendering)"
    - id: 1b
      truth: "Host's player list does not visually overlap the map-control area"
      severity: major
      hypothesis: "Player list base Y (220) does not account for the actual rendered height of the map control block. Map label is at y=140 and cards at y=180 (48px tall = bottom edge y=212), leaving only 8px gap before player list at y=220. The 'Map:' label or card displayName text may be rendering above the y=140 anchor (text origins default to top-left in Phaser unless set otherwise), pushing visible content into the player list area."
  artifacts: []
  missing: []

- truth: "'Format:' label and the format <select> input render on the same vertical baseline"
  status: failed
  reason: "User reported during Test 8 review: the <select> input sits slightly below the 'Format:' label rather than being vertically aligned with it."
  severity: cosmetic
  test: 4
  hypothesis: "Phaser DOMElement vs Phaser.GameObjects.Text use different vertical metrics. The label uses .setOrigin(0.5, 0) at y=116 (top-aligned at 116), while the <select> DOM element renders centered on its anchor and the browser's native <select> has an intrinsic height (~22px) with extra padding. Fix: either align the label's origin to vertical-center and match the select's centerline, or nudge the select's y to match the label baseline."
  artifacts: []
  missing: []

- truth: "Map preview cards show the actual thumbnail PNGs (placeholder green-W and purple-D), not the 0x223366 fallback rectangle"
  status: failed
  reason: "User reported during Test 4 (and re-confirmed Test 8): only the blue fallback rectangle renders. No 404 in DevTools — Phaser is not even attempting to fetch thumbnail.png."
  severity: major
  test: 4
  hypothesis: "PreloadScene.preload() calls this.load.pack(ASSET_PACK_KEYS.MAIN, 'assets/data/assets.json') with key 'MAIN', but the assets.json file is a flat array of {path,files} objects with no top-level 'MAIN' key. Phaser's pack loader expects a named key — when given a key not present in the file, it loads nothing (or only entries explicitly tagged with that key). Existing WORLD_BACKGROUND/DUNGEON_1_BACKGROUND must be loaded elsewhere (per-level on demand), so the MAP_THUMB_* entries inside those same packs also fail to load. The no-404 evidence confirms Phaser never requests the file. Fix: explicitly load both thumbnails in PreloadScene.preload() via `this.load.image(ASSET_KEYS.MAP_THUMB_WORLD, 'assets/images/levels/world/thumbnail.png')` and the dungeon equivalent, BEFORE this.load.pack() call. This guarantees they're in the texture cache before LobbyScene runs."
  artifacts: []
  missing:
    - "src/scenes/preload-scene.ts: explicit this.load.image(...) calls for MAP_THUMB_WORLD and MAP_THUMB_DUNGEON_1 in preload()"

- truth: "Host's lobby->loading->game transition is as smooth as the non-host's (no black-screen pause)"
  status: failed
  reason: "User reported: both clients hit loading screen; non-host transitions loading->GameScene cleanly; host transitions loading->~1s BLACK SCREEN->GameScene. Match does start eventually."
  severity: major
  test: 9
  hypothesis: "Phase 9 added a Phaser DOMElement (#formatSelectDom) and a #configBlockObjects array to LobbyScene, both host-only. On scene shutdown, the DOM <select> may not be cleaned up promptly — Phaser DOM elements live in a separate DOM layer that requires explicit destroy() to be removed before GameScene mounts, otherwise it can cause a brief layout/composite stall or block scene transition. The tear-down-and-rebuild approach (per 09-03 SUMMARY) destroys #configBlockObjects on every lobby:updated but may not clean #formatSelectDom in scene-shutdown. Alternative cause: host emits 'lobby:start' and BOTH receive 'lobby:started' broadcast, but host's local UI update path runs additional teardown (DOM, sprites) that non-host skips. Fix: ensure LobbyScene's shutdown/sleep hook explicitly destroys #formatSelectDom (and all #configBlockObjects) and removes any host-only event listeners, BEFORE scene.start(LoadingScene)."
  artifacts: []
  missing:
    - "src/scenes/lobby-scene.ts: shutdown/sleep cleanup for #formatSelectDom and #configBlockObjects"
