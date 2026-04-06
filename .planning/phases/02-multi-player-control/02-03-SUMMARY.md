# Summary: 02-03 Deterministic Team Tinting

**Status:** complete
**Commit(s):**
- `2d5a341` feat(02-03): expose matchPlayers getter on NetworkManager
- `a430c03` feat(02-03): deterministic team tinting via #resolveRemotePlayerTint

## What was built
- Exposed `matchPlayers: readonly PlayerInfo[] ` getter on NetworkManager — provides read-only access to the stable ordered player array populated from the `lobby:started` socket event
- Added `#resolveRemotePlayerTint(playerId: string): number` helper to GameScene
- Remote players now get team-based colors: Team A → blue (`0x0055ff`), Team B → red (`0xdd2200`) from matchConfig
- Stable fallback using `(playerIndex + 1) % len` prevents white bleed on remote players when team is unassigned
- Offline fallback uses `(remotePlayers.size + 1) % len` when NetworkManager is unavailable (try/catch guard)
- Removed non-deterministic slot-count-based tint assignment from `#onRemotePlayerUpdate`

## Key files changed
- `src/networking/network-manager.ts` — added `get matchPlayers(): readonly PlayerInfo[]` after `get isConnected()`
- `src/scenes/game-scene.ts` — added `PlayerInfo` to networking types import, replaced slot tint with `#resolveRemotePlayerTint`, added helper method

## Decisions made
- `try/catch` wrapping `NetworkManager.getInstance()` is kept consistent with existing pattern in `#setupNetworking` and `#onRemotePlayerUpdate` — GameScene can run solo/offline
- `#PLAYER_TINT_PALETTE[0]` (white) is reserved for local player; remote players use `+1` offset for the unassigned stable-index branch
- `PlayerInfo.team` is optional (`team?: number`) — both `undefined` and unknown values fall through to palette fallback

## Verification passed
- [x] pnpm tsc --noEmit — no errors in src/ (pre-existing node_modules errors are unchanged and unrelated)
- [x] All 4 branches in `#resolveRemotePlayerTint` implemented:
  - `team === 0` → `0x0055ff` (blue)
  - `team === 1` → `0xdd2200` (red)
  - no team, found in matchPlayers → `palette[(playerIndex + 1) % len]`
  - not in matchPlayers / offline → `palette[(remotePlayers.size + 1) % len]`
