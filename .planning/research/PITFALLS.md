# Pitfalls Research — Co-op Phaser 3 LAN Game

## Domain
Adding LAN multiplayer, cross-player combo system, and environmental puzzles to an existing single-player Phaser 3 codebase in 3-4 months.

---

## CRITICAL Pitfalls

### 1. Building gameplay features before networking works

**Warning signs:** You find yourself adding new spells or puzzle rooms before P2 is connected and moving on both screens.

**Why it's fatal:** Everything you build assumes single-player. When you add networking later, half of it breaks — spell positions, enemy state, room transitions all need to be re-engineered.

**Prevention:** Make "P2 sees P1 moving on their screen" the first milestone gate. Nothing else merges until that works.
**Phase:** Phase 1 (networking must be the first deliverable).

---

### 2. Networking scope creep — building a real-time engine when you need a toy

**Warning signs:** You start implementing client-side prediction, rollback netcode, lag compensation, delta compression.

**Why it's fatal:** These are weeks of work for professional multiplayer engineers. On LAN with 2 players and <5ms latency, none of it matters.

**Prevention:** Implement "dumb" sync first — broadcast full state at 20Hz, interpolate remote entities, send input events to server. Ship it. Optimize only if players complain about lag (they won't on LAN).
**Phase:** Phase 1.

---

### 3. Trying to keep Phaser's Arcade Physics authoritative across two clients

**Warning signs:** You're trying to run `this.physics.overlap()` on both clients and expecting the same result.

**Why it's fatal:** Floating-point physics diverge. Two simulations running independently will desync within seconds.

**Prevention:** Designate ONE place as truth for each system:
- Enemy positions: server authoritative
- Local player position: client authoritative (send to server, server broadcasts)
- Spell collision for combos: server authoritative OR client detects + server confirms
**Phase:** Phase 1 architecture decision.

---

### 4. Cross-player combo detection race condition

**Warning signs:** Combos trigger twice, or trigger on one client but not the other.

**Why it's fatal:** A combo that deals damage on Client A but not B will desync health and make the game feel broken.

**Prevention:** Server is the single authority for combo events. When client detects potential combo, it sends `COMBO_CHECK` to server. Server confirms once and emits `COMBO_TRIGGERED` to all clients. Both clients then execute the effect.

Alternatively: Only the "caster" client detects — P1's client detects when P1's spell hits P2's spell. Server relays the combo event. No double-detection.
**Phase:** Phase 3 (spell sync).

---

### 5. God-scene getting worse

**Warning signs:** You add multiplayer by stuffing more private fields and methods directly into `GameScene` (which is already 1311 lines).

**Why it's fatal:** `GameScene` is already the biggest risk in the codebase. Adding networking, two-player state, puzzle room management, and combo tracking inline will make it unmaintainable within weeks.

**Prevention:**
- Create `NetworkManager` as a standalone singleton (not inside GameScene)
- Create `PuzzleRoomManager` as a separate class
- Create `ComboRegistry` as a separate class
- GameScene orchestrates, it doesn't implement
**Phase:** Before Phase 1 networking code is merged.

---

### 6. Tiled map requires significant rework for puzzle rooms

**Warning signs:** You assume existing dungeon maps will work for puzzle rooms without redesign.

**Why it's fatal:** Environmental interactables require new Tiled object types, new properties, new layer parsing. If you don't plan the Tiled schema before building 5 levels, you'll redo maps repeatedly.

**Prevention:** Define the full Tiled property schema for interactables, room types, and puzzle configs BEFORE building any puzzle room. Then build one reference puzzle room and test the full flow. Only then build more.
**Phase:** Phase 5 (puzzle rooms) — design schema first.

---

### 7. Asymmetric elements feel unbalanced in playtesting

**Warning signs:** One player's elements are consistently more useful, or one player feels irrelevant in boss fights.

**Why it's fatal:** It breaks the co-op fantasy — both players should feel essential.

**Prevention:** Design each boss fight so it explicitly requires both element sets. P1's Fire is weak against Ice-resistant boss; P2's Thunder handles the shield; P1 finishes with Earth combo. Plan boss design around forcing both players to participate.
**Phase:** Phase 6 (boss design).

---

### 8. Puzzle rooms blocking solo testers during development

**Warning signs:** You can't test a puzzle room because it requires two connected players.

**Why it's fatal:** Iteration speed collapses. You can't fix a bug if you can't repro it alone.

**Prevention:** Build an `AIInputComponent` stub: a second player controlled by simple AI so one developer can test two-player features solo. Even a simple "follow player 1" AI is enough for puzzle testing.
**Phase:** Phase 2 (second player).

---

### 9. "We'll add NPCs at the end" → no time for NPCs

**Warning signs:** NPC dialogue is not scoped until after all gameplay is done.

**Why it's fatal:** NPCs are load-bearing for the "light narrative" requirement and for combo hint delivery. Cut them and players feel lost; add them rushed and they feel empty.

**Prevention:** NPC system exists already (dialog box + text in UiScene). Write the actual dialogue text early — it takes 2 hours, not 2 weeks. Placeholder NPCs in early builds, fill dialogue in milestone 2.
**Phase:** Don't defer past Phase 5.

---

### 10. Event bus not cleaned up → memory leaks and ghost events

**Warning signs:** After a game restart (death → lobby → new game), old events still fire from the previous session.

**Why it's fatal:** Co-op games need clean reconnect flows. Stale network event listeners from a previous session can re-trigger combo effects, HUD updates, or ghost enemy spawns.

**Prevention:** Call `EVENT_BUS.removeAllListeners()` on scene shutdown. Use `scene.events.on('shutdown', cleanup, this)` to guarantee cleanup. This is already partially done in the codebase — enforce it as a code review rule.
**Phase:** Phase 1 (before networking events are added to the bus).

---

## Summary Table

| Pitfall | Severity | Phase |
|---------|----------|-------|
| Gameplay before networking works | CRITICAL | Phase 1 |
| Networking scope creep | HIGH | Phase 1 |
| Physics desync across clients | HIGH | Phase 1 |
| Combo detection race condition | HIGH | Phase 3 |
| God-scene gets worse | HIGH | Phase 1 |
| Tiled schema not designed upfront | MEDIUM | Phase 5 |
| Asymmetric balance issues | MEDIUM | Phase 6 |
| Can't test puzzles solo | MEDIUM | Phase 2 |
| No time for NPCs | MEDIUM | Phase 5 |
| Event bus memory leaks | MEDIUM | Phase 1 |
