# Domain Pitfalls — v2.0 PvP Multiplayer Milestone

**Domain:** Competitive PvP browser game with Google OAuth, lobbies, real-time socket.io combat, ranking, and spell progression  
**Stack:** Phaser 3 + TypeScript client / Node.js + socket.io + PostgreSQL server  
**Context:** 2-developer team, ~3-4 months, public college event (single-day live demo)  
**Researched:** 2026-03-27  

---

## Section 1 — Google OAuth + Phaser 3 + Node.js

### P1.1 — Exposing Client Secrets in the Phaser Bundle

**Risk Level:** CRITICAL

**What goes wrong:** Implementing the OAuth Authorization Code flow with a `client_secret` in client-side TypeScript. Vite bundles everything; the secret is readable in the browser's DevTools > Sources.

**Why it happens:** Tutorials for "OAuth with Node.js" assume a server-side web app. Copy-paste into a Phaser game without reading which parts are server-only.

**Prevention:**
- All OAuth token exchange must happen in the Node.js server, never in the Phaser client.
- Phaser client only initiates the OAuth redirect/popup — the token exchange (`code` ? `access_token`) happens exclusively on the server via a `/auth/callback` endpoint.
- Use PKCE (Proof Key for Code Exchange) for any browser-side flow — this is designed specifically for public clients (SPAs) with no client secret.

**Phase to Address:** Auth phase (first deliverable). Architecture decision that cannot be changed later.

---

### P1.2 — OAuth Redirects Break the SPA Flow

**Risk Level:** HIGH

**What goes wrong:** After Google redirects back to `https://game.example.com/auth/callback?code=...`, the Phaser game is no longer running (full page redirect). The player loses all pre-auth context (which lobby they were trying to join).

**Why it happens:** Classic redirect flow assumption — works fine for multi-page apps, but in a Phaser game the entire game state is in memory.

**Prevention:**
- **Preferred:** Use the OAuth **popup flow** (`window.open(authUrl, '_blank', 'popup=true')`). The main game tab stays alive, the popup handles auth, posts a message back to the parent tab via `window.postMessage`, and closes. No page navigation in the main tab.
- **Alternative:** If redirect is required, use `localStorage` to save pre-auth context (target lobby code) before redirect. Read it back after the callback reloads the app.
- Test popup blocking on campus browsers — have a fallback button "If popup was blocked, click here".

**Phase to Address:** Auth phase.

---

### P1.3 — JWT Token Storage in localStorage

**Risk Level:** MEDIUM

**What goes wrong:** Storing JWTs or session tokens in `localStorage` is vulnerable to XSS. If an attacker injects a script, they can steal the token.

**Why it happens:** `localStorage` is the simplest option. `httpOnly` cookies require a same-domain server.

**Prevention:**
- For a college event, `localStorage` is an acceptable risk — the threat model is not malicious players. HttpOnly cookies would be ideal but require more complex same-origin setup.
- **Critical:** Never store the Google `access_token` or `refresh_token` client-side. Store only your own short-lived session JWT (1-day expiry).
- Validate the JWT on the server for every socket.io connection (pass it in the socket.io `auth` handshake, not a room event).
- If using socket.io: `socket.io` auth handshake ? server middleware validates JWT ? attaches `userId` to socket. Never trust a userId sent from the client as a game event.

**Phase to Address:** Auth phase + socket.io connection setup.

---

### P1.4 — CORS Blocking the Auth ? Game Transition

**Risk Level:** HIGH

**What goes wrong:** The Node.js server has `cors({ origin: '*' })` in development but a locked-down origin in production. The deployed game's domain is not in the allowed list. Auth works locally, breaks at the event.

**Why it happens:** CORS is configured once locally and forgotten. The deployed domain is different from `localhost`.

**Prevention:**
- Add `CORS_ALLOWED_ORIGIN` to the server's environment config (not hardcoded).
- Set it to the exact deployed game origin (e.g., `https://mages.yourschool.edu`).
- Test auth from the deployed domain at least one week before the event.
- Also ensure the Google Cloud Console OAuth "Authorized redirect URIs" lists both `localhost:5173` (dev) AND the production URL. Missing this gives `redirect_uri_mismatch` error at the event.

**Phase to Address:** Auth phase, but must be verified during pre-event deployment test.

---

### P1.5 — Session Not Attached to Socket.io Handshake

