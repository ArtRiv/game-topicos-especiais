# Research Summary — Mages Co-op

## Key Findings

### Stack
- **Networking:** socket.io 4.x (server) + socket.io-client (browser) on Node.js 20
- **Architecture:** Dedicated server (Node.js) holds authoritative game state; Phaser clients sync at 20 Hz
- **Sync model:** Full state broadcast (positions + spell events); client interpolates remote entities
- **No new game engine tech needed** — socket.io integrates cleanly with existing Phaser/TypeScript stack

### Table Stakes (Without These, Players Leave)
1. Both players visually distinct at a glance
2. Combo triggers must have clear visual feedback
3. Enemy health must be readable
4. Players must be able to see each other moving in real time
5. A tutorial/intro NPC so players aren't confused from the start

### Differentiators (Why People Will Remember This Game)
1. **Asymmetric elements** — forces real cooperation; you literally can't win alone
2. **Environmental spell combos** — spells interact with the world, not just enemies
3. **Comedy NPCs** — dev personality embedded in dialogue
4. **Failure-spawns-enemies** — puzzle failure is still fun, not frustrating

### Architecture Decisions Made
| Decision | Rationale |
|----------|-----------|
| socket.io over WebRTC | LAN game — no P2P benefit; socket.io has simpler server setup |
| Server-authoritative enemies | Prevents physics desync between two Phaser simulations |
| Client-authoritative local player | Responsive feel; position confirmed by server after the fact |
| Server confirms combo events | Prevents double-trigger race conditions |
| Full state sync at 20 Hz (not delta) | Simpler to implement; LAN latency makes this imperceptible |

### Watch Out For (Top Risks)
1. **Don't build gameplay before LAN sync works** — everything breaks when networking is added late
2. **Don't implement rollback netcode** — overkill for 2 players on LAN, weeks of lost time
3. **Don't let GameScene absorb networking** — create NetworkManager, PuzzleRoomManager, ComboRegistry as separate classes
4. **Design Tiled property schema before building puzzle rooms** — redesigning maps is expensive
5. **Build an AI stub P2** — so one dev can test two-player features solo

### Build Order (Dependencies)
```
1. LAN foundation (server + lobby + P2 visible)
2. P2 playable (asymmetric elements, full input)
3. Spell sync + cross-player combos
4. New element spells (Ice/Wind/Thunder)
5. Environmental interactables + puzzle rooms
6. NPC dialogue + combo hints
7. Boss fights with elemental weaknesses
8. Combo journal + UI polish
```

## Research Files
- [STACK.md](.planning/research/STACK.md) — socket.io 4.x, Node.js server, version details
- [FEATURES.md](.planning/research/FEATURES.md) — table stakes vs differentiators, complexity estimates
- [ARCHITECTURE.md](.planning/research/ARCHITECTURE.md) — component design, data flow, integration points
- [PITFALLS.md](.planning/research/PITFALLS.md) — 10 critical pitfalls with prevention strategies

## Confidence Levels
| Area | Confidence | Notes |
|------|-----------|-------|
| socket.io for LAN | HIGH | Very standard for browser multiplayer |
| Sync model (20Hz full state) | HIGH | Works fine for 2 players on LAN |
| Reusing CharacterGameObject for P2 | HIGH | Architecture supports it |
| Combo detection via server confirm | MEDIUM | Simple to implement; may need iteration |
| Puzzle room Tiled schema | MEDIUM | Needs design session before implementation |
| Boss weakness system | MEDIUM | State machine pattern exists; boss design is game design, not tech |
