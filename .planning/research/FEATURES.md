# Features Research — Co-op Spell-Combo Games

## Domain
2-player cooperative action game with elemental spell system, combo mechanics, environmental puzzles, and boss fights. 15-minute sessions. College event audience (students, casual gamers).

## Table Stakes (Must Have)

These are features players will expect to "just work". Missing any of these breaks the experience.

| Feature | Description | Complexity |
|---------|-------------|------------|
| Spell feedback | Spells feel impactful — hit-stop, screen shake, sound | Low |
| Clear combo indication | Players know when a combo triggered | Low |
| Visual distinction between players | P1 and P2 are clearly different at a glance | Low |
| Enemy health indication | Players can tell an enemy is dying | Low |
| Respawn / checkpoint | Dying shouldn't end the session abruptly | Medium |
| Pause / resume | Co-op events need pause for bathroom/distraction | Low |
| Tutorial or discovery onboarding | Players don't feel lost at the start | Medium |

## Differentiators (What Makes This Special)

| Feature | Why It Differentiates |
|---------|----------------------|
| Asymmetric elements | P1 and P2 are genuinely different — forced cross-player cooperation |
| Automatic combo detection | No button press needed — natural discovery through play |
| Environment-reactive puzzles | Spells affecting the world, not just enemies |
| Comedy NPCs | Personality and narrative investment from the devs |
| Fail-spawns-wave (puzzle failure) | Failure is still fun, not frustrating |
| Boss elemental weakness discovery | Players feel smart when they figure it out |

## Feature Categories

### Spell System
**Table stakes:**
- At least 1 spell per element per player
- Spells have distinct visual identities (color-coded)
- Mana cost and cooldown feedback

**Differentiators:**
- Cross-player spell collisions create combo effects
- Spells interact with environment (not just enemies)
- Combo journal that fills as players discover combos

### Combo System
**Table stakes:**
- Combos deal more damage than individual spells
- Visual effect distinguishes a combo from a regular hit

**Differentiators:**
- Combo effects vary by element pairing (not just "bigger explosion")
- Some combos create persistent effects (lava pool, ice wall, etc.)
- Combos have environmental applications (not only combat)

### Enemy Design
**Table stakes:**
- Enemies have readable attack telegraphs
- Clear death animations
- Varied movement patterns

**Differentiators:**
- Elemental resistances (forces spell variety)
- Enemies require combo to kill efficiently
- Mini-bosses that telegraph their elemental weakness

### Puzzle Rooms
**Table stakes:**
- Puzzles are clearly distinct from combat (separate rooms)
- Solution feedback is obvious (door opens, device activates)

**Differentiators:**
- Cross-player coordination required (can't solo)
- Environmental spells solution (not just "hit the switch")
- Timed puzzles with meaningful failure (enemy wave spawn)
- Sequence puzzles (order matters)

### Narrative / NPCs
**Table stakes:**
- An intro explains why the players are there
- An ending when the final boss is defeated

**Differentiators:**
- NPC dialogue with dev personality and in-jokes
- NPC hints at undiscovered combos
- Comedy beats between intense combat/puzzle sections

### HUD / UI
**Table stakes:**
- Both players' health and mana visible
- Active element indicator for each player
- Combo journal accessible somewhere in UI

**Differentiators:**
- "Ghost preview" of ally's active/charging spell (future stretch goal)

## Anti-Features (Deliberately Out of Scope)

| Feature | Why Excluded |
|---------|-------------|
| Progression / leveling | 15-min sessions don't need it; adds complexity |
| Solo mode | This game is co-op by design |
| More than 2 players | Scope control |
| Internet multiplayer | LAN only for the event |
| Competitive/PvP | Cooperative is the design pillar |
| Inventory management | Top-down action, not RPG |

## Dependencies Between Features

```
LAN sync ← everything multiplayer depends on this first
↓
Second player character + asymmetric element split
↓
Cross-player spell collision detection
↓
Combo effects (combat + environmental)
↓
Puzzle room interactables
↓
Boss elemental weakness system
↓
NPC hints (reference combos that already exist)
↓
Combo journal (records what's already been triggered)
```

## Complexity Estimates

| Feature | Effort | Risk |
|---------|--------|------|
| LAN networking (socket.io) | HIGH | HIGH — new dependency, new architecture |
| Second player | MEDIUM | MEDIUM — existing player class must support 2 instances |
| 3 new element spells (Ice/Wind/Thunder) | MEDIUM | LOW — pattern exists in codebase |
| Cross-player combo detection | MEDIUM | MEDIUM — requires networked spell state |
| Environmental interactables | MEDIUM | MEDIUM — new object type, new Tiled properties |
| Timed puzzles | LOW | LOW — Phaser timer already used |
| Comedy NPCs + dialogue | LOW | LOW — dialog system exists in UiScene |
| Boss AI (weakness + pattern) | HIGH | MEDIUM — state machines exist but boss design is complex |
| Combo journal UI | LOW | LOW — UI scene pattern established |
