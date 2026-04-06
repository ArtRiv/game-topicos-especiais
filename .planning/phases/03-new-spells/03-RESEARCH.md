# Research: Phase 3 — New Spells

**Date:** 2026-03-30
**Phase:** 3 — New Spells
**Req IDs:** SPL-01, SPL-02, SPL-03, SPL-04, SPL-05, PVP-01

---

## Validation Architecture

### Critical Behavioral Properties

| ID | Property | How to Verify |
|----|----------|---------------|
| V-1 | New spell instantiated with correct `element`, `spellId`, `spellType` readonly props | Unit: instantiate each new spell class, assert property values |
| V-2 | `SpellCastingComponent.castSpell()` dispatches correct spell for every element | Unit: spy on SPELL_FACTORY_REGISTRY, call castSpell for each element |
| V-3 | No magic numbers in new spell bodies — all stats from config.ts | Grep: `spellClass.ts` must contain no literals for damage/cost/cooldown |
| V-4 | Adding new element requires no modification to SpellCastingComponent body | Static: confirm `SpellCastingComponent` imports only registry; open/closed |
| V-5 | canCast() correctly gates mana and cooldown for all 6 elements | Unit: mock manaComponent, assert canCast returns false when insufficient |
| V-6 | Remote spell broadcast includes correct spellId | Integration: verify SpellCastBroadcast.spellId propagates through NetworkManager |

---

## 1. Spell System Architecture (Current State)

### SpellCastingComponent (`src/components/game-object/spell-casting-component.ts`)

```
#spellSlots = [
  { spellId: FIRE_BOLT,  manaCost: FIRE_BOLT_MANA_COST,  cooldown: FIRE_BOLT_COOLDOWN },
  { spellId: FIRE_AREA,  manaCost: FIRE_AREA_MANA_COST,   cooldown: FIRE_AREA_COOLDOWN },
];
```

**castSpell(slotIndex)** logic (BROKEN for ICE/WIND/THUNDER):
1. Checks `canCast(slotIndex)` — uses `#getEffectiveCooldown(slot.spellId)` which has if/else for FIRE/EARTH/WATER only
2. `switch(slot.spellId)` — FIRE_BOLT case: if/else on `activeElement`; only handles FIRE → FireBolt, EARTH → EarthBolt, WATER → WaterSpike
3. ICE/WIND/THUNDER: no case — falls through to `return undefined`

**Root cause of SPL-05 violation:** two if/else chains that must be extended per new element:
- `#getEffectiveCooldown()` — determines which cooldown constant to use
- `castSpell()` switch — determines which class to instantiate

### Registry Refactor Design (SPL-05 target state)

Replace both methods with two registry objects in `src/game-objects/spells/spell-registry.ts`:

```typescript
// Maps each Element to [slot0SpellId, slot1SpellId]
export const SPELL_SLOT_REGISTRY: Record<Element, readonly [SpellId | null, SpellId | null]>

// Maps SpellId → { manaCost, cooldown } (reads from config.ts constants)
export const SPELL_CONFIG: Record<SpellId, { manaCost: number; cooldown: number }>

// Maps SpellId → factory function
type SpellFactory = (scene: Phaser.Scene, x: number, y: number, tx: number, ty: number, dir: Direction) => ActiveSpell;
export const SPELL_FACTORY_REGISTRY: Record<SpellId, SpellFactory>
```

SpellCastingComponent becomes:
```typescript
public castSpell(slotIndex: 0 | 1, casterX, casterY, targetX, targetY): ActiveSpell | undefined {
  if (!this.canCast(slotIndex)) return undefined;
  const element = ElementManager.instance.activeElement;
  const spellId = SPELL_SLOT_REGISTRY[element][slotIndex];
  if (!spellId) return undefined;
  const cfg = SPELL_CONFIG[spellId];
  this.#manaComponent.consume(cfg.manaCost);
  this.#lastCastTime[slotIndex] = this.#scene.time.now;
  const dir = targetX < casterX ? DIRECTION.LEFT : DIRECTION.RIGHT;
  const spell = SPELL_FACTORY_REGISTRY[spellId](this.#scene, casterX, casterY, targetX, targetY, dir);
  // ... tracking and event emit unchanged
}
```

