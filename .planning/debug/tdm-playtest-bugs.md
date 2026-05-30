---
status: fixed-pending-replaytest
phase: 14-core-team-deathmatch-mode
created: 2026-05-29
updated: 2026-05-29
source: two-client + six-client (school LAN) live playtests (14-HUMAN-UAT.md)
---

## Round 2 resolution (2026-05-29) — 2-client + 6-client LAN playtest

Second playtest (2 clients local + 6 PCs on the school LAN) surfaced six more issues. All fixed;
commits below. Re-run a 2-client AND a 6-client playtest to confirm on-screen.

- **03aa5c1** — #3 (HP stuck at "half a heart"): HP is now SERVER-AUTHORITATIVE in TDM. The client
  SETs local HP from `DamageConfirmedPayload.targetHp` (added server-side last round) instead of
  subtracting locally; the old "floor local HP at 1" hack is gone. `LifeComponent.setLife(value)`
  added. `#onDamageConfirmed` (local TDM target): setLife + HUD refresh + hurt flash while alive,
  and NEVER drives DEATH_STATE (death/respawn stay server-authoritative). `#onRespawn` now refreshes
  the HUD after `resetToFull` so the heart bar actually refills on respawn (the real cause of the
  "stuck" bar: resetToFull mutated only the LifeComponent, never the DataManager-backed HUD).

- **6eaab44** — #1 + #2 (no match-start cinematic / spawned in the middle): ROOT CAUSE — LoadingScene's
  ~8s cinematic outlasts the server's 5.5s countdown (`COUNTDOWN_DURATION_MS + FIGHT_HOLD_MS`), so the
  server fires COUNTDOWN → 5 ticks → ACTIVE → `match:spawns` while LoadingScene is still up; GameScene
  is born only afterwards and never receives any of them. FIX: GameScene runs its OWN intro on boot
  (`#maybeStartLocalIntro`) — reuses `#enterCountdownMode` (lock + camera pan + banner) but drives the
  digits from a LOCAL 5→1 timer (`#runLocalCountdown`), independent of the already-passed server
  COUNTDOWN. `#localIntroRan` makes the server-driven `#onMatchStateChanged`/`#onCountdownTick` no-ops
  so a stray transition can't fight it. Spawns: GameScene calls `NetworkManager.sendSceneReady()` →
  server `match:scene-ready`; the server now PERSISTS the match-start spawns on the GameRoom
  (`setMatchSpawns` at COUNTDOWN→ACTIVE) and replays them to the requesting socket → `#onMatchSpawns`
  snaps players to their team spawnpoints. Server keeps its own timing for damage gating.

- **9e40604** — #4 (team tint lost on hit / respawn): `juice-utils.flash()` captured the prior tint
  up front and restores it after each white flash instead of hard `setTint(0xffffff)` (which wiped the
  team color). `#onRespawn` re-applies the team tint via a new `#applyTeamTint` helper (was a bare
  `clearTint()`). The LOCAL player is now team-tinted too (`#setupPlayer`, TDM-only) — previously only
  remotes were tinted. `#resolveRemotePlayerTint` → `#resolvePlayerTint` (serves local + remote).

- **cf9a3b6** — #6 (SKIP_TO_LOBBY dev flag) + the "hitting enter after localhost gets stuck" hang.
  HANG ROOT CAUSE: NetworkManager bound only `connect`/`disconnect`, never socket.io's `connect_error`
  — which is what fires when the INITIAL handshake fails (server not up, or "localhost" resolving to
  the student's own machine when the page is served over `vite --host`). With neither NETWORK_CONNECTED
  nor NETWORK_DISCONNECTED firing, the connect dialogue hung forever on "Abrindo o portal...". Bridged
  `connect_error` → NETWORK_DISCONNECTED (scoped to not-yet-connected) so the dialogue rewinds + retries.
  SKIP_TO_LOBBY (`src/common/config/debug.ts`, wired in `main.ts` + `lobby-scene.ts`): boot straight to
  the lobby list, auto-connecting with default nick 'Player' to localhost:3000; falls back to the normal
  dialogue on connect failure.

- **a0634b5** — #5 (host freeze at 6-machine match start): the host (players[0]) is the offerer for ALL
  peers, so `#initWebRTCMesh` fired all 5 createOffer synchronously in one forEach — a PC+channels+ICE
  storm that stalled the host's main thread (never reproduced in CI / 2-client: fake RTC has no ICE
  cost). FIX: stagger the host's offers across separate macrotasks (`offerSlot * 30ms`); roles stay
  deterministic so only timing changes (~150ms total spread for 6 players). Pending stagger timers are
  cleared in `teardownMesh`.

Gates (each commit): frontend project-source tsc clean; game-server tsc clean + 42 tests pass. The
networking throughput/mesh-formation tests are pre-existing FLAKY timing tests (failure count varied
15→13→0 across runs, independent of these changes — see deferred-items.md); the stable baseline is the
thunder-strike/spell-registry config failures + stale `dist/**` copies.

NEXT: re-run a 2-client AND a 6-client playtest to confirm all six behaviors on-screen, then update
14-HUMAN-UAT.md results.

---

## Round 1 resolution (2026-05-29)

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
