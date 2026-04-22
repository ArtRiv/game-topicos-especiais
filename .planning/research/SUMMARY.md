# Project Research Summary

**Project:** v1.2 Lobby & Game Start Flow
**Domain:** Multiplayer PvP game -- lobby system, matchmaking, pre-game flow, in-match QoL
**Researched:** 2026-04-21
**Confidence:** HIGH

## Executive Summary

This milestone is a pure feature-layer build on top of a validated stack. Zero new dependencies are needed -- Phaser 3.87.0, socket.io 4.8.3, TypeScript 5.7.3, Express 4.21.0, and the existing WebRTC mesh provide every capability required. The work spans lobby enhancements (password, game modes, ready-up, kick, chat, AFK), a pre-game loading and countdown flow, in-match QoL (kill feed, match timer, spectator mode), and post-match rematch. All patterns are well-established in multiplayer game development with high-confidence references.

The recommended approach is a strict five-phase build that respects dependency chains: first fix critical existing debt (event listener cleanup, reactive host detection, singleton reset methods), then build lobby enhancements, then the pre-game flow with spawn points, then in-match features, and finally post-match/rematch. This ordering prevents the top pitfalls -- particularly the WebRTC mesh leak on rematch, lobby state divergence, and broken host migration -- from compounding as features stack up.

The key risks are: (1) event listener leaks across Phaser scene transitions, which must be fixed before adding any new scenes; (2) WebRTC mesh not being torn down between matches, which blocks the rematch loop; (3) singletons without reset() methods, which corrupt game state on rematch; and (4) the host migration boolean never updating from server state, which breaks all host-only controls. All four are addressable with targeted refactors before feature work begins.
## Key Findings

### Recommended Stack

No changes to the stack. The existing installed packages handle every v1.2 requirement. This is unusual and valuable -- it means zero integration risk from new dependencies.

**Core technologies (all existing, validated):**
- **Phaser 3.87.0**: All client UI, scenes, camera, timers, tweens -- kill feed, spectator camera, countdown overlay, loading screen
- **socket.io 4.8.3**: All lobby communication, chat, ready-up, kick, timer sync, match lifecycle events -- rooms API handles lobby scoping natively
- **WebRTC (browser native)**: P2P game state during matches -- spectators can passively receive on existing channels without new code
- **Tiled (via existing map system)**: Spawn points as object layers -- existing parsing infrastructure supports this directly

### Expected Features

**Must have (table stakes) -- 11 features:**
- Lobby browser with names and refresh
- Game mode selection (1v1 through 10v10)
- Ready-up system with host start gating
- Kick player (host-only)
- Auto-balance / shuffle teams
- Pre-game loading screen (map preview, player list, mode info)
- Spawn point system per map
- Match countdown (10s) with movement lock
- Match timer
- Kill feed
- Quick rematch

**Should have (differentiators) -- 4 features:**
- Spectator mode (high value for college event crowd engagement)
- Lobby chat
- Private lobbies with password
- AFK detection

**Defer (v2+):**
- Camera zoom-in on spawn (pure polish)
- Map auto-sizing by game mode (needs multiple map variants)
- Team color tinting on sprites (visual polish, no gameplay impact)
- Ranked matchmaking, voice chat, mid-match join, replay system (anti-features for this context)

### Architecture Approach

The architecture extends the existing Phaser parallel-scene pattern. Three new scenes (LoadingScene, MatchHudScene, PostMatchScene) join the existing scene graph. Match lifecycle logic is extracted into a src/match/ module (spawn manager, kill feed, spectator controller, match state) to prevent GameScene from growing past its current 1700+ lines. Lobby features are modularized into src/lobby/ (chat, ready state, AFK detector, game mode config). The server remains a thin signaling and authority layer with LobbyManager extensions and a new GameRoom concept for match-scoped state.

