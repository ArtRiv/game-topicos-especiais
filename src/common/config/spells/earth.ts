// EARTH element — Earth Bolt (projectile), Earth Bump (knockback), Earth Wall
// (draw-mode pillars). Also: Earth × Fire combos (Lava Pool, Earth-Fire Explosion).

// ─── Earth Bolt (projectile) ──────────────────────────────────────────────────
// sprite origin tuning, same rationale as FIRE_BOLT_SPRITE_ORIGIN_Y.
export const EARTH_BOLT_SPRITE_ORIGIN_X = 0.5;
export const EARTH_BOLT_SPRITE_ORIGIN_Y = 0.5;
export const EARTH_BOLT_DAMAGE = 1;
export const EARTH_BOLT_MANA_COST = 1;
export const EARTH_BOLT_COOLDOWN = 600; // ms - slightly slower than fire bolt
export const EARTH_BOLT_SPEED = 600; // slower, heavier rock
export const EARTH_BOLT_LIFETIME = 2200; // ms before auto-destroy
export const EARTH_BOLT_IMPACT_FORWARD_OFFSET = 16;
// The impact sprite is drawn horizontally while the firebolt's is vertical — offset by 90° so both align the same way.
export const EARTH_BOLT_IMPACT_ROTATION_OFFSET = Math.PI / 2;

// ─── Earth Bump (knockback spell) ─────────────────────────────────────────────
export const EARTH_BUMP_DAMAGE = 1;
export const EARTH_BUMP_MANA_COST = 1;
export const EARTH_BUMP_COOLDOWN = 1000; // ms
export const EARTH_BUMP_DURATION = 250; // time it stays "fully out" before sinking (was 800)
export const EARTH_BUMP_BODY_RADIUS = 16;
export const EARTH_BUMP_KNOCKBACK_FORCE = 450;
export const EARTH_BUMP_KNOCKBACK_DURATION = 220;
// How far ABOVE the cursor target the bump's sprite anchor sits. Higher =
// the visible bump appears farther up from the click point. The bump's
// physics body is centered on the sprite, so this also raises the hitbox.
export const EARTH_BUMP_CURSOR_Y_OFFSET = 8;

// ─── Earth Wall (area protection, draw-mode) ──────────────────────────────────
// ─── EarthWall pulverize (VoidOrb + EarthWall instant-shatter VFX) ──────────
// Replaces the default crumble-sink-into-floor animation when the pillar is
// destroyed by an orb. Pixel chunks burst out of the pillar's bounds and fly
// INTO the orb so the visual reads as "the wall is being eaten by the void".
// The chunks landing on the orb sprite produce the "brown pixels appear on
// the orb" feel the user asked for, without a separate overlay system.
export const EARTH_WALL_PULVERIZE_CHUNK_COUNT = 24;        // chunks per pulverize
export const EARTH_WALL_PULVERIZE_CHUNK_SIZE_MIN_PX = 1;   // chunk side length (px) — picked uniformly
export const EARTH_WALL_PULVERIZE_CHUNK_SIZE_MAX_PX = 3;
export const EARTH_WALL_PULVERIZE_CHUNK_DURATION_MS = 350; // time to fly from pillar → orb
export const EARTH_WALL_PULVERIZE_TINT_LIGHT = 0x8b6332;   // alternating chunk colours
export const EARTH_WALL_PULVERIZE_TINT_DARK = 0x4a3520;
// Random offset (px) added to each chunk's arrival point on the orb so they
// don't all collapse on one pixel — they scatter across the orb's silhouette.
export const EARTH_WALL_PULVERIZE_ARRIVAL_JITTER_PX = 10;

// Continuous "being ground down" dust while a pillar is being pulled by an
// orb (before it hits the crumble radius). Cheap per-pillar emission: a few
// chunks at a long interval. Same chunk-tween shape as pulverize, just on a
// slower drip. Set DARK_PULL_DUST_PER_EMIT to 0 to disable entirely.
export const EARTH_WALL_DARK_PULL_DUST_INTERVAL_MS = 120;
export const EARTH_WALL_DARK_PULL_DUST_PER_EMIT = 2;
export const EARTH_WALL_DARK_PULL_DUST_DURATION_MS = 280;