**Open/closed guarantee:** Adding ICE slot 1 later requires only:
1. New spell class file
2. Config constants in `config.ts`
3. `SPELL_SLOT_REGISTRY[ELEMENT.ICE][1] = SPELL_ID.NEW_SPELL`
4. Entry in `SPELL_FACTORY_REGISTRY`
5. Entry in `SPELL_CONFIG`
No changes to `SpellCastingComponent`, `ElementManager`, or `game-scene.ts` core logic.

### SpellCastingComponent slot tracking migration

Current `#spellSlots: SpellSlot[]` tracks `lastCastTime` per slot.
New: `#lastCastTime: [number, number] = [0, 0]` — simpler, same behavior.
The `SpellSlot` type and `spellSlots` getter become obsolete; no external code was found to rely on it.

---

## 2. Existing Spell Pattern (Reference Implementation)

### FireBolt (projectile pattern — ICE/WIND will follow this):

```
constructor(scene, x, y, targetX, targetY):
  → super(scene, x, y, ASSET_KEY)
  → scene.add.existing(this); scene.physics.add.existing(this)
  → body.setSize(4, 4, true)  // tight collider
  → velocity via Phaser.Math.Angle.Between
  → setRotation(angle)
  → this.play(ASSET_KEY)
  → scene.time.delayedCall(LIFETIME, () => this.destroy())
public explode(): void — plays impact animation, disables body, destroys after delay
```

### WaterSpike (area/targeted ground spell — THUNDER_STRIKE will follow this):

```
constructor(scene, targetX, targetY):
  → super(scene, targetX, targetY, ASSET_KEY)
  → multi-phase animation: STARTUP → RISE → LOOP → FADE
  → damage window during LOOP phase only
  → setBodyEnabled(false) initially, enable during LOOP
```

---

## 3. New Spell Designs

### ICE_SHARD (Element: ICE, Slot: 0, Type: PROJECTILE)

**Model:** FireBolt (directed projectile with velocity + rotation + explode on impact)

**Asset:** `public/assets/spells/Ice Effect 01/Ice VFX 1/IceVFX 1 Repeatable.png`
- Dimensions: **480×32** — 15 frames at **32×32** per frame (single row)
- Behavior: looping projectile animation while in flight

**Impact asset:** `public/assets/spells/Ice Effect 01/Ice VFX 1/Ice VFX 1 Hit.png`
- Dimensions: **384×32** — 12 frames at **32×32** per frame (single row)
- Behavior: play once, hideOnComplete

**ASSET_KEYS** to add: `ICE_SHARD`, `ICE_SHARD_HIT`

**Config constants to add (`config.ts`):**
```typescript
export const ICE_SHARD_DAMAGE = 1;
export const ICE_SHARD_MANA_COST = 1;
export const ICE_SHARD_COOLDOWN = 550;   // slightly slower than FireBolt (500ms)
export const ICE_SHARD_SPEED = 700;
export const ICE_SHARD_LIFETIME = 2200;
export const ICE_SHARD_IMPACT_FORWARD_OFFSET = 8;
```

**Collision in game-scene.ts:** explode on wall, `hit()` on enemy with instant damage.

---

### WIND_BOLT (Element: WIND, Slot: 0, Type: PROJECTILE)

**Model:** FireBolt — fast projectile, slightly higher damage (wind is swift)

**Asset:** `public/assets/spells/Wind Effect 01/Wind Projectile.png`
- Dimensions: **96×64** — **3 cols × 2 rows** at **32×32** per frame = 6 frames
- Behavior: looping

**Impact asset:** `public/assets/spells/Wind Effect 01/Wind Hit Effect.png`
- Dimensions: **96×64** — 6 frames at **32×32** per frame
- Behavior: play once, hideOnComplete

**ASSET_KEYS** to add: `WIND_BOLT`, `WIND_BOLT_HIT`

**Config constants to add:**
```typescript
export const WIND_BOLT_DAMAGE = 2;
export const WIND_BOLT_MANA_COST = 2;
export const WIND_BOLT_COOLDOWN = 700;
export const WIND_BOLT_SPEED = 900;       // faster than FireBolt
export const WIND_BOLT_LIFETIME = 1800;
export const WIND_BOLT_IMPACT_FORWARD_OFFSET = 8;
```

