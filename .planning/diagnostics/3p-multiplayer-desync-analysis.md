# 3+ Player Multiplayer Desync — Diagnostic Analysis

**Date:** 2026-05-25
**Scope:** Why 1v1 works but 3+ players cause "ghost player" / "Player C can't see Player B" issues.
**Methodology:** Read of `src/networking/network-manager.ts`, `src/networking/types.ts`, `game-server/src/server.ts`, `game-server/src/game-room.ts`, `game-server/src/lobby-manager.ts`, `src/scenes/lobby-scene.ts`, the networking sections of `src/scenes/game-scene.ts`, and the prior architecture analysis in `.planning/WebRTC Game Networking Architecture Analysis.md` (which is generic O(N²) theory — useful context, but does not name the code-level defects in this repo).

---

## 1. Mesh topology recap

The mesh is a **full P2P mesh built lazily at match-start**, not a star, not a steady-state mesh maintained across lobby lifetime.

Lifecycle:

1. Clients connect to socket.io for signaling (`src/networking/network-manager.ts:114-116`).
2. Players join a lobby; lobby state lives entirely server-side (`game-server/src/lobby-manager.ts`).
3. Host fires `lobby:start` (`game-server/src/server.ts:175-196`). Server:
   - Marks lobby `in-progress`, builds a `MatchConfig` with the full `players: PlayerInfo[]` list.
   - Broadcasts `lobby:started` to `lobby:${lobbyId}` room.
4. Every client, on receiving `lobby:started`, calls `#initWebRTCMesh(matchConfig.players)` (`src/networking/network-manager.ts:284-294`). This is the **only** code path that creates peer connections.
5. `#initWebRTCMesh` (lines 360-380) iterates the player list. For each peer, the lower-`socketId`-index player creates the offer; the higher-index waits to receive it. The intent is to avoid simultaneous double-offers — but note the choice key is the player's **position in `MatchConfig.players`**, which is `lobby.players` array order (insertion order from `LobbyManager`, `game-server/src/lobby-manager.ts:36`).
6. Offerer creates BOTH data channels (`pos`, ordered=false; `events`, ordered=true) at line 413-414. Answerer receives them via `pc.ondatachannel` (line 426-429).
7. ICE servers: `stun:stun.l.google.com:19302` only — **no TURN relay** (line 384).
8. Channel labels: `pos` for unreliable position broadcast, `events` for reliable spell casts / breath / earth-wall pillars (`src/networking/network-manager.ts:413-414`).

What confirms vs. corrects the prior analysis:

- **Correct:** Full mesh, O(N²) connections, no TURN, JSON over data channels (`#broadcastUnreliable` / `#broadcastReliable` at lines 497-521 use `JSON.stringify`).
- **Correction to the prior analysis:** It frames every issue as a scaling/bandwidth question. At 3 players that's a red herring — 3 players is **2 connections per node, 3 total**. Bandwidth and CPU are not the problem. The problem is **handshake races and missing late-join logic**, which only need 3 players to trigger and the prior doc never addresses.

A critical observation: **there is no protocol event for late-join after `lobby:started`**. The mesh is established once. If a 3rd player joins the **lobby** before start, they're in `MatchConfig` and the mesh forms with them. If they join after start, no path exists to add them — but join-during-progress is also blocked at `lobby-manager.ts:31-39` (no status check at join time, but `startLobby` flips status to `in-progress` and `listLobbies()` filters at line 28 so they can't see it). So the 3-player failure isn't mid-match join; it's at start-of-match mesh formation.

---

## 2. The 3-player failure modes — RANKED by likelihood

### Cause #1 (HIGH): `socket.id`-index ordering vs. `lobby.players` array index — offer races and silent missed connections

**Symptom:** "Player C can't see Player B" (and symmetrically). One specific pair of peers in a 3-player match never establishes both data channels, while the other two pairs do.

**Why 2 players masked it:** With 2 players the "lower-index offers" rule is trivially satisfied: there's exactly one offer A→B. There is no second pairing to race against, and signaling cannot interfere with itself.

