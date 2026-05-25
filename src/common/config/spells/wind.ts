// WIND element — Wind Bolt (projectile) and Air Burst (super-dash spell).

// ─── Wind Bolt (projectile) ───────────────────────────────────────────────────
export const WIND_BOLT_DAMAGE = 2;
export const WIND_BOLT_MANA_COST = 2;
export const WIND_BOLT_COOLDOWN = 700; // ms
export const WIND_BOLT_SPEED = 900;
export const WIND_BOLT_LIFETIME = 1800; // ms
export const WIND_BOLT_IMPACT_FORWARD_OFFSET = 8;

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