---

### THUNDER_STRIKE (Element: THUNDER, Slot: 0, Type: AREA)

**Model:** WaterSpike — targeted ground strike at cursor position

**Asset:** `public/assets/spells/Thunder Effect 02/Thunder Strike/Thunderstrike wo blur.png`
- Dimensions: **832×64** — treat as single row of **13 frames** at **64×64** per frame
- Behavior: startup phase (frames 0–5 forming), active phase (frames 6–12 full strike)

**Splash asset:** `public/assets/spells/Thunder Effect 02/Thunder Splash/Thunder splash wo blur.png`
- Dimensions: **672×48** — 14 frames at **48×48** per frame (single row)
- Behavior: play once after active phase, hideOnComplete

**ASSET_KEYS** to add: `THUNDER_STRIKE`, `THUNDER_SPLASH`

**Config constants to add:**
```typescript
export const THUNDER_STRIKE_DAMAGE = 3;
export const THUNDER_STRIKE_MANA_COST = 3;
export const THUNDER_STRIKE_COOLDOWN = 1200;
export const THUNDER_STRIKE_LOOP_DURATION = 400;   // active damage window (ms)
export const THUNDER_STRIKE_BODY_RADIUS = 20;
```

---

## 4. SPELL_ID Additions Required

In `src/common/common.ts`:
```typescript
export const SPELL_ID = {
  // existing...
  ICE_SHARD: 'ICE_SHARD',
  WIND_BOLT: 'WIND_BOLT',
  THUNDER_STRIKE: 'THUNDER_STRIKE',
} as const;
```

ELEMENT enum already has all 6 elements — no change needed.

---

## 5. Remote Spell Rendering (PVP-01 + N-Player)

**Current bug in `#onRemoteSpellCast`:**
```typescript
// BROKEN: re-emits SPELL_CAST which is a notification, not a creation command
// The only listener (#onLocalSpellCast) just re-sends to network
EVENT_BUS.emit(CUSTOM_EVENTS.SPELL_CAST, { ... });
```

**Fix:** Directly instantiate spell from registry in `#onRemoteSpellCast`:
```typescript
#onRemoteSpellCast = (payload: SpellCastBroadcast): void => {
  const factory = SPELL_FACTORY_REGISTRY[payload.spellId as SpellId];
  if (!factory) return;
  const dir = payload.direction as Direction;
  const spell = factory(this, payload.x, payload.y, payload.x, payload.y, dir);
  // Note: for remote spells, targetX/Y = caster position (direction already baked in)
  // Add to a shared remoteSpellGroup for wall collision
  this.#remoteSpellGroup?.add(spell.gameObject);
};
```

This requires:
- `#remoteSpellGroup: Phaser.GameObjects.Group` field on `GameScene`
- Wall collision registered for `#remoteSpellGroup` (explode projectiles on wall)
- Remote spells do NOT deal damage to local player (damage stays Phase 4 / PVP-02)
- Remote spells do NOT trigger `#onLocalSpellCast` (different event paths)

**N-player support:** `#remoteSpellGroup` collects spells from ALL remote players (no 1v1 assumption). Each remote spell is created and added to the same group regardless of sender. Phase 4 will add hit detection per-sender.

---

## 6. PVP-01 Verification

**Requirement:** No per-player loadout restrictions in code.

**Current state:**
- `ElementManager` is a singleton; calling `setElement(ELEMENT.ICE)` works for any client
- `RadialMenuScene` already lists all 6 elements: `[FIRE, THUNDER, EARTH, ICE, WIND, WATER]`
- `SpellCastingComponent` is per-Player instance (not shared)
- No player-index or team-based element restrictions anywhere in codebase

**Required action:** After registry refactor, `SPELL_SLOT_REGISTRY` must contain all 6 elements with valid SpellId entries (not null for slot 0). This ensures every element is castable by all players.

---

## 7. assets.json Entries Required