**Code evidence:**
- `src/networking/network-manager.ts:369-377` — the offer-direction tiebreaker uses `myIndex` from `players.findIndex((p) => p.socketId === mySocketId)`. **All clients receive the same `MatchConfig.players` array** (server broadcasts the same object at `game-server/src/server.ts:189-195`), so indices ARE consistent across clients. That part is fine.
- BUT: `#initWebRTCMesh` runs on **every** client when `lobby:started` arrives (`src/networking/network-manager.ts:293`). With 3 players, two of them will simultaneously create offers (e.g., index-0 offers to 1 and 2; index-1 offers to 2). Each offer triggers `#createPeerConnection` (line 382) which immediately stores the new `RTCPeerConnection` in `#peerConnections.set(peerSocketId, pc)` (line 386).
- The race: when player 0 sends an offer to player 2, and player 1 also sends an offer to player 2, **player 2's `#handleOffer` runs twice for two different `fromSocketId`s — that's fine, those are independent connections**. The race is NOT between two offers to the same peer (the tiebreaker prevents that). The race is in `#handleOffer` itself at lines 423-435: it does `this.#createPeerConnection(fromSocketId)` which **overwrites** any prior PC for that socketId. With socket-id-based keys this is safe in steady state — but ICE candidates can arrive **before** the offer if the offerer's `onicecandidate` fires immediately after `setLocalDescription` (which is normal).
- `#handleIceCandidate` at line 442-445: `const pc = this.#peerConnections.get(fromSocketId); if (pc) await pc.addIceCandidate(candidate);` — **if the ICE arrives before the corresponding offer**, `pc` is undefined and the candidate is **silently dropped, no buffering**. This is the canonical "early ICE candidate" bug. socket.io does not guarantee message ordering across event types — only within the same emitter; ICE and offer come from the same emitter, but the network can interleave them with other events (the offerer can have already emitted ICE on the underlying transport before its `setLocalDescription` resolved and emitted the offer on the wire). In the offerer's code the `setLocalDescription` await is BEFORE the offer emit (`src/networking/network-manager.ts:419-420`), but `onicecandidate` is registered earlier (line 388-392) and **fires asynchronously the moment a candidate is gathered, which can be before line 420**. So order-on-wire is offerer-controlled but the offerer can emit ICE first if the gathering happens to complete before line 420 — and `await pc.setLocalDescription(offer)` is a microtask boundary that lets ICE candidates fire in between.
- The likely worst-case real bug: when host A starts and B & C join close together, the cross-pairs (A↔B, A↔C, B↔C) all initiate at the same instant. ICE candidate emissions get interleaved on the answerer's queue with offers from a different peer. The answerer can process B's ICE, then C's offer, then A's offer, etc. If a specific candidate is dropped because its PC isn't built yet for THAT peer, **the connection silently never completes** because no fallback or re-request exists. The pair-specific data channels never open, and `#broadcastUnreliable` / `#broadcastReliable` at lines 499-501, 509-511 skip them silently (only sends to `readyState === 'open'`).

**Confidence: HIGH.** This pattern — early ICE drop with no buffering — is a textbook WebRTC mesh failure. The exact race only fires when 3+ peers exchange signaling concurrently. The code makes zero attempt to buffer ICE-before-PC, never retries, and has no health check on opened channels.

---

### Cause #2 (HIGH): No retry / no health verification — partial mesh is permanent until ICE timeout

**Symptom:** Same as #1 — one pair stays "ghosted" for the entire match. Even if the underlying network would succeed on a retry, no retry occurs.

**Why 2 players masked it:** A 2-player session has exactly one connection to fail. If it fails, BOTH players see the symptom immediately (game is dead) and the user reboots — there's no partial-failure mode to hide.

**Code evidence:**
- `src/networking/network-manager.ts:394-405` — `oniceconnectionstatechange` only acts on `'disconnected' | 'failed' | 'closed'` AFTER an ICE session existed. If it never connected at all, the state typically goes `new → checking → … `and stalls. The handler does nothing on stall.
- There is no timer that asserts "after N seconds since `lobby:started`, all expected data channels must be `open` — if not, log/retry/escalate". With 3 players each client expects 2 unreliable + 2 reliable channels (4 total in `Map` size). Nothing checks the actual count.
- `#broadcastUnreliable` and `#broadcastReliable` (lines 497-521) silently skip non-open channels. So position updates from player C to player B simply never arrive — and **C has no idea**.
- There is no application-level keepalive / pong on the data channel; the only signal is socket.io `game:player-disconnected` (lines 322-334), which only fires when the socket disconnects, not when the PC stalls.

