---
status: testing
phase: 01-lan-foundation
source:
  - 01-01-SUMMARY.md
  - 01-02-SUMMARY.md
  - 01-03-SUMMARY.md
  - 01-04-SUMMARY.md
  - 01-05-SUMMARY.md
started: 2026-03-30T00:00:00Z
updated: 2026-03-30T12:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 9
name: Disconnect Detection
expected: |
  With both tabs in GameScene, close or hard-refresh Tab 1.
  Tab 2 should display a brief on-screen message such as "A player disconnected"
  (visible for roughly 3 seconds) and the remote player character should disappear
  from the screen. No crash or freeze on Tab 2.
result: issue
reported: "no disconnect message shown; after some time Tab 2 freezes"
severity: blocker

## Tests

### 1. Cold Start Smoke Test
expected: |
  Kill any running server process. In the game-server/ directory, run:
    cd game-server && node dist/server.js
  (or via ts-node: npx ts-node src/server.ts)
  The server should boot without errors, print something like
  "Socket.io server listening on port 3000", and keep running.
  Then open http://localhost:5173 in a browser tab — the LobbyScene
  should appear (IP input, nickname input, CONNECT button), not a blank screen or crash.
result: pass

### 2. Connect to Server
expected: |
  In the LobbyScene, enter "http://localhost:3000" in the IP field and
  any nickname in the Name field, then click CONNECT.
  The view should transition to the Lobby List view showing a CREATE LOBBY
  button and an empty list (or existing lobbies if any). No error messages.
result: pass

### 3. Create a Lobby
expected: |
  In the Lobby List view, click CREATE LOBBY.
  The view transitions to a Waiting Room showing your nickname with a
  host label ("HOST") and a START GAME button visible only to you.
  The lobby is now visible in the list if another tab opens the lobby list.
result: pass

### 4. Join a Lobby from a Second Tab
expected: |
  Open a second browser tab, navigate to http://localhost:5173.
  Connect with a different nickname.
  The Lobby List should show the lobby created in the previous test.
  Click the lobby row — the second player joins and both tabs' Waiting Room
  shows both player names listed. The first player (host) still sees START GAME.
result: pass

### 5. Host Starts the Match — Both Tabs Transition
expected: |
  In the Waiting Room, the host (Tab 1) clicks START GAME.
  Both tabs simultaneously leave the Waiting Room and transition to
  the game (PreloadScene then GameScene). Neither tab stays stuck on the lobby.
result: pass

### 6. Two Players See Each Other Moving in Real Time
expected: |
  With both tabs in GameScene, move the player on Tab 1 using WASD or arrow keys.
  Tab 2 should show a second character (remote player, with a color tint different
  from the local player) moving in real time, roughly matching Tab 1's movement.
  Latency on LAN should feel near-instant (< 100 ms visual lag).
result: issue
reported: "movement works — can see the other player moving — but the mage's animation isn't working, he's just floating around (no walk/run animation on the remote player)"
severity: major

### 7. Spell Cast Appears on the Other Client
expected: |
  On Tab 1, cast a spell (standard spell-cast input).
  Tab 2 should show the spell appearing at the correct screen position with
  the correct visual effect — not at origin (0,0) or missing entirely.
result: issue
reported: "no spells are being transmitted either — spells cast on Tab 1 do not appear on Tab 2 at all"
severity: blocker

### 8. Room Transition Syncs Both Clients
expected: |
  On Tab 1, move the player through a door that triggers a room/level transition.
  Both Tab 1 and Tab 2 should transition to the new room at the same time
  (within ~1 second of each other). Neither tab should be left on the old level
  while the other is on the new one.
result: pass

### 9. Disconnect Detection
expected: |
  With both tabs in GameScene, close or hard-refresh Tab 1.
  Tab 2 should display a brief on-screen message such as "A player disconnected"
  (visible for roughly 3 seconds) and the remote player character should disappear
  from the screen. No crash or freeze on Tab 2.
result: issue
reported: "no disconnect message shown; after some time Tab 2 freezes"
severity: blocker

## Summary

total: 9
passed: 6
issues: 3
pending: 0
skipped: 0

## Gaps

- truth: "Remote player should play walk/run animation when moving"
  status: fixed
  reason: "User reported: mage's animation isn't working, he's just floating around (no walk/run animation on the remote player)"
  severity: major
  test: 6
  fix: "In #onRemotePlayerUpdate: added remote.direction = payload.direction and remote.stateMachine.setState(payload.state) before applySnapshot()"
  artifacts: [src/scenes/game-scene.ts]

- truth: "Spell cast by local player should appear on the remote client's screen at the correct position"
  status: fixed
  reason: "User reported: no spells are being transmitted — spells cast on Tab 1 do not appear on Tab 2 at all"
  severity: blocker
  test: 7
  fix: "Added #onLocalSpellCast listener for CUSTOM_EVENTS.SPELL_CAST in #setupNetworking; calls nm.sendSpellCast with element/position/direction from local player"
  artifacts: [src/scenes/game-scene.ts]

- truth: "When a player disconnects, the remaining client shows a brief message and the remote player disappears; no freeze"
  status: fixed
  reason: "User reported: no disconnect message shown; after some time Tab 2 freezes"
  severity: blocker
  test: 9
  fix: "Added game:player-disconnected socket.io listener in NetworkManager#bindSocketEvents; immediately closes peer connection and emits NETWORK_PLAYER_DISCONNECTED instead of waiting 30s for ICE timeout"
  artifacts: [src/networking/network-manager.ts]