**Risk Level:** HIGH

**What goes wrong:** Authentication succeeds, but socket.io connections are not validated. Any client can connect and send events impersonating any player.

**Why it happens:** Auth and sockets are implemented in different phases by different team members. The JWT check is forgotten at the socket layer.

**Prevention:**
- In the socket.io server: add a middleware in `io.use()` that reads `socket.handshake.auth.token`, verifies it, and attaches the user to `socket.data.userId`. Reject if missing.
- Client: Set `socket.auth = { token: localStorage.getItem('session_token') }` before connecting.
- Every game event handler should use `socket.data.userId` (server-verified) — never read player identity from event payloads.

**Phase to Address:** Auth phase + networking foundation.

---

## Section 2 — Lobby System for Live Events

### P2.1 — Orphaned Lobbies Polluting the Lobby List

**Risk Level:** HIGH

**What goes wrong:** Player A creates a lobby and disconnects without starting. The lobby stays in the list forever, showing as joinable but actually dead.

**Why it happens:** No cleanup logic — lobby is created in DB/memory and deleted only when the match explicitly ends.

**Prevention:**
- Implement lobby expiry: if a lobby has had no activity for 60 seconds and hasn't started, auto-delete it.
- When the lobby owner's socket disconnects before match start: auto-delete the lobby (simpler and safer for an event than ownership transfer).
- Use socket.io rooms for lobbies: `socket.join(lobbyId)`. When `io.in(lobbyId).sockets.size === 0`, the lobby is dead — clean it up.

**Phase to Address:** Lobby phase.

---

### P2.2 — No Reconnection Window During Match

**Risk Level:** HIGH

**What goes wrong:** A player's laptop hiccups on college WiFi for 8 seconds. They're kicked from the match permanently. A 4v4 becomes a 3v4 one minute in.

**Why it happens:** Default socket.io behavior: disconnect = leave room. No reconnection grace period.

**Prevention:**
- On disconnect during an ACTIVE match: mark the player as "disconnected" (not eliminated), don't broadcast their removal immediately.
- Give a 15-second reconnection window: if they reconnect with valid JWT and matching session, restore their position and state.
- After 15 seconds: treat as eliminated (Battle Royale) or continue 3v4 (team). Show to all: "Player X disconnected".
- College WiFi is unreliable. This feature WILL be needed at the event.

**Phase to Address:** Lobby + networking phase. Must be designed before first match round-trip works.

---

### P2.3 — Lobby Owner Disconnects Before Match Starts

**Risk Level:** MEDIUM

**What goes wrong:** The player who created the lobby disconnects before pressing "Start". Four players are stuck in the lobby with no way to start the match.

**Why it happens:** Start logic only exists on the owner's client.

**Prevention:**
- Server-side start logic only. Client sends `LOBBY_START` event; server checks that the sender is the owner and starts the match.
- On owner disconnect pre-start: auto-close the lobby with a toast to remaining members ("Lobby closed — host disconnected").

**Phase to Address:** Lobby phase.

---

### P2.4 — Race Condition When Players Join as Match Starts

**Risk Level:** MEDIUM

**What goes wrong:** Owner clicks "Start" while a 4th player is joining at the exact same moment. The new player receives a partial lobby state or joins a match that's already started.

**Why it happens:** No lobby state lock. "Joining" and "starting" are not mutually exclusive without a state machine.

**Prevention:**
- Lobby has explicit states: `WAITING ? STARTING ? IN_MATCH`. No new joins accepted once state is `STARTING` or beyond.
- The `LOBBY_START` event atomically transitions state on the server. Subsequent `JOIN_LOBBY` requests get "match already started" response.

**Phase to Address:** Lobby phase.

---

### P2.5 — Lobby Code Collision

**Risk Level:** LOW

**What goes wrong:** Two concurrent lobbies get the same 4-letter random code. Players join the wrong match.

**Why it happens:** `Math.random()` codes without uniqueness checks.

**Prevention:**
- Generate codes server-side. Before assigning a code, check that it doesn't already exist in active lobbies.

**Phase to Address:** Lobby phase.

---

## Section 3 — Socket.io PvP Spell Combat Sync

### P3.1 — Phaser Arcade Physics Cannot Be Authoritative Across Clients

**Risk Level:** CRITICAL