export const EARTH_WALL_PILLAR_HP = 5;
export const EARTH_WALL_PILLAR_COUNT = 8;
export const EARTH_WALL_PILLAR_SPACING = 8;
export const EARTH_WALL_DURATION = 16000; // ms the wall stays up
export const EARTH_WALL_MANA_COST = 0;
export const EARTH_WALL_COOLDOWN = 2000; // ms
export const EARTH_WALL_HIT_FLASH_DURATION = 80; // ms white flash on hit
export const EARTH_WALL_FIREBOLT_SPLASH_RADIUS = 24; // px — FireBolt hit damages adjacent pillars within this radius
// Pillar collision body size (px). Smaller = looser fit; the 32×32 sprite has a
// lot of visual whitespace at the base, so the body should be tighter than the
// frame. The body is centered in the frame (offset auto-computed by setSize's
// `center=true` flag in earth-wall-pillar.ts).
export const EARTH_WALL_PILLAR_BODY_WIDTH = 10;
export const EARTH_WALL_PILLAR_BODY_HEIGHT = 16;

// ─── EarthBolt + FireArea combo (NEW): molten lava-leaving projectile ─────
// When an EarthBolt passes through a FireArea, it becomes molten — keeps
// traveling, deals more damage on impact, and DROPS A LAVA PUDDLE wherever
// it lands instead of just exploding. (Old burst behaviour kept as the
// "instant-explosion" branch via EarthFireBurst; this flow runs when the
// bolt continues past the fire.)
export const MOLTEN_BOLT_DAMAGE_MULTIPLIER = 1.5; // 1.5× normal earth bolt damage (event nerf: was 2.0)
export const MOLTEN_BOLT_TINT = 0xff7a33;          // orange glow on the bolt sprite

// ─── EarthBolt + FireArea combo: Lava Pool ────────────────────────────────────
export const LAVA_POOL_DAMAGE_PER_TICK = 1;
export const LAVA_POOL_TICK_INTERVAL = 600; // ms between damage ticks
export const LAVA_POOL_DURATION = 150000; // ms the pool stays active
export const LAVA_POOL_SCALE = 1.5; // visual scale
export const LAVA_POOL_BODY_RADIUS = 14; // AoE circle radius in px

// ─── EarthBolt + FireArea combo (NEW): single-burst explosion ────────────────
// Replaces the lingering lava pool with a one-shot explosion. Three art
// variants are loaded (VFX1/VFX2/VFX3) — flip the variant to A/B which one
// reads best in-game.
export type EarthFireBurstVariant = 'VFX1' | 'VFX2' | 'VFX3';
export const EARTH_FIRE_BURST_VARIANT: EarthFireBurstVariant = 'VFX2';
// Damage dealt by the burst (single hit per enemy while the body is active —
// the explosion is brief, not a tick-damage pool).
export const EARTH_FIRE_BURST_DAMAGE = 2;
// Visual scale of the 128×128 burst sprite. 0.6 reads as a roughly 80px-wide
// explosion on the game's 480-wide canvas.
export const EARTH_FIRE_BURST_SCALE = 0.6;
// Radius (px) of the circular damage body, in WORLD units (after scale is
// applied by Phaser to the sprite, the body is still measured in texture px;
// keep this tight so the explosion only damages things in the visible core).
export const EARTH_FIRE_BURST_BODY_RADIUS = 22;

// ─── Earth + Fire combo explosion ─────────────────────────────────────────────
export const EARTH_FIRE_EXPLOSION_DAMAGE = 3; // event nerf: was 5 = 50% of 10 HP
export const EARTH_FIRE_EXPLOSION_SCALE = 2.0;
export const EARTH_FIRE_EXPLOSION_BODY_RADIUS = 20;