**Major components:**
1. **LobbyScene (modify)** -- Add password, game mode picker, ready-up, kick, auto-balance, shuffle, chat, AFK, ping display
2. **LoadingScene (new)** -- Pre-game screen: map preview, player list, teams, mode, asset loading progress
3. **GameScene (modify)** -- Add spawn point placement, countdown overlay, movement lock
4. **MatchHudScene (new)** -- Overlay: kill feed, match timer, spectator controls
5. **PostMatchScene (new)** -- Results display, quick rematch voting, return to lobby
6. **src/match/ modules (new)** -- match-state.ts, spawn-manager.ts, kill-feed.ts, spectator-controller.ts
7. **src/lobby/ modules (new)** -- lobby-chat.ts, ready-state.ts, afk-detector.ts, game-mode-config.ts
8. **LobbyManager (server, modify)** -- Password, ready-up tracking, kick, AFK timeout, mode validation
9. **NetworkManager (modify)** -- New socket events, separate mesh lifecycle from socket lifecycle (teardownMesh)

### Critical Pitfalls

1. **Event listener leaks across scene transitions** -- Phaser scene.restart() calls shutdown then create in sequence; if cleanup is incomplete, listeners double-bind. Fix: ALL EVENT_BUS.on() in create(), ALL EVENT_BUS.off() in shutdown(). Must be enforced before adding any new scenes.

2. **WebRTC mesh not torn down between matches** -- NetworkManager conflates socket connection with mesh lifetime. Rematch creates duplicate peer connections. Fix: Extract a public teardownMesh() method that closes WebRTC without killing the socket. Call it on match-end-to-lobby transition.

3. **Singletons without reset() methods** -- DataManager, InventoryManager, ElementManager hold stale state across matches. Fix: Add reset() to every singleton before building rematch. Non-negotiable prerequisite.

4. **Host migration not propagated to client** -- LobbyScene.#isHost is a local boolean set once on create, never updated from server state. Fix: Replace with reactive derivation from currentLobby.hostPlayerId === myPlayerId. Must happen before any host-only features.

5. **Spawn points unvalidated against player count** -- No contract between map data and runtime requirements. Fix: Validate spawn count >= max players at map load, add fallback generation, mode-aware team filtering.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation Cleanup and Lobby Infrastructure

**Rationale:** Four critical bugs (event listener leaks, host migration boolean, singleton resets, mesh lifecycle) must be fixed before any feature work. These are load-bearing architectural fixes that every subsequent phase depends on.
**Delivers:** Clean scene transition pattern, reactive host detection, singleton reset methods, mesh teardown capability, typed event bus constants for all new events
**Addresses:** No user-facing features -- pure stability
**Avoids:** Pitfalls #1 (listener leaks), #2 (mesh leak), #4 (host migration), #12 (singleton state)

### Phase 2: Lobby Enhancements

**Rationale:** Lobby features have zero match dependencies and can be built and tested independently. Game mode config is a prerequisite for spawn points and loading screen.
**Delivers:** Full-featured lobby with game mode selection, ready-up, kick, auto-balance/shuffle, lobby chat, private lobbies (password), lobby browser refresh, AFK detection in lobby
**Addresses:** 9 of 11 P1 features (lobby-side), plus 3 P2 features (chat, password, AFK)
**Avoids:** Pitfalls #3 (state divergence -- add version counter), #6 (ready-up race -- atomic server check), #13 (mode vs player count -- server validation), #14 (password leak -- server-only storage)

### Phase 3: Pre-Game Flow and Spawn System

**Rationale:** Depends on game mode config from Phase 2. Spawn points must exist before countdown can place players. Loading screen must exist before match initialization.
**Delivers:** LoadingScene with map preview and player list, spawn point system in Tiled maps, SpawnManager, server loading coordinator with timeout, match countdown with movement lock
**Addresses:** Pre-game loading screen, spawn point system, match countdown with movement lock
**Avoids:** Pitfalls #5 (spawn validation), #9 (loading deadlock -- 30s timeout)

### Phase 4: In-Match QoL