**What goes wrong:** Spell projectile physics run independently in each Phaser client. Floating-point simulation diverges. Client A sees the fireball hit; Client B sees it miss. Health is different on every screen.

**Why it happens:** Single-player Phaser uses `this.physics.overlap()` for hit detection. Multiplying this across 8 browser tabs with different frame timings causes desync within seconds.

**Prevention:**
- **Server is authoritative for all hit detection.** Client sends `SPELL_CAST { spellId, position, direction, timestamp }`. Server maintains the authoritative spell list updated per server tick. Server broadcasts hit events to all clients.
- Client-side Phaser physics becomes **visual only** — rendering, local player movement feel, and visual effects. Not for damage calculations.
- Server runs hit detection on simplified math (AABB or circle overlap) per 50ms tick. When a hit is detected, server broadcasts `HIT { attackerId, targetId, damage, spellId }`. All clients apply the damage.

**Phase to Address:** Networking architecture phase. This decision shapes everything that follows.

---

### P3.2 — Clients Self-Reporting Damage

**Risk Level:** CRITICAL

**What goes wrong:** Client sends `DEAL_DAMAGE { targetId: 'player2', amount: 50 }`. Server trusts it. Any player can open DevTools and spam this event, one-shotting everyone.

**Why it happens:** Fastest path to "it works" — let the hitting client report the damage.

**Prevention:**
- Server NEVER accepts damage reports from clients. Clients only report: player inputs, spell casts, and position updates.
- Only the server computes and applies damage based on its authoritative spell simulation.
- Server-calculated damage is broadcast to all clients including the caster.

**Phase to Address:** Networking architecture phase. Non-negotiable security constraint.

---

### P3.3 — Internet Latency Makes Spell Hits Feel Wrong

**Risk Level:** HIGH

**What goes wrong:** On LAN, latency is <5ms. At a college event over WiFi, expect 20-100ms. A spell that looks like it hit the player on the caster's screen misses according to the server because the target has already moved.

**Why it happens:** No lag compensation. Server evaluates hit based on current position, but the caster aimed based on their delayed view.

**Prevention:**
- Implement basic lag compensation: when evaluating a spell hit, rewind the target's position by the caster's estimated latency (rolling average of socket ping).
- Simpler alternative: increase hitboxes slightly. Less precise but prevents frustrating misses.
- Show visual feedback immediately on the caster's client (local hit flash); wait for server confirmation before applying damage. Hides the 50ms delay behind effects.

**Phase to Address:** Combat sync phase.

---

### P3.4 — Player Jitter from Missing Interpolation

**Risk Level:** HIGH

**What goes wrong:** At 20 position updates/second, remote players teleport 50px every 50ms instead of moving smoothly. Game looks broken even if it functions correctly.

**Why it happens:** No interpolation between received positions. Client just teleports remote sprite to latest received position.

**Prevention:**
- Maintain a position buffer for each remote player (last 2-3 received positions with timestamps).
- Render remote players at an interpolated position 100ms in the past (always have future positions to interpolate toward).
- Phaser's `lerp` drives this. Store `targetX/Y` and lerp the spike toward it each frame.

**Phase to Address:** Combat sync phase (player movement sync).

---

### P3.5 — Spell Event Flood with 8 Players

**Risk Level:** MEDIUM

**What goes wrong:** In 4v4, all 8 players cast spells simultaneously. Each spell has position updates and hit checks. Naive broadcast sends every spell event to every client, every tick.

**Why it happens:** Per-event broadcasting instead of batched tick updates.

**Prevention:**
- Batch all updates per tick: instead of individual `SPELL_MOVE` events, send one `TICK_UPDATE { spells: [...], players: [...] }` array per tick per client.
- At 20Hz with 8 players and ~40 active spells, a batched tick payload is ~2-4KB per client per second. Wholly manageable.
- More critical than optimization: **test with 8 simultaneous clients** before the event. 2-player testing hides concurrency bugs that appear at 8.

**Phase to Address:** Combat sync phase + pre-event load test.

---

### P3.6 — Existing GameScene God-Object Gets Worse

**Risk Level:** HIGH

**What goes wrong:** Networking code is added inline into `GameScene` (already 1311 lines). The result is a 2000-line scene that nobody can debug when something breaks live at the event.

**Why it happens:** `GameScene` already handles everything. It's the path of least resistance.