**Confidence: HIGH.** This is the structural amplifier that turns a probabilistic handshake race (Cause #1) into a permanent ghost.

---

### Cause #3 (MEDIUM-HIGH): Remote player spawn is gated on the FIRST received position update, with no other path

**Symptom:** Player B can move around just fine on their own screen, but Player C never sees B's character appear at all. Spells from B do spawn on C's screen (different gating); player avatar does not.

**Why 2 players masked it:** With one peer connection, either it works (you see them) or it doesn't (you see no one). There's no "I see their spells but not their body" partial case.

**Code evidence:**
- `src/scenes/game-scene.ts:3858-3886` — `#onRemotePlayerUpdate` is the ONLY place a remote `Player` is constructed. The first inbound `pos` message from a given `playerId` triggers `new Player({...})`.
- Match start: server `registerPlayer` happens on the server-side damage pipeline (`game-server/src/server.ts:91-99`) but does NOT broadcast any "spawn manifest" with positions to clients. The client `lobby:started` handler (`src/networking/network-manager.ts:284-294`) gets `matchPlayers` info (id, name, socketId, team) but **no spawn coordinates** — `MatchConfig.players: PlayerInfo[]` per `src/networking/types.ts:4-10, 42-47`.
- Conclusion: the very existence of a remote player avatar in `GameScene` is bootstrapped by the FIRST `pos` packet to traverse the unreliable channel. If that data channel never opens (Cause #1+#2), the player avatar simply never appears. Worse: the remote player's `spell` casts ride a DIFFERENT channel (`events`, reliable), so if the reliable channel opens but the unreliable does not, `#onRemoteSpellCast` (line 3982) WILL run and spawn the spell — but no caster avatar to attribute it to (line 4030 — `remoteCaster` is `undefined`, passed to spell factory, which is presumably tolerant). This explains the "I see their fireballs but not them" sub-symptom if anyone reports it.
- `#onRemoteSpellCast` does NOT lazy-create a Player from the spell-cast payload. Spawn is unreliable-channel-only.

**Confidence: MEDIUM-HIGH.** This is a real defect that makes the symptom diagnosable. Even if Cause #1 weren't there, a hypothetical packet loss on the very first pos update would manifest the same way — but `pos` is sent at 20 Hz from `sendPosMirror`/`sendPlayerUpdate` (line 222-234) and after `#lastSentSnapshot` diffing (line 173-186), so a stationary remote player who never moves a pixel after match start will send ZERO position updates after the first one. Bottom line: spawn is far too fragile.

---

### Cause #4 (MEDIUM): `#lastSentSnapshot` skip suppresses re-sends — late-opening channels miss the only spawn message

**Symptom:** A peer connection that opens 1-2 seconds late (slow ICE) sees the remote player STUCK at spawn forever, even after the channel opens, because the local player has been stationary and `sendPlayerUpdate` is short-circuiting on identical snapshots.

**Why 2 players masked it:** Both players are moving constantly in a 1v1 fight; a late-opened channel still gets a snapshot within 50 ms because state churns. With 3 players in a standoff, one player can sit still long enough for the diff-skip to suppress all sends.

**Code evidence:**
- `src/networking/network-manager.ts:173-186` — `sendPlayerUpdate` returns early if every field of the snapshot matches `#lastSentSnapshot`. This is computed once globally, NOT per-peer. There is no "force re-send to a newly-opened channel."
- Combined with `#broadcastUnreliable` at line 499-501: a channel that opens 800 ms after `lobby:started` will never see ANY message until the local player moves, casts, or changes element. If the player just stands there waiting for the action to start, the remote sees a missing avatar.
- Note: this is *partially* mitigated by `sendPosMirror` (line 231) which uses the socket directly with no diff-skip. But the mirror goes ONLY to the server's plausibility cache (`game-server/src/server.ts:258-266`), it is NOT relayed to peers.

**Confidence: MEDIUM.** Requires both a late-opening channel AND a stationary player. But it makes Causes #1/#2 strictly worse and explains the "appears for some games and not others" intermittency.

---

### Cause #5 (LOW-MEDIUM): NetworkManager singleton + state retention across teardown

**Symptom:** After leaving a match and starting another with different player count, stale entries from the prior session corrupt the new mesh.

**Why 2 players masked it:** Most repro happened on first-of-session matches; rematch wasn't tested per the user.

**Code evidence:**
- `NetworkManager` is a singleton (`src/networking/network-manager.ts:48, 78-83`). `teardownMesh` exists (line 130-136) but is **only called by tests**, never from any production scene shutdown (verified via Grep — only matches in `network-manager.test.ts`).
- `GameScene` shutdown at line 3097-3099 calls `nm.stopGameTick()` and clears `#remotePlayers`, but does NOT call `nm.teardownMesh()`. So `#peerConnections`, `#unreliableChannels`, `#reliableChannels`, `#socketToPlayerId`, `#matchPlayers` all persist across scene transitions until the next `lobby:started` overwrites them.
- `#matchPlayers = matchConfig.players` (line 287) replaces the array, but `#peerConnections` and the channel maps are NOT cleared. A new `#initWebRTCMesh` call (line 293) then iterates the NEW player list. For socket IDs that match a still-cached PC (e.g., same opponent in rematch), `#createPeerConnection` (line 382-386) will `.set(peerSocketId, pc)` and overwrite the prior PC reference, but the OLD `RTCPeerConnection` object is never `.close()`'d. It can still fire `onicecandidate` and `oniceconnectionstatechange` against the stale closure, polluting state.

**Confidence: LOW-MEDIUM.** Not a first-match repro, but a clear time bomb. Likely irrelevant to the user's specific bug ("yesterday 1v1 worked, today 3p doesn't") unless they were trying to rematch.

---

### Cause #6 (LOW): Pos-mirror to server is NOT a fallback relay — server never relays pos to other peers

**Symptom:** "I thought server-bound position mirror would compensate for a broken WebRTC channel." It does not.

**Code evidence:**
- `sendPosMirror` (`src/networking/network-manager.ts:155-158`) emits `game:pos-mirror` socket event.
- Server (`game-server/src/server.ts:258-266`) calls `room.recordPosition(playerId, x, y)` — the value goes into `#lastPos` for plausibility validation (`game-room.ts:140-143`). It is NOT broadcast to other clients.
- So when WebRTC `pos` channel fails between A and B, the server knows A's position perfectly, but doesn't tell B.

**Confidence: LOW** as a root cause — this isn't a defect; it's a missed opportunity. Mentioned because the prior analysis hints at it being a "Phase 9.3" mitigation that turns out not to mitigate the user-facing symptom at all.

---

### Causes ruled out (briefly)

- **ICE/STUN failure of one particular pairing on LAN:** Possible but unlikely. STUN with `stun.l.google.com` works for ~95% of residential NATs at 3 peers. A LAN setup (all 3 players on same WiFi) should get host-candidate ICE pairs in < 100 ms.
- **Data channel asymmetry (offerer creates, answerer doesn't open):** The code correctly uses `ondatachannel` on the answerer (`src/networking/network-manager.ts:426-429`). This is symmetric.
- **Position broadcast loop sending to one peer instead of all:** `#broadcastUnreliable`/`#broadcastReliable` correctly `for (const ch of this.#unreliableChannels.values())` (line 499). The shape is right. The defect is that some channels never make it into the Map.
- **Socket.io room membership desync:** Each client joins `lobby:${lobbyId}` server-side on `lobby:create`/`lobby:join` (`game-server/src/server.ts:111, 124`). `lobby:started` is broadcast `io.to(...)`. The server's set is authoritative and the protocol is symmetric. Not the bug.
- **Spell relay to host vs. all:** Spells are P2P via `events` channel; this is correct broadcast semantics if the channel opened. If it didn't, see Cause #1.

---

## 3. The smoking guns

### Smoking gun #1 — `src/networking/network-manager.ts:442-445` (early-ICE drop)

```ts
async #handleIceCandidate(fromSocketId: string, candidate: RTCIceCandidateInit): Promise<void> {
  const pc = this.#peerConnections.get(fromSocketId);
  if (pc) await pc.addIceCandidate(candidate);
}
```

**Fix sketch:** Maintain a per-peer ICE buffer. If `pc` is missing, push the candidate onto `#pendingIce.get(fromSocketId)`. In `#handleOffer` after `setRemoteDescription`, drain any buffered candidates for that peer with `for (const c of pending) await pc.addIceCandidate(c)`. Equally important: log a warn when this fires so the bug is visible in dev.

### Smoking gun #2 — `src/networking/network-manager.ts:497-505` (silent skip on non-open channels)

```ts
#broadcastUnreliable(data: object): void {
  const msg = JSON.stringify(data);
  for (const ch of this.#unreliableChannels.values()) {
    if (ch.readyState === 'open') {
      ch.send(msg);
      this.#msgSentCount++;
    }
  }
}
```

**Fix sketch:** This is fine for steady-state but masks the bug. Add an invariant: track expected peer set (`#matchPlayers.filter(p => p.socketId !== mySocketId)`) and emit a warning every second if `#unreliableChannels.size < expected`. Pair with a 10-second post-`lobby:started` timer that explicitly checks "did all channels open?" and emits a single hard error to the EVENT_BUS for UI surfacing. This converts silent failure into a visible one.

### Smoking gun #3 — `src/scenes/game-scene.ts:3858-3886` (avatar bootstrap is "first pos message wins")

```ts
#onRemotePlayerUpdate = (payload: PlayerUpdateBroadcast): void => {
  // ...
  let remote = this.#remotePlayers.get(payload.playerId);
  if (!remote) {
    // construct Player on first sighting
    remote = new Player({...});
    this.#remotePlayers.set(payload.playerId, remote);
  }
  // apply snapshot
};
```

**Fix sketch:** Pre-spawn all remote players from `matchConfig.players` in `GameScene.create()` using server-supplied spawn coordinates. Add `spawnX`/`spawnY`/`team` to `PlayerInfo` server-side (mirror what `game-room.ts:146-151` already computes per index — that data exists but is never sent to clients). Remote `Player` objects materialize at scene-load time and stay at their spawn point until `applySnapshot` overrides them. Side-effect: even with a broken P2P pos channel, you still see the opponent standing at their spawn point — a stationary ghost is more diagnosable than a missing one.

---

## 4. Testability gap

Minimum reproducible test (no physical hardware needed):

**Setup:** A Node-side integration test in `src/networking/` using three `NetworkManager` instances against the same in-process `socket.io` server, with `RTCPeerConnection` polyfilled by `wrtc` / `node-datachannel`.

**Procedure:**
1. Start an in-memory game server (use the same code path as `game-server/src/server.ts` — extract `createServer(io)` into a test export if not already).
2. Connect three socket.io clients with `NetworkManager.init`, create a lobby with the first, join with the second and third.
3. Capture `webrtc:ice` emissions on the signaling side; inject an **artificial reorder**: deliver one peer's first ICE candidate BEFORE the corresponding offer arrives, by buffering with a 50ms delay on the offer.
4. After 2 seconds, on each NetworkManager check `#peerConnections.size`, `#unreliableChannels.size`, `#reliableChannels.size` via a test-only getter, AND that every channel's `readyState === 'open'`.
5. Assert: all 3 peers see 2 open unreliable + 2 open reliable channels. Today's code will fail this — at least one channel will be `connecting` or never appear.

The injected ICE reorder is the exact race condition we suspect. If the test passes (channels open), the hypothesis is wrong. If it fails, we have repro on Cause #1.

A simpler smoke test that may also be enough: run the in-memory mesh setup 100 times without ICE injection and count how many runs leave at least one channel `!== 'open'` after 2 seconds. Non-zero failure rate = the race fires naturally.

---

## 5. Architectural verdict

The current WebRTC mesh is **structurally workable at 3+ players** but **operationally broken** in the current code. The defects are all local and fixable: buffer early ICE candidates (smoking gun #1), surface partial-mesh state instead of silently dropping (smoking gun #2), pre-spawn remote avatars from matchConfig instead of waiting for the first position packet (smoking gun #3), and force a re-send on channel open. None of these requires changing topology. The prior architectural analysis is correct that an authoritative server is the right long-term answer for 10+ player or competitive play, but for 3-6 player party play the mesh is fine if these handshake bugs are repaired. Migration to socket.io broadcast for position should NOT be the first move — it would mask Cause #1 by routing around it but would not fix the underlying ICE-drop bug, would inherit a 2x server bandwidth hit, and would discard the latency win that's the whole point of P2P. Fix the handshake first.
