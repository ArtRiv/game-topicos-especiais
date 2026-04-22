# Research Summary — Mages v2.0 PvP Event Multiplayer

**Synthesized:** 2026-03-26  
**Sources:** STACK.md · FEATURES.md · ARCHITECTURE.md · PITFALLS.md  
**Confidence:** HIGH across all areas

---

## Executive Summary

Mages v2.0 is a competitive, real-time PvP web game playable at a live college event (~50–100 players). The established pattern for this class of game is: **server-authoritative game loop** over socket.io rooms, with Google OAuth handled entirely on the server and JWT passed via the socket.io handshake. All spell hit detection runs on the server; Phaser handles only visuals and local movement feel. This architecture eliminates the two largest risk classes (client-side cheat, physics desync) at the cost of one new `server/` sub-project.

The stack choice is clear: Express + socket.io + better-auth + SQLite (via better-sqlite3 + drizzle-orm) gives a self-contained, zero-cloud, zero-ops server that fits a 2-dev team on a 3-month timeline. SQLite is not a compromise for this scale — it handles 2000+ queries/second, requires no server process, and its entire state is a single file. Backup = copy the file.

The biggest development risk is not technical complexity — it is **time compression**: single-day event players will experience the full XP/level spread in 4 hours, not months. Level advantages must be capped at ≤15% stat delta. Deploy early (week 2), test on the real campus WiFi, and reserve the final week for stability-only work.

---

## Key Findings

### Stack Additions (server/ sub-project + 1 client package)

| Layer | Package | Version | Purpose |
|-------|---------|---------|---------|
| HTTP | `express` | 5.2.1 | REST API + socket.io host |
| Real-time (server) | `socket.io` | 4.8.3 | Lobbies, game loop, events |
| Real-time (client) | `socket.io-client` | 4.8.3 | Phaser → server bridge |
| Auth | `better-auth` | 1.5.6 | Google OAuth, sessions, user records |
| Database | `better-sqlite3` | 12.8.0 | All persistence (self-hosted, no cloud) |
| ORM | `drizzle-orm` | 0.45.1 | Type-safe queries |
| Migrations | `drizzle-kit` | 0.31.10 | Schema push / migration files |
| CORS | `cors` | 2.8.6 | Exact-origin allow-list with `credentials: true` |
| JWT | `jsonwebtoken` | 9.0.3 | Socket handshake token after login |
| Ranking | Custom Elo | — | 5-line formula, no library needed |

**Not added:** Redis, PostgreSQL, Prisma, Firebase, GraphQL, Colyseus, NextAuth, WebRTC.

---

### Feature Table Stakes

#### Auth / Accounts
- Google OAuth via `better-auth` — redirect flow on server only, never in Phaser client
- JWT issued from `GET /api/game-token` after cookie session; passed in socket.io handshake `auth.token`
- "Continue as [Name] or Switch Account?" prompt on page load (shared event machines)
- Prominent logout button on main menu; return to login screen after match ends

#### Lobby System
- 6-char invite code (server-generated, collision-checked); shareable link
- Player list with ready-state toggle; host controls mode and start
- Lobby state machine: `WAITING → STARTING → IN_MATCH` — no joins accepted once `STARTING`
- On owner disconnect pre-start: auto-close lobby and notify remaining players
- Auto-destroy lobby when empty; 60s inactivity timeout

#### Battle Royale Mode
- Shrinking safe zone (2–3 stages, visual ring, damage outside boundary)
- No respawn; remaining-player count HUD; placement tracking (1st, 2nd, …)
- Zone contractions announced ("Zone closing in 15s"); kill feed in HUD
- Disconnect during match = eliminated at disconnect moment (after 15s reconnection window)

#### Team vs Team (2v2, 3v3, 4v4)
- Team color-coding on player sprites; team roster in lobby
- Last-team-standing win condition; friendly fire OFF
- Equal team size enforced before host can start
- On full team disconnect: surviving team wins immediately

#### Match Lifecycle FSM
`LOBBY → LOADING → COUNTDOWN → ACTIVE → ENDED → RESULTS → LOBBY/DISBANDED`
- 3-2-1 countdown before play begins; server validates all state transitions
- Match timeout (10-min hard limit) prevents infinite stalemates
- Disconnect handling: 15-second reconnection window before treating as eliminated
- Match abandoned (all disconnect) → no ranking changes