**Prevention:**
- Create `NetworkManager` as a standalone singleton before any networking code is written.
- Create `MatchStateManager` to hold authoritative match state (alive players, scores, match phase).
- `GameScene` calls managers; managers contain the logic. `GameScene` adds no more than ~100 lines of networking glue.
- This is a prerequisite — do it before Phase 1 networking code.

**Phase to Address:** Architecture cleanup phase (before networking starts).

---

### P3.7 — Singleton Managers Don't Reset Between Matches

**Risk Level:** HIGH

**What goes wrong:** Match 1 ends. Player returns to lobby. Match 2 starts. `DataManager`, `ElementManager`, and `InventoryManager` still hold state from Match 1 (HP, mana, selected element). Player starts Match 2 with 1 HP.

**Why it happens:** These singletons have no `reset()` method. Designed for a single-playthrough game.

**Prevention:**
- Add `reset()` methods to `DataManager`, `ElementManager`, `InventoryManager` before multiplayer is added.
- Call all three on match start, with values populated from server-fetched account data (not hardcoded defaults).
- Add a `SceneReset` utility that calls all resets in the correct order.

**Phase to Address:** Architecture cleanup phase (before any match logic is built).

---

## Section 4 — Ranking System

### P4.1 — Rank Inflation or Deflation in Battle Royale

**Risk Level:** HIGH

**What goes wrong:** A Battle Royale formula that gives +100 to the winner and 0 to losers inflates total rank points by 100 every match. A formula that gives winner +100 and all 7 losers -100 deflates catastrophically. The leaderboard becomes meaningless after 10 matches.

**Why it happens:** Rank point formulas aren't stress-tested across simulated matches before launch.

**Prevention:**
- Use a **zero-sum formula**: total points won must equal total points lost per match.
- Simple formula: each eliminated player loses `base_loss`. Winner gains `base_loss * (players - 1)`.
- For Battle Royale placement: `loss = base * (1 - placement_fraction)`. 1st gains; 2nd loses a little; 8th loses most.
- **Simulate before launch:** Run a script that simulates 50 matches and plots ranking distribution. Visual sanity check required.
- ELO with K=32 is well-understood and works for small populations (20-30 players).

**Phase to Address:** Ranking phase — formula must be simulated before enabling live ranking.

---

### P4.2 — Server Reset Wipes the Leaderboard Mid-Event

**Risk Level:** CRITICAL

**What goes wrong:** The server crashes or is redeployed 2 hours into the event. All ranking data is gone. Players who played 10 matches see 0 on the leaderboard.

**Why it happens:** No backup strategy. Everything is in a runtime database without persistence guarantees.

**Prevention:**
- **Automated backups**: PostgreSQL `pg_dump` via cron every 30 minutes, written to disk.
- Add a `/admin/export` HTTP endpoint (auth-protected) that dumps current rankings to JSON. Run it manually every few match cycles.
- Use a **VOLUME** for the database container (if using Docker) so data survives container restarts.
- Test the restore process locally before the event. An untested backup is not a backup.

**Phase to Address:** Ranking phase + deployment/ops checklist.

---

### P4.3 — "Played 1 Match" vs "Played 30 Matches" Leaderboard Distortion

**Risk Level:** MEDIUM

**What goes wrong:** The top-ranked player won their first match and played nothing else. They sit at rank 1 while players who played 20 matches hover lower due to normal wins/losses.

**Why it happens:** Rank score alone doesn't capture sample size.

**Prevention:**
- Show `matches_played` alongside rank score on the leaderboard.
- Consider a minimum matches threshold (3 matches) before a player's rank is "official" for event awards.
- Players with fewer than 3 matches show a provisional indicator.

**Phase to Address:** Ranking phase (leaderboard UI).

---

### P4.4 — Players Ragequit to Avoid Rank Loss

**Risk Level:** LOW

**What goes wrong:** Players figure out that disconnecting mid-match avoids the rank penalty. At a competitive college event, this will happen.

**Why it happens:** Match result is only submitted when the match completes normally. Disconnection path has no result submission.

**Prevention:**
- On disconnect during match: after the reconnection window (P2.2) expires, server marks the disconnected player as `placement: last` and submits their rank update immediately.
- Disconnect penalty should equal or slightly exceed normal last-place loss.

**Phase to Address:** Ranking phase + disconnection handling (tied to P2.2).

---