**Rationale:** Requires an active match with spawn points and countdown already working. Kill feed, match timer, and spectator mode are independent of each other but all need the match lifecycle in place.
**Delivers:** MatchHudScene overlay, kill feed with sequence ordering, server-authoritative match timer, spectator mode with camera cycling, player elimination flow
**Addresses:** Kill feed, match timer, spectator mode
**Avoids:** Pitfalls #7 (spectator mesh overhead -- use passive WebRTC receive or socket relay), #8 (chat channel flooding -- all chat via socket.io), #10 (AFK false positives -- phase-aware), #11 (kill ordering -- sequence numbers from host)

### Phase 5: Post-Match and Rematch

**Rationale:** Depends on match end detection from Phase 4. Rematch depends on singleton resets from Phase 1 and mesh teardown from Phase 1. This is the capstone that closes the play loop.
**Delivers:** PostMatchScene with results/stats, quick rematch voting, lobby persistence across matches, full lobby-match-lobby cycle
**Addresses:** Quick rematch (last P1 feature)
**Avoids:** Pitfalls #2 (mesh leak -- teardownMesh before re-init), #12 (singleton state -- reset() calls in MatchLifecycle.cleanup())

### Phase Ordering Rationale

- Phase 1 before everything: The four critical debt items (listener leaks, host migration, singletons, mesh lifecycle) are load-bearing. Building features on top of these bugs creates cascading failures that are extremely hard to debug later.
- Phase 2 before Phase 3: Game mode config defines player counts, which determine spawn point requirements and loading screen content.
- Phase 3 before Phase 4: The match must initialize correctly (spawn, countdown, lock) before in-match features can be tested.
- Phase 4 before Phase 5: Match end detection must work before post-match results and rematch can be built.
- Lobby features (Phase 2) are the largest phase by feature count but lowest complexity -- most are 5-20 line socket event handlers extending existing patterns.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Foundation Cleanup):** Needs careful analysis of every EVENT_BUS binding in existing scenes to establish the cleanup pattern. The singleton reset scope needs auditing.
- **Phase 3 (Spawn System):** Tiled object layer integration needs verification against existing map parsing code. Spawn validation rules need to be defined per game mode.
- **Phase 4 (Spectator Mode):** Architecture decision needed: passive WebRTC receive (Option A from STACK.md) vs. socket.io relay (Option B). Test Option A first on LAN.

Phases with standard patterns (skip deeper research):
- **Phase 2 (Lobby Enhancements):** All features are straightforward socket.io event handlers with Phaser UI. Extremely well-documented patterns.
- **Phase 5 (Post-Match/Rematch):** Standard scene + socket event pattern. The hard prerequisite work is in Phase 1.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies; all capabilities verified against installed packages |
| Features | HIGH | Established multiplayer game patterns; competitor analysis confirms feature set |
| Architecture | HIGH | Based on direct codebase analysis; extends proven Phaser parallel-scene pattern |
| Pitfalls | MEDIUM-HIGH | Based on codebase analysis + domain expertise; no external verification available |

**Overall confidence:** HIGH

### Gaps to Address

- **WebRTC mesh at 10+ players (10v10 mode):** 45-190 peer connections untested on target LAN hardware. May need fallback to server relay for position data. Test early in Phase 2 when mode selection is available.
- **Spectator data path:** Option A (passive WebRTC receive) is unverified. If channels close on player death, Option B (socket.io relay) adds moderate complexity. Test during Phase 4.
- **Phaser rendering at 20 players:** Performance with 20 simultaneous player sprites + spells is untested. May need sprite culling or particle reduction. Test during Phase 4.
- **Browser tab backgrounding:** Throttled timers may cause missed socket events for lobby browser. Needs visibility change handler (minor, address in Phase 2 polish).

## Sources

### Primary (HIGH confidence)
- Installed node_modules/ package analysis -- exact versions and API capabilities verified
- Direct codebase analysis of src/ and game-server/src/ -- all architecture recommendations based on actual code
- Existing .planning/codebase/CONCERNS.md -- known technical debt items

### Secondary (MEDIUM confidence)
- Training data for socket.io rooms, chat patterns, Phaser 3 camera/scene APIs -- well-established, stable patterns
- Multiplayer game design patterns from Brawl Stars, ZombsRoyale.io, Among Us -- feature expectations

---
*Research completed: 2026-04-21*
*Ready for roadmap: yes*
