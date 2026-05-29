---
status: fixed-pending-replaytest
phase: 14-core-team-deathmatch-mode
created: 2026-05-29
updated: 2026-05-29
source: two-client live playtest (14-HUMAN-UAT.md)
---

## Resolution (2026-05-29)

All five fixed. Commits:
- f224748 — #1 + #3: TDM death is server-authoritative; local HP-zero no longer routes to
  GAME_OVER (floored at 1 in TDM); NetworkManager tracks matchMode/isTeamDeathmatch.
- 2acf55b — #4: server broadcasts match:spawns at COUNTDOWN→ACTIVE; client snaps local+remote
  players to team spawnpoints (SpawnAssignment[]/MatchSpawnsPayload + NETWORK_MATCH_SPAWNS).
- 11da8fc — #2: respawn invuln is cosmetic-only (no longer sets Player.iFrameUntil, which was
  swallowing all confirmed damage one-directionally).
- 75cbfc0 — #5: banner pacing slowed (120ms/char, 1100ms floor, 900ms hold) + spawn-in cue
  (sprite pop + expanding ring).

Gates: game-server tsc clean + 79 tests pass; frontend project-source tsc clean.
NEXT: re-run the two-client playtest to confirm all five behaviors on-screen, then update
14-HUMAN-UAT.md results.


# TDM Playtest Bugs — Diagnosis & Fix Plan

Five symptoms reported from the first two-client team-deathmatch playtest. All trace to a
small number of root causes around the boundary between the legacy single-player death path
and the new Phase-14 server-authoritative TDM flow.

## Root causes

1. **Drop to GameOver instead of respawn (intermittent).**
   `#onDamageConfirmed` (game-scene.ts:3494) calls `this.#player.hit()`. On HP→0 the
   LifeComponent/state-machine drives DEATH_STATE → emits `PLAYER_DEFEATED`
   (death-state.ts:50) → `#handlePlayerDefeatedEvent` (game-scene.ts:4800) →
   `scene.start(GAME_OVER_SCENE)`. This races the TDM `#onElimination`/`#onRespawn` flow.
   Intermittent because it depends on death-anim vs server-broadcast timing.
   FIX: In a TDM match, the local HP-zero must NOT route to GameOver. Death+respawn become
   fully server-authoritative (#onElimination death overlay → #onRespawn reposition).

2. **Invuln asymmetry after respawn.**
   On respawn the client sets `#player.iFrameUntil = #invulnUntil` (~2.5s, game-scene.ts:3619)
   and `#onDamageConfirmed` drops ALL local confirmed damage during that window
   (game-scene.ts:3486). Combined with the death race, invuln gets out of sync between
   clients → one side appears unhittable. FIX: keep the server as the sole damage authority;
   the client iFrame should be cosmetic-only (don't let it permanently swallow confirmed
   damage past the server's window), and ensure invuln is cleared cleanly on the real respawn.

3. **Kill count not incrementing.**
   All TDM scoring lives in the server `result.eliminated` branch (server.ts:316), which only
   fires when the SERVER's applyDamage crosses HP→0. Server HP and client HP are tracked
   independently and desync — plus bug #1 yanks the dying client to GameOver mid-round.
   FIX: fixing #1 keeps the round intact; verify server applyDamage path actually reaches
   eliminated (server HP seeded at registerPlayer = maxHp, decremented by confirmed hits).

4. **Spawn in the middle, not team A/B spawnpoints.**
   `#setupPlayer` (game-scene.ts:4242) always positions the player at the tilemap door spot.
   The server computes farthest-from-enemy team spawns at COUNTDOWN→ACTIVE (server.ts:106) but
   NEVER broadcasts them — only the per-respawn RespawnPayload carries a server spawn.
   FIX: broadcast initial spawns at match start (match:spawns payload, list of {playerId,x,y});
   client applies its own + remotes before gameplay unlocks.

5. **No spawn/match-start animation; only a short typewriter.**
   The intro cinematic only runs on the COUNTDOWN state-change (#onMatchStateChanged,
   game-scene.ts:3714). If COUNTDOWN is missed/already-past when GameScene subscribes, only
   the banner shows. Banner reveal is also fast (70ms/char, 600ms floor).
   FIX: lengthen banner pacing; ensure the cinematic plays; add a spawn-in cue when the player
   is placed at its team spawn.

## Fix order
#1 + #3 (server-auth death/respawn keeps the round intact) → #4 (broadcast spawns) →
#2 (invuln cosmetic-only) → #5 (cinematic/animation feel). Verify with a fresh 2-client run.