## Section 5 — Spell Progression / Leveling in Competitive Play

### P5.1 — Level Advantage Creates Unwinnable Matches

**Risk Level:** CRITICAL

**What goes wrong:** Players who arrived 2 hours early played 10 matches. They have level 5 upgrades (+50% HP, -30% cooldown). New arrivals are level 1. Every match is decided by level, not skill. Event attendees stop playing after one loss.

**Why it happens:** Progression designed for long-term engagement, not a single-day event. The power curve that takes 2 months in a live service game is compressed into 4 hours.

**Prevention:**
- **Cap stat variance at ±15-20% max** across all upgrade levels. A level 10 player feels slightly stronger — not dominant.
- XP calibrated so that after ~5 matches, a player has seen meaningful progression but the gap to a 20-match player is small.
- **Consider normalized competitive play**: all players fight at equal base stats; progression is cosmetic only. This eliminates P5.1 entirely.
- If stats must scale: use diminishing returns. First upgrade: +10% HP. Second: +5%. Third: +2%.
- **Required:** One developer creates a max-level account and fights a fresh account. If they win 9/10 matches, the formula is wrong.

**Phase to Address:** Progression phase — must be balanced before ranking goes live.

---

### P5.2 — Stat Overflow from Uncapped Modifiers

**Risk Level:** HIGH

**What goes wrong:** Upgrading cooldown by -10% per level means at level 10 cooldown is 0ms. Or negative. Spells fire every frame.

**Why it happens:** No floor/ceiling on cumulative stat modifiers.

**Prevention:**
- All derived stats have a floor and ceiling defined on the server: `MIN_COOLDOWN = 500ms`, `MAX_HP_MULTIPLIER = 1.5x`.
- Calculate final stats on the server when match starts. Server sends actual values: `{ hp: 120, manaPool: 110, cooldownMultiplier: 0.85 }`.
- Client receives final stat values only — never raw upgrade points.
- Add server-side assertion: if any computed stat is outside the valid range, log and clamp. Catches formula bugs before they affect live matches.

**Phase to Address:** Progression phase + match initialization.

---

### P5.3 — Progression Gating Access to Fun

**Risk Level:** MEDIUM

**What goes wrong:** New elements (Ice, Wind, Thunder) are locked until level 3. A new player at the event can only cast Fire. They lose to advanced players with full spell libraries. They leave.

**Why it happens:** Single-player "unlock" patterns applied to a competitive context without thinking about asymmetric experience.

**Prevention:**
- **All 6 elements available to all players from match 1** — stated in `PRG-04`. Do not gate ANY element behind progression.
- Progression affects only: cooldown multiplier, mana pool, HP.
- Explicitly verify in the data model that no element unlock flag exists.

**Phase to Address:** Progression design — verify in data schema before implementation.

---

### P5.4 — HP-Only Builds Collapse Gameplay Diversity

**Risk Level:** MEDIUM

**What goes wrong:** Players dump all points into HP because "more life is obviously good." Everyone builds tank. Cooldown and mana upgrades are ignored. Spell diversity collapses.

**Why it happens:** HP is the most legible stat. "More life is better" is always true in the player's mental model.

**Prevention:**
- Ensure cooldown reduction has a **visible, immediate gameplay effect**. Mana pool upgrades enable longer spell chains — show this clearly in the UI.
- Consider per-category spending limits: can't allocate more than 50% of points into a single stat.
- Alternatively: lean into archetypes. "Tank (HP) vs Burst mage (cooldown + mana)" is interesting asymmetry — but only works if burst can reliably beat tank. Playtest this.

**Phase to Address:** Progression phase (UX and balance tuning).

---

## Section 6 — Event-Day Failure Modes

### P6.1 — HTTPS Required for Google OAuth but Server Runs HTTP

**Risk Level:** CRITICAL

**What goes wrong:** Google OAuth production credentials only accept HTTPS redirect URIs. If the game is served over HTTP at the event, Google Login fails for 100% of players. Event starts. Nothing works.

**Why it happens:** `localhost` with development credentials works over HTTP. Production credentials do not.