### ICE_SHARD
```json
{
  "path": "assets/spells/Ice Effect 01/Ice VFX 1",
  "files": [
    {
      "type": "spritesheet",
      "key": "ICE_SHARD",
      "url": "IceVFX 1 Repeatable.png",
      "frameConfig": { "frameWidth": 32, "frameHeight": 32 }
    },
    {
      "type": "spritesheet",
      "key": "ICE_SHARD_HIT",
      "url": "Ice VFX 1 Hit.png",
      "frameConfig": { "frameWidth": 32, "frameHeight": 32 }
    }
  ]
}
```

### WIND_BOLT
```json
{
  "path": "assets/spells/Wind Effect 01",
  "files": [
    {
      "type": "spritesheet",
      "key": "WIND_BOLT",
      "url": "Wind Projectile.png",
      "frameConfig": { "frameWidth": 32, "frameHeight": 32 }
    },
    {
      "type": "spritesheet",
      "key": "WIND_BOLT_HIT",
      "url": "Wind Hit Effect.png",
      "frameConfig": { "frameWidth": 32, "frameHeight": 32 }
    }
  ]
}
```

### THUNDER_STRIKE
```json
{
  "path": "assets/spells/Thunder Effect 02/Thunder Strike",
  "files": [
    {
      "type": "spritesheet",
      "key": "THUNDER_STRIKE",
      "url": "Thunderstrike wo blur.png",
      "frameConfig": { "frameWidth": 64, "frameHeight": 64 }
    }
  ]
},
{
  "path": "assets/spells/Thunder Effect 02/Thunder Splash",
  "files": [
    {
      "type": "spritesheet",
      "key": "THUNDER_SPLASH",
      "url": "Thunder splash wo blur.png",
      "frameConfig": { "frameWidth": 48, "frameHeight": 48 }
    }
  ]
}
```

---

## 8. Dependency Map

```
03-01 (spell registry + SPELL_ID stubs + refactored SpellCastingComponent)
    ↓
03-02 (IceShard class)   ←─ Wave 2 (parallel)
03-03 (WindBolt class)   ←─ Wave 2 (parallel)
03-04 (ThunderStrike)    ←─ Wave 2 (parallel)
    ↓
03-05 (game-scene collision + remote spell rendering + PVP-01 gate)
```

03-01 must complete before 03-02/03/04 because:
- SPELL_ID.ICE_SHARD/WIND_BOLT/THUNDER_STRIKE enum entries are added in 03-01
- SPELL_SLOT_REGISTRY/SPELL_FACTORY_REGISTRY are defined in 03-01 (new spell plans fill in entries)
- `SpellCastingComponent` imports the registry from 03-01

03-02/03/04 can be parallel (different files, no shared writes except `spell-registry.ts` stubs already present from 03-01).

03-05 must come last because it registers collision for all new spell types in `game-scene.ts`.

---

## 9. RUNTIME_CONFIG Additions

For future debug-panel live-tuning, add to `src/common/runtime-config.ts`:
```typescript
ICE_SHARD_DAMAGE,
ICE_SHARD_SPEED,
ICE_SHARD_COOLDOWN,
WIND_BOLT_DAMAGE,
WIND_BOLT_SPEED,
WIND_BOLT_COOLDOWN,
THUNDER_STRIKE_DAMAGE,
THUNDER_STRIKE_COOLDOWN,
```

Spell classes must read from `RUNTIME_CONFIG.*` (not directly from config.ts constants) so debug panel overrides work — matching the existing pattern.

---

## 10. Key Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Asset fileUrl typo (spaces in folder names) | Preload fails silently | Double-check each path against actual directory listing |
| Frame dimensions wrong | Animation glitches/misaligned | Verify visually in-game; adjust frameWidth/Height in assets.json |
| `#lastCastTime` array indices out of sync with slot indices | Wrong cooldown tracked | TypeScript: type slotIndex as `0 \| 1` everywhere |
| Remote spell group leaks on scene restart | Memory / physics body leak | Destroy group contents in GameScene shutdown handler |
| `#onLocalSpellCast` triggered by remote spell re-emit | Infinite relay loop | Fix: remote path must NOT emit `CUSTOM_EVENTS.SPELL_CAST` |
