// WIND element — Wind Bolt (projectile) and Air Burst (super-dash spell).

// ─── Wind Bolt (projectile) ───────────────────────────────────────────────────
// Fast projectile with near-fireball speed; matched to fireball's 1 half-heart
// so its speed isn't also rewarded with extra damage. (event balance pass: was 2)
export const WIND_BOLT_DAMAGE = 1;
export const WIND_BOLT_MANA_COST = 2;
export const WIND_BOLT_COOLDOWN = 700; // ms
export const WIND_BOLT_SPEED = 900;
export const WIND_BOLT_LIFETIME = 1800; // ms
export const WIND_BOLT_IMPACT_FORWARD_OFFSET = 8;

// ─── Flame Slash combo (WindBolt + FireArea) ─────────────────────────────────
// When a WindBolt passes through a FireArea it ignites into a "Flame Slash":
// the bolt continues at its normal speed but deals bonus damage, tints
// warm-orange, emits rising ember particles (same pattern as lava puddles),
// and carries a soft red glow underneath. Idempotent per bolt — repeated
// FireArea pass-throughs are no-ops.
export const FLAME_SLASH_DAMAGE_MULT = 1.6;
// User-picked palette (warm reds, ochres, creams). Cycled per ember and used
// as the bolt's body tint (picks index 0 — the deepest red).
export const FLAME_SLASH_PALETTE = [0xda863e, 0xcf573c, 0xe8c170, 0xebede9] as const;
export const FLAME_SLASH_TINT = FLAME_SLASH_PALETTE[0];
// Ember emission tuning — mirrors the lava-puddle ember pattern but tighter
// since the bolt is small and moves fast.
export const FLAME_SLASH_EMBER_INTERVAL_MS = 40;
export const FLAME_SLASH_EMBER_PER_EMIT_MIN = 1;
export const FLAME_SLASH_EMBER_PER_EMIT_MAX = 2;
export const FLAME_SLASH_EMBER_SIZE_PX_MIN = 1;
export const FLAME_SLASH_EMBER_SIZE_PX_MAX = 2;
export const FLAME_SLASH_EMBER_RISE_PX_MIN = 6;
export const FLAME_SLASH_EMBER_RISE_PX_MAX = 12;
export const FLAME_SLASH_EMBER_LIFETIME_MS = 280;
export const FLAME_SLASH_EMBER_SPAWN_RADIUS_PX = 3;
// Soft glow that follows the bolt — additive blend so it reads as light, not
// a sprite. White inner core + red outer halo for the "hot tip" look.
export const FLAME_SLASH_GLOW_INNER_COLOR = 0xffffff;
export const FLAME_SLASH_GLOW_OUTER_COLOR = 0xcf573c;
export const FLAME_SLASH_GLOW_INNER_RADIUS_PX = 2;
export const FLAME_SLASH_GLOW_OUTER_RADIUS_PX = 5;
export const FLAME_SLASH_GLOW_INNER_ALPHA = 0.75;
export const FLAME_SLASH_GLOW_OUTER_ALPHA = 0.35;

// ─── WindBolt + FireBolt: split combo ────────────────────────────────────────
// The FireBolt is cut in half — two smaller FireBolts spawn forward at
// slight opposite angles. Each child carries reduced damage + smaller scale.
// Spawned via direct FireBolt construction (not the registry) so we can place
// them at the mid-point with custom angles; they then participate in the
// normal damage pipeline.
export const WIND_FIRE_SPLIT_ANGLE_RAD = 0.35;       // ±20° spread off the original heading
export const WIND_FIRE_SPLIT_CHILD_SCALE = 0.65;
export const WIND_FIRE_SPLIT_CHILD_DAMAGE_MULT = 0.5;
export const WIND_FIRE_SPLIT_FORWARD_OFFSET_PX = 6;  // nudge children forward so they don't re-overlap each other

// ─── WindBolt + WaterTornado: absorbed → cone burst ──────────────────────────
// The bolt is consumed; the tornado is force-ended; a cone of water puddles is
// scattered ahead of the bolt's travel direction.
export const WIND_TORNADO_CONE_RANGE_PX = 56;
export const WIND_TORNADO_CONE_HALF_ANGLE_RAD = 0.5; // ~±28°
export const WIND_TORNADO_CONE_PUDDLE_COUNT = 12;
export const WIND_TORNADO_CONE_PUDDLE_AMOUNT = 2;

// ─── WindBolt + Puddle: push combo ───────────────────────────────────────────
// On overlap, displace the puddle along the bolt's velocity. Water moves the
// most, mud less, lava barely at all (heavy molten rock). One-shot per
// (bolt, puddle) pairing — tracked via a per-bolt Set on the bolt itself.
export const WIND_PUDDLE_PUSH_PX_WATER = 56;
export const WIND_PUDDLE_PUSH_PX_MUD = 20;
export const WIND_PUDDLE_PUSH_PX_LAVA = 6;
// Push glides over this many ms instead of snapping instantly. Water glides
// fastest, lava is sluggish.
export const WIND_PUDDLE_PUSH_DURATION_MS_WATER = 220;
export const WIND_PUDDLE_PUSH_DURATION_MS_MUD = 280;
export const WIND_PUDDLE_PUSH_DURATION_MS_LAVA = 340;

// ─── Air Burst (wind super-dash spell) ────────────────────────────────────────
// Reuses Player.dash() with overridden distance and duration — see Player.dashSuper().
// The VFX is the 3x3 Air Burst sheet anchored behind the caster relative to the dash
// direction.
export const AIR_BURST_MANA_COST = 4;
export const AIR_BURST_COOLDOWN = 2500; // ms — longer than regular dash so it's a deliberate ability
export const AIR_BURST_DISTANCE_TILES = 3; // ~3x the regular dash distance (regular is 1)
export const AIR_BURST_DURATION_MS = 220; // slightly longer than regular dash (150) so the dash reads as bigger
export const AIR_BURST_VFX_OFFSET_PX = 14; // px the burst sprite sits behind the player along the dash axis
export const AIR_BURST_VFX_SCALE = 1.0; // sprite scale multiplier

// Vertical arc height (px) the mage's roll sprite "lifts" during the dash.
// Pure visual — applied as offset = -sin(t * π) * ARC_LIFT_PX where t goes
// 0 → 1 over the dash duration, so the sprite rises smoothly to the peak at
// the midpoint and lands at 0 again. Set to 0 for a flat ground dash.
export const AIR_BURST_ARC_LIFT_PX = 18;
// Multiplier applied to the roll sprite's scale during the super-dash so the
// mage reads slightly "bigger" in the air. Stacks with DASH_ROLL_SCALE.
export const AIR_BURST_SCALE_BOOST = 1.2;
// I-frame window (ms) granted during the super-dash so the mage can fly
// through incoming projectiles. Always applied for super-dash (independent of
// DASH_IFRAMES_ENABLED, which gates the regular dash). Keep slightly larger
// than AIR_BURST_DURATION_MS so there's no frame where i-frames lapse before
// the mage has actually landed.
export const AIR_BURST_IFRAME_MS = 280;
// Extra rotation (radians) added to the trail sprite's angle so the leading
// edge tilts UP relative to the dash direction — matches the parabolic arc
// (mage isn't moving flat forward, they're angled up). Sign is auto-flipped
// based on horizontal dash direction so "up" stays world-up regardless of
// left- vs right-dashes. 0 = no tilt (flat trail along the dash axis).
// 0.35 rad ≈ 20°.
export const AIR_BURST_VFX_TILT_RAD = 0.35;