**Prevention:**
- Set up TLS for the production server (Let's Encrypt via Certbot is free — 30 minutes if you own a domain).
- Platforms with automatic TLS: Render.com, Railway.app, Fly.io — all have free or near-free tiers.
- Test Google Login from the production URL, with production credentials, **at least 1 week before the event**.
- Register the production domain in Google Cloud Console during the auth phase (not the day of the event).
- Socket.io over WSS (port 443) also avoids most campus firewall issues.

**Phase to Address:** Deployment + pre-event testing. Domain registration during auth phase.

---

### P6.2 — Campus WiFi Blocks Non-Standard Ports

**Risk Level:** HIGH

**What goes wrong:** The Node.js server runs on port 3001. Campus network firewall blocks everything except 80 and 443. Socket.io connections fail silently. Players stuck at "Connecting..."

**Why it happens:** Development on localhost — firewalls don't apply locally.

**Prevention:**
- Run the production server on port 443 (HTTPS/WSS) only.
- If using a cloud platform (Render, Railway): handled automatically.
- If self-hosting: use nginx as a reverse proxy. Nginx listens on 443, Node.js on internal port.
- **Test from real campus WiFi** at least 3 days before the event.

**Phase to Address:** Deployment.

---

### P6.3 — "It Works on My Machine" — Deployed Game Never Tested

**Risk Level:** CRITICAL

**What goes wrong:** Game developed and tested exclusively on `localhost`. At the event, the deployed version has CORS errors, OAuth redirect mismatches, socket.io connection failures, missing environment variables. Broken for the first 30 minutes.

**Why it happens:** Deployment treated as the final task, not an ongoing infrastructure concern.

**Prevention:**
- **Deploy early**: working deployment from week 2 of development. Every feature is tested on the production URL.
- Maintain a `DEPLOYMENT_CHECKLIST.md`: CORS origins set, Google OAuth URIs registered, DB connection string, environment variables set, SSL certificate valid.
- Reserve the final week before the event for: full dry run, 8-player concurrent test, and bug fixes only (no new features in the final week).

**Phase to Address:** Deployment phase must be the FIRST infrastructure phase, not the last.

---

### P6.4 — Server Crashes on Unhandled Edge Cases

**Risk Level:** HIGH

**What goes wrong:** An untested edge case (player disconnects exactly when a match is ending, malformed socket event, join a lobby that just started) throws an unhandled exception. Node.js crashes. All active matches lost. Server needs manual restart at peak event time.

**Why it happens:** Happy-path testing only. Error paths in socket handlers are skipped.

**Prevention:**
- Global crash reporter: `process.on('uncaughtException', ...)` + `process.on('unhandledRejection', ...)` that log and keep the process alive.
- `try/catch` in all socket event handlers. A single player's malformed event should never kill the server.
- Use PM2 in cluster mode or platform restart policy: auto-restarts in <5 seconds if it does crash.
- **At the event**: have SSH access ready on the organizer's phone. Know the restart command before the event starts.

**Phase to Address:** Networking foundation phase + deployment.

---

### P6.5 — No Spectator Mode Leaves 12 People Watching a Black Screen

**Risk Level:** MEDIUM

**What goes wrong:** A 4v4 supports 8 players. 15 people are at the event. The 7 waiting players have nothing to do or watch.

**Why it happens:** Spectator mode is considered a nice-to-have and cut for time.

**Prevention:**
- Minimum viable spectator: a "live view" URL renders all match events on a shared projector without player controls. One implementation, not individual spectator clients.
- At a college demo event, having the match on the projector for crowd watching is more valuable than any individual feature except the match itself.

**Phase to Address:** Match UI phase. Prioritize immediately after core PvP is stable.

---

### P6.6 — Phaser Autoplay Policy Silences Audio on First Load

**Risk Level:** LOW

**What goes wrong:** Browsers require a user gesture before allowing audio. If Phaser tries to play sounds before the first click, it fails silently. Spell sounds, hit feedback, and music are absent until the player clicks.

**Why it happens:** Browsers enforce the autoplay policy. Common on Chromium-based campus kiosk browsers.

**Prevention:**
- Add a "Click to Start" splash screen before the game initializes audio. Standard practice. Resolves the autoplay policy and doubles as a loading screen.
- Test audio specifically on the event machines (campus browsers may have stricter policies).

**Phase to Address:** Game launch / pre-lobby UI phase.

---

### P6.7 — Stale Session on Shared Machines

**Risk Level:** MEDIUM

**What goes wrong:** Student A logs in on Machine 5. Plays a match. Leaves. Student B sits down and the game still shows Student A's account. Student B plays matches that go to Student A's rank score.

**Why it happens:** JWT stored in `localStorage` persists between browser sessions until expiry.

**Prevention:**
- Prominent "Log Out" button on main menu / lobby screen.
- On match completion, return to the **login screen** (not main menu) — forces the next user to log in.
- JWT expiry: 8-12 hour max for single-day events.
- On page load: if a stored session exists, show "Continue as [Name] or Switch Account?" prompt.

**Phase to Address:** Auth phase (session flow).

---

### P6.8 — Load Test Never Done

**Risk Level:** HIGH

**What goes wrong:** Game works fine with 2 browser tabs. The event starts with 20 players simultaneously logging in, joining lobbies, and starting matches. Server slows down. Lobby list returns stale data. Matches lag. Team is debugging live.

**Why it happens:** Load testing seems optional until it isn't. 2-developer teams skip it.

**Prevention:**
- Before the event: run a structured test with 8 real browsers simultaneously (different machines or browser profiles) in the same arena.
- Test specifically: 2 concurrent lobbies, each with 4 players in a match. That is the peak load scenario.
- Log server CPU and memory during this test. If either exceeds 70%, investigate.
- Note: 4v4 spell combat at 20Hz is ~160 position events/second. This is not heavy load — it should work fine. The test confirms there are no concurrency bugs.

**Phase to Address:** Pre-event final sprint (dedicated test session, not squeezed into development hours).

---

## Summary: Phase Assignment Quick Reference

| Pitfall | Phase |
|---------|-------|
| P1.1 Client secret exposure | Auth — first |
| P1.2 Redirect breaks game state | Auth |
| P1.3 JWT storage | Auth |
| P1.4 CORS + OAuth URIs not for production | Auth |
| P1.5 Socket auth not validated | Auth + Networking foundation |
| P2.1 Orphaned lobbies | Lobby |
| P2.2 Reconnection window | Lobby + Networking |
| P2.3 Owner disconnect pre-start | Lobby |
| P2.4 Join/start race condition | Lobby |
| P2.5 Lobby code collision | Lobby |
| P3.1 Physics authority across clients | Networking architecture (first) |
| P3.2 Clients self-reporting damage | Networking architecture (first) |
| P3.3 Internet latency hit feel | Combat sync |
| P3.4 Player jitter / no interpolation | Combat sync |
| P3.5 Event flood with 8 players | Combat sync + load test |
| P3.6 God-scene gets worse | Architecture cleanup (before networking) |
| P3.7 Singletons don't reset | Architecture cleanup (before match logic) |
| P4.1 Rank inflation | Ranking |
| P4.2 Server reset wipes leaderboard | Ranking + deployment |
| P4.3 One-game ranking distortion | Ranking UI |
| P4.4 Disconnect = free escape from rank loss | Ranking + disconnection handling |
| P5.1 Level advantage unwinnable matches | Progression — balance |
| P5.2 Stat overflow | Progression |
| P5.3 Progression gates elements | Progression design |
| P5.4 HP-only builds collapse diversity | Progression UX |
| P6.1 HTTP server breaks OAuth | Deployment (early) |
| P6.2 Campus firewall blocks ports | Deployment |
| P6.3 Never tested on production URL | Deployment (ongoing from phase 1) |
| P6.4 Server crash on edge cases | Networking foundation |
| P6.5 No spectator mode | Match UI |
| P6.6 Autoplay policy | Game launch UI |
| P6.7 Stale session on shared machines | Auth |
| P6.8 Load test never done | Pre-event sprint |

---

## Phase-Specific Warning Flags

| Phase Topic | Likely Pitfall | Required Mitigation |
|-------------|---------------|---------------------|
| First networking commit | P3.1 + P3.2 without architecture | Define authority model in writing before any code |
| Auth implementation | P1.1 + P6.1 combo | Test with prod credentials + HTTPS from day 1 |
| Lobby logic | P2.1 + P2.2 together | Implement cleanup and reconnection in same phase |
| First full match end-to-end | P3.7 | Singleton reset must work before match 2 |
| Ranking formula | P4.1 | Run simulation script, see it on a graph |
| Progression stats | P5.1 + P5.2 | Playtest max-level vs level-1, no exceptions |
| Final week | P6.3 + P6.8 | Full 8-player dry run on production URL from campus WiFi |