#### Ranking System
- ELO with K=32, base 1000, placement-weighted for BR
- BR formula: 1st = S1.0, 2nd = S0.75, 3rd = S0.5, 4th+ = S0.1 (zero-sum across match)
- Team mode: Win = S1.0, Loss = S0.0; ELO update per player vs average opponent team ELO
- Global leaderboard; provisional indicator for < 3 matches played
- Disconnect mid-match = last-place rank penalty (no ragequit bypass)

#### Spell Progression / Leveling
- XP: Win = 100 + (10 × kills), Loss = 25 + (10 × kills)
- Level = `floor(sqrt(xp / 50))` — Level 5 ≈ 1250 XP (~10 matches)
- 1 upgrade point per level; max 3 per stat: HP (+10 each), Mana (+15 each), Cooldown (−5% each)
- All 6 elements available from match 1 — zero progression gates on gameplay access
- Server computes and sends final stats at match start; client never receives raw upgrade points

---

## Key Architectural Decisions

1. **Pre-Phaser login page.** `index.html` detects no JWT → redirect to `/login.html`. Phaser boots only after auth is complete. Prevents OAuth redirect from destroying in-memory game state.

2. **Server-authoritative hit detection.** Client sends `CAST_SPELL { element, x, y, targetX, targetY }`. Server validates (alive? cooldown? mana?), resolves hits, broadcasts `HIT { targetId, damage, newHp }` to all clients. Phaser physics = visual only.

3. **NetworkManager singleton.** `src/common/network-manager.ts` wraps socket.io. Knows nothing about Phaser scenes. Scenes listen to its events. Created before any networking code is written — prevents the `GameScene` god-object from absorbing networking logic.

4. **`PvPGameScene` = fork of `GameScene`.** Original `GameScene` untouched. `PvPGameScene` replaces single `#player` with `#localPlayer + Map<string, RemotePlayer>`. Enemies removed, server events drive damage.

5. **RemotePlayer with 100ms interpolation buffer.** No state machine on remote players. `applySnapshot()` lerps position toward server-broadcast coordinates with a 100ms render delay, eliminating jitter at 20Hz tick rate.

6. **REST for persistence, socket.io for real-time.** Leaderboard and account info = `GET /api/*`. Lobby state, positions, match events = socket.io. Match-end rank/XP update = socket event triggers internal DB write.

7. **SQLite with WAL mode.** `db.pragma("journal_mode = WAL")` on startup. Allows concurrent reads during writes. Single `.db` file — backup strategy is a file copy.

### Build Order (dependencies determine sequence)

```
Phase 1: Auth + server scaffold    (everything depends on player identity)
Phase 2: Lobby system              (match lifecycle depends on lobby state)
Phase 3: Match lifecycle FSM       (ranking and progression depend on match end events)
Phase 4: Battle Royale mode        (most complex game mode; establishes combat sync)
Phase 5: Team vs Team modes        (built on BR foundation; adds team assignment layer)
Phase 6: Ranking system            (depends on match results from Phase 3–5)
Phase 7: Spell progression         (depends on auth, match lifecycle, ranking)
Phase 8: Deployment + pre-event QA (must start in week 2, not the final week)
```

---

## Top 5 Pitfalls to Avoid

### 1. Client-Side Hit Detection (CRITICAL)
Never trust clients to report `DEAL_DAMAGE`. Any Phaser `physics.overlap()` result for PvP must be replicated on the server. Decision made in Phase 4; impossible to fix after the fact without rewriting combat.

**Fix:** Server receives `SPELL_CAST`, runs AABB/circle overlap at each 50ms tick, broadcasts authoritative `HIT` events.

### 2. OAuth Client Secret in Phaser Bundle (CRITICAL)
Vite bundles everything. A `client_secret` in any TypeScript file is readable in DevTools > Sources.

**Fix:** Token exchange (`auth_code → access_token`) lives exclusively in `server/src/auth/`. Phaser only initiates the redirect. Use `better-auth` which enforces this cleanly.

### 3. Deploy Late + Never Test on Real Network (CRITICAL)
Google OAuth requires HTTPS on production credentials. Campus WiFi blocks non-443 ports. CORS origins differ from localhost. These issues surface only on the deployed URL.

