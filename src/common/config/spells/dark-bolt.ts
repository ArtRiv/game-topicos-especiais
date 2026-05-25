// DarkBolt — Hollow-Purple-inspired erasure projectile.
//
// A slow, inexorable darkness projectile that pierces through and instantly
// erases anything it touches (enemies / other players). Wall-collide ends it.
// Pickup-granted special (R-key) — competes with VoidOrb for the single
// special-spell slot (picking one up replaces the other).

// ── Damage / lifetime ────────────────────────────────────────────────────────
// Massive damage so a single hit overshoots every health pool — "instant
// disintegrate" semantics. Tuneable via the debug panel mirror in runtime-config.
export const DARK_BOLT_DAMAGE = 9999;
// Pierces by default; lifetime is the only thing besides walls that ends it.
export const DARK_BOLT_LIFETIME_MS = 3500;
// px/s. Slow + telegraphed — JJK Hollow Purple feel. Players should see it
// coming and try to dodge instead of getting one-shot at point-blank.
export const DARK_BOLT_SPEED = 100;

// ── Cast / inventory ─────────────────────────────────────────────────────────
// Special-cast spells bypass mana + cooldown (pickup gates them instead).
// 0,0 here is still consumed by SPELL_CONFIG for shape completeness.
export const DARK_BOLT_MANA_COST = 0;
export const DARK_BOLT_COOLDOWN = 0;
// One pickup = one cast. Cheap to bump if the spell feels weak.
export const DARK_BOLT_PICKUP_CHARGES = 1;
// Spawn offset of the test pickup relative to the player start position.
// Sits opposite the VoidOrb pickup so both are reachable for the replace test.
export const DARK_BOLT_PICKUP_OFFSET_X = -40;
export const DARK_BOLT_PICKUP_OFFSET_Y = 0;

// ── Visuals ──────────────────────────────────────────────────────────────────
// 128×128 source frames downscaled — orb reads as ~50px wide in-world.
export const DARK_BOLT_DISPLAY_SCALE = 0.5;
// Tight circular body around the visible core. Half the displayed frame.
export const DARK_BOLT_BODY_RADIUS = 22;
// Frame rate for the 4-frame loop animation (BloodMage skill3 sheet).
export const DARK_BOLT_ANIM_FRAME_RATE = 10;

// ── Pre-FX glow (same model as VoidOrb) ──────────────────────────────────────
// Color-cycles between A and B on a sine to read as "imaginary mass writhing".
// Purple palette — Gojo's hollow purple is literally purple, so we lean into it.
export const DARK_BOLT_GLOW_COLOR_A = 0x8a2be2; // blueviolet
export const DARK_BOLT_GLOW_COLOR_B = 0x2d0a4e; // deep indigo
export const DARK_BOLT_GLOW_COLOR_CYCLE_MS = 700;
export const DARK_BOLT_GLOW_OUTER_STRENGTH = 2.5;
export const DARK_BOLT_GLOW_INNER_STRENGTH = 1.2;

// ── Camera-level screen distortion while the bolt is alive ───────────────────
// Subtler than VoidOrb (the bolt is moving, so heavy warp would smear). Set
// either axis to 0 to disable. Uses the VoidOrb displacement texture so we
// don't have to generate a second noise map.
export const DARK_BOLT_CAMERA_DISTORTION_X = 0.004;
export const DARK_BOLT_CAMERA_DISTORTION_Y = 0.004;

// ── Trail particles (purple radiation streaks behind the bolt) ───────────────
export const DARK_BOLT_TRAIL_ENABLED = true;
// How often to emit a batch behind the bolt (ms). Lower = denser trail / more
// draw load. 30ms ≈ 33 batches/sec which is plenty at this scale.
export const DARK_BOLT_TRAIL_EMIT_INTERVAL_MS = 30;
export const DARK_BOLT_TRAIL_PARTICLES_PER_EMIT = 2;
export const DARK_BOLT_TRAIL_PARTICLE_LIFETIME_MS = 450;
// How far behind the bolt the particles spawn (perpendicular jitter px).
export const DARK_BOLT_TRAIL_SPAWN_JITTER_PX = 6;
// px/s — particles drift backward relative to bolt heading.
export const DARK_BOLT_TRAIL_DRIFT_SPEED = 35;
export const DARK_BOLT_TRAIL_TINT_A = 0x8a2be2;
export const DARK_BOLT_TRAIL_TINT_B = 0x4b0082; // indigo