**Fix:** Working deployment from development week 2. Test Google Login from the production URL on real campus WiFi at least 1 week before the event. Use Let's Encrypt or a platform with automatic TLS (Render, Railway, Fly.io).

### 4. Level Advantage Breaks Event Pacing (CRITICAL for single-day events)
The XP curve compresses to ~2 hours at the event. Level-5 players with +50% HP / −30% cooldown stomp every new arrival. Attendees stop playing.

**Fix:** Hard cap all upgrade effects at ≤15% stat delta total. One developer must fight a max-level account as a level-0 account before ranking goes live — if win rate < 4/10, the formula is wrong.

### 5. Singleton Managers Don't Reset Between Matches (HIGH)
`DataManager`, `ElementManager`, `InventoryManager` were designed for a single-playthrough. Match 2 starts with Match 1's leftover HP, mana, and element state.

**Fix:** Add `reset()` methods to all three singletons as the first task in the architecture phase, before any multiplayer code is written. Call them in order at match start, populated from server-fetched account data.

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|-----------|-------|
| Stack (versions) | HIGH | Verified against npmjs.com on 2026-03-26 |
| Features (scope) | HIGH | Industry-standard patterns (socket.io lobbies, ELO, BR zone) |
| Architecture (patterns) | HIGH | Direct codebase analysis + established Phaser 3 + socket.io integration |
| Pitfalls | HIGH | Concrete prevention strategies; security-critical ones (P1.1, P3.2) are non-negotiable |

**Gaps to address during planning:**
- Exact XP thresholds and Elo K-factor need a simulation script before Phase 6 locks in
- Reconnection window (15s) is an estimate — calibrate against expected college WiFi quality
- Spectator / projector view scoped as post-core; confirm event organizer requirement before Phase 8

---

## Roadmap Implications

| Phase | Name | Key Deliverable | Pitfalls to Address |
|-------|------|-----------------|---------------------|
| 1 | Auth + Server Scaffold | Google OAuth, JWT, socket.io server | P1.1, P1.2, P1.3, P1.4, P1.5 |
| 2 | Lobby System | Invite codes, ready state, host controls | P2.1, P2.2, P2.3, P2.4 |
| 3 | Match Lifecycle FSM | State machine, disconnect handling | P3.7 (singleton reset) |
| 4 | Battle Royale Mode | Zone mechanic, server-auth combat sync | P3.1, P3.2, P3.3, P3.4 |
| 5 | Team Modes | 2v2/3v3/4v4 with team assignment | P3.6 (no god-object) |
| 6 | Ranking System | ELO updates, leaderboard, zero-sum formula | P4.1, P4.2, P4.4 |
| 7 | Spell Progression | XP, levels, stat upgrades (≤15% delta) | P5.1, P5.2, P5.3 |
| 8 | Deploy + Pre-Event QA | TLS, CORS, 8-player concurrent load test | P6.1, P6.2, P6.3, P6.8 |

**Research flags:** Phases 4 and 6 may benefit from `/gsd-research-phase` (combat sync lag compensation and ELO simulation respectively). All other phases follow well-documented patterns.

---

## Research Files
- [STACK.md](.planning/research/STACK.md) — 9 packages, versions verified 2026-03-26
- [FEATURES.md](.planning/research/FEATURES.md) — 6 feature areas, table stakes + anti-features
- [ARCHITECTURE.md](.planning/research/ARCHITECTURE.md) — component design, wire protocol, DB schema
- [PITFALLS.md](.planning/research/PITFALLS.md) — 25 pitfalls across 6 sections with phase assignments

## Confidence Levels
| Area | Confidence | Notes |
|------|-----------|-------|
| socket.io for LAN | HIGH | Very standard for browser multiplayer |
| Sync model (20Hz full state) | HIGH | Works fine for 2 players on LAN |
| Reusing CharacterGameObject for P2 | HIGH | Architecture supports it |
| Combo detection via server confirm | MEDIUM | Simple to implement; may need iteration |
| Puzzle room Tiled schema | MEDIUM | Needs design session before implementation |
| Boss weakness system | MEDIUM | State machine pattern exists; boss design is game design, not tech |
