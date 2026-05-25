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
// coming and try to dodge instead of getting one-shot at point-blank.
export const DARK_BOLT_SPEED = 200;

// ── Cast / inventory ─────────────────────────────────────────────────────────
// Special-cast spells bypass mana + cooldown (pickup gates them instead).
// 0,0 here is still consumed by SPELL_CONFIG for shape completeness.
export const DARK_BOLT_MANA_COST = 0;
export const DARK_BOLT_COOLDOWN = 0;
// One pickup = one cast. Cheap to bump if the spell feels weak.
export const DARK_BOLT_PICKUP_CHARGES = 5;
// Spawn offset of the test pickup relative to the player start position.
// Sits opposite the VoidOrb pickup so both are reachable for the replace test.
export const DARK_BOLT_PICKUP_OFFSET_X = -40;
export const DARK_BOLT_PICKUP_OFFSET_Y = 0;

// ── Visuals ──────────────────────────────────────────────────────────────────
// 128×128 source frames downscaled — orb reads as ~50px wide in-world.
export const DARK_BOLT_DISPLAY_SCALE = 0.5;
// Tight circular body around the visible core. Half the displayed frame.
export const DARK_BOLT_BODY_RADIUS = 44;
// Frame rate for the 4-frame loop animation (BloodMage skill3 sheet).
export const DARK_BOLT_ANIM_FRAME_RATE = 10;

// ── Pre-FX glow (same model as VoidOrb) ──────────────────────────────────────
// Color-cycles between A and B on a sine to read as "imaginary mass writhing".
// Dark red palette pulled from the sprite itself — A matches the bright crimson
// core, B matches the deep shadow red between flame wisps. Reads as a heavy,
// blood-soaked aura instead of generic magic glow.
export const DARK_BOLT_GLOW_COLOR_A = 0xdc1428; // crimson core
export const DARK_BOLT_GLOW_COLOR_B = 0x2a0004; // near-black blood red
export const DARK_BOLT_GLOW_COLOR_CYCLE_MS = 700;
// Stronger glow than VoidOrb — DarkBolt is the bigger threat and should bleed
// its aura further into the surrounding pixels. Outer = how far the halo
// reaches, Inner = how much the sprite's own edges light up.
export const DARK_BOLT_GLOW_OUTER_STRENGTH = 3.5;
export const DARK_BOLT_GLOW_INNER_STRENGTH = 1.8;

// ── Environment light (red radial glow cast on surrounding pixels) ──────────
// Soft radial-gradient sprite that follows the bolt, ADD-blended onto the
// world. This is the "the ground around the bolt looks lit up red" effect —
// the preFX glow above only lights the sprite itself, this one bleeds the
// bolt's aura into the environment.
export const DARK_BOLT_ENV_LIGHT_ENABLED = true;
// World-space radius of the glow disc. ~2× the bolt's visible size so the
// light extends well past the sprite's edge.
export const DARK_BOLT_ENV_LIGHT_RADIUS_PX = 80;
export const DARK_BOLT_ENV_LIGHT_TINT = 0xdc1428; // matches crimson glow A
// Base opacity. The glow also pulses ±AMPLITUDE on the same sine wave as the
// pre-FX glow, so the env light and the sprite halo breathe together.
export const DARK_BOLT_ENV_LIGHT_ALPHA = 0.55;
export const DARK_BOLT_ENV_LIGHT_PULSE_AMPLITUDE = 0.18;

// ── Sprite wobble (life signs — keeps the bolt from looking static) ─────────
// Currently disabled — read too "wiggly" rather than menacing. The tween code
// stays in dark-bolt.ts; flip ENABLED back on once amplitudes are re-tuned.
export const DARK_BOLT_WOBBLE_ENABLED = false;
// Scaled together so the bolt "breathes". Amplitude is multiplicative on top
// of DARK_BOLT_DISPLAY_SCALE.
export const DARK_BOLT_WOBBLE_SCALE_AMPLITUDE = 0.08;
export const DARK_BOLT_WOBBLE_PERIOD_MS = 280;
// Rotation jitter — small sway around 0° so the imaginary mass reads as
// writhing rather than gliding flat. ±3° is intentionally subtle.
export const DARK_BOLT_WOBBLE_ROT_AMPLITUDE_DEG = 3;
export const DARK_BOLT_WOBBLE_ROT_PERIOD_MS = 380;

// ── Consumption (DarkBolt erases anything it touches) ──────────────────────
// For spells that occupy a large area (FireArea, WaterTornado, WaterSpike),
// the bolt waits until its centre is within this many px of the spell's
// centre before erasing it — otherwise edge-grazing would pop the whole
// spell out of existence which looks wrong. Other spells are erased on
// first touch.
export const DARK_BOLT_CONSUME_CENTER_RADIUS_PX = 64;
// For tall vertical lightning effects (ThunderStrike, LightningBeam,
// LightningBurstCombo, LightningStrikeCombo), the bolt sits ON TOP for this
// many ms before the lightning is destroyed — so the player visually reads
// the bolt as "consuming" the lightning rather than the lightning just
// vanishing. The bolt's depth is already above the lightning sprites' depths
// (see DARK_BOLT_DEPTH below) so it renders over them while the delay runs.
export const DARK_BOLT_LIGHTNING_LINGER_MS = 220;
// Render depth of the DarkBolt sprite itself. Bumped above regular spells
// (which sit at depth 3) so the bolt visually covers lightning beams /
// strikes during the linger window — and so the bolt always reads as the
// dominant visual when interacting with anything else.
export const DARK_BOLT_DEPTH = 5;

// ── Caster windup hold (player locks in place + glows before bolt spawns) ───
// Counterbalance to the bolt's one-shot damage — when you press R, the caster
// is locked in place for this many ms and a red/black glow pulses on their
// sprite. Telegraphs the spell to nearby players so they can dodge instead of
// being insta-erased mid-step.
export const DARK_BOLT_CAST_WINDUP_MS = 500;
// Glow colors that pulse on the player sprite during the windup. Same crimson
// → near-black palette as the bolt itself so the visual language matches.
export const DARK_BOLT_CASTER_GLOW_COLOR_A = 0xdc1428; // crimson
export const DARK_BOLT_CASTER_GLOW_COLOR_B = 0x000000; // black
export const DARK_BOLT_CASTER_GLOW_OUTER_STRENGTH = 6;
export const DARK_BOLT_CASTER_GLOW_INNER_STRENGTH = 4;
// Charging burst that grows around the player while they hold the windup —
// reuses the env-light texture (red ADD-blended radial gradient). Diameter
// grows from START to END over the windup duration, mirroring the bolt's
// own pre-cast flash but applied to the CASTER.
export const DARK_BOLT_CASTER_BURST_START_DIAMETER_PX = 12;
export const DARK_BOLT_CASTER_BURST_END_DIAMETER_PX = 24;
export const DARK_BOLT_CASTER_BURST_START_ALPHA = 0.7;
export const DARK_BOLT_CASTER_BURST_END_ALPHA = 0.95;
export const DARK_BOLT_CASTER_BURST_TINT = 0xdc1428;

// ── Ground scorch trail (burnt patches the bolt leaves on the floor) ─────────
// Dropped along the bolt's path. Each scorch is a granular red-to-black-to-gray
// radial patch — when overlaid on the tilemap it reads as the ground being
// burnt where the bolt passed. NON-permanent: each patch fades over its
// lifetime and self-destructs.
export const DARK_BOLT_SCORCH_ENABLED = true;
// How often to drop a fresh patch (ms). Spaced wider than the scar segments
// (scar = 22ms, scorch = 60ms) so we get distinct burn marks rather than a
// solid red ribbon — the granular shape of each patch is the whole point.
export const DARK_BOLT_SCORCH_EMIT_INTERVAL_MS = 60;
// Display diameter of each scorch (px). Slight random jitter at spawn keeps
// the trail from looking uniform — see #emitScorch in dark-bolt.ts.
export const DARK_BOLT_SCORCH_DIAMETER_PX = 48;
export const DARK_BOLT_SCORCH_DIAMETER_JITTER_PX = 12;
// The trail is painted as ALPHA-COMPOSITED stamps onto a single per-cast
// RenderTexture (not separate sprites), so heavy overlap naturally produces
// a smooth, continuous "magic streak" instead of a row of visible blobs.
//
// Per-stamp alpha controls how much each individual stamp contributes when
// painted onto the RT. With 60 ms emit + ~12 px movement between emits and
// ~74 px stamp length, the trail centreline is painted ~6× over before
// moving on. Lower stamp alpha = each stamp adds less → smoother fall-off
// at the edges (where only 1–2 stamps overlap), denser centreline. Higher =
// stamps saturate immediately and you start to see the individual lump
// silhouettes again.
export const DARK_BOLT_SCORCH_STAMP_ALPHA = 0.7;
// How long the painted trail stays at full opacity AFTER the bolt is gone.
// Long because the trail is going to become a damage zone — walking through
// it should be punishing. Tune this to balance the "scary aftermath" feel.
export const DARK_BOLT_SCORCH_LINGER_MS = 10000;
// Once the linger window ends, the trail fades to alpha 0 over this duration.
// Longer = gentler disappearance.
export const DARK_BOLT_SCORCH_FADE_MS = 2200;
// Color bands of the scorch texture. Radial gradient: red core → black mid
// → gray edge → transparent rim. The noise overlay swaps pixels between
// adjacent bands so the transitions look burnt/grainy instead of smooth.
export const DARK_BOLT_SCORCH_CORE_COLOR = 0xff1820;
export const DARK_BOLT_SCORCH_MID_COLOR = 0x000000;
export const DARK_BOLT_SCORCH_EDGE_COLOR = 0x4a4a4a;
// 0..1 — probability a pixel in a transition zone has its color swapped with
// the neighboring band. Higher = more granular / "stippled" look.
export const DARK_BOLT_SCORCH_NOISE_DENSITY = 0.35;
// Per-angle radial perturbation of the band boundaries — turns the round disc
// into a lumpy irregular blob. Fraction of the texture radius; with 32 angular
// slices, neighbouring lumps interpolate so the silhouette stays organic.
// Set to 0 for a clean circle, 0.18+ for very irregular.
export const DARK_BOLT_SCORCH_EDGE_NOISE_AMPLITUDE = 0.18;
export const DARK_BOLT_SCORCH_EDGE_NOISE_SLICES = 32;
// Elongate each scorch sprite along the bolt's heading so consecutive patches
// merge into a directional streak instead of stacking as round blobs. Length =
// along heading, Width = perpendicular. Multipliers on DARK_BOLT_SCORCH_DIAMETER_PX.
export const DARK_BOLT_SCORCH_LENGTH_MULTIPLIER = 1.55;
export const DARK_BOLT_SCORCH_WIDTH_MULTIPLIER = 0.95;
// Small ± rotation jitter (radians) added on top of the heading-aligned base
// rotation. Just enough variety that the lumps don't land in identical
// positions every emit, but tight enough that the streak still aligns.
export const DARK_BOLT_SCORCH_ROTATION_JITTER_RAD = 0.18;

// ── Pre-cast windup (expanding red flash at the cast point) ─────────────────
// Spawned in the constructor at the bolt's origin position — reads as the
// burst of energy releasing the projectile. Uses the same radial-gradient
// texture as the env light, scaled-up and tweened bigger + transparent.
export const DARK_BOLT_WINDUP_ENABLED = true;
// Short enough to read as "release" not "charge". The bolt is already moving
// while the flash plays out, so the flash trails behind a bit — by design.
export const DARK_BOLT_WINDUP_DURATION_MS = 380;
// Starting + ending diameter as a MULTIPLIER on the env-light diameter
// (DARK_BOLT_ENV_LIGHT_RADIUS_PX * 2). Expands outward as it fades.
export const DARK_BOLT_WINDUP_START_SCALE = 0.45;
export const DARK_BOLT_WINDUP_END_SCALE = 1.9;
export const DARK_BOLT_WINDUP_START_ALPHA = 0.95;
// Punchier crimson than the env-light tint — the windup is the peak moment
// of the cast, so the colour pops harder than the trailing halo.
export const DARK_BOLT_WINDUP_TINT = 0xff2030;

// ── Camera shake (low-frequency rumble while the bolt is alive) ─────────────
// Phaser shake intensity is a FRACTION of the camera width — 0.005 ≈ ~2.4 px
// of displacement on the 480 px canvas. Subtle on purpose; cranking past 0.01
// gets nauseating fast on a small-screen pixel-art game. Intensity decays
// linearly over the duration so the rumble is loudest at cast and fades as
// the bolt travels (matches "the spell is heaviest when it's released").
export const DARK_BOLT_SHAKE_ENABLED = true;
export const DARK_BOLT_SHAKE_INTENSITY = 0.005;
// Matches DARK_BOLT_LIFETIME_MS by design — the rumble ends when the bolt
// does. If you change either you usually want both.
export const DARK_BOLT_SHAKE_DURATION_MS = 3500;

// ── Shadow halo (black duplicate sprite layered behind the bolt) ────────────
// Creates a darker outline around the bolt so it reads as a heavier mass
// instead of a flat decal. The duplicate plays the same animation in sync
// and tracks position / rotation / scale wobble each frame.
export const DARK_BOLT_SHADOW_ENABLED = true;
export const DARK_BOLT_SHADOW_SCALE_MULTIPLIER = 1.15;
export const DARK_BOLT_SHADOW_ALPHA = 0.45;
export const DARK_BOLT_SHADOW_TINT = 0x000000;

// ── Heat haze (self-displacement applied to the bolt sprite) ───────────────
// Per-sprite displacement preFX — warps the bolt's OWN pixels using the
// VoidOrb's radial noise texture as a UV offset map. Reads as the imaginary
// mass shimmering with contained energy, similar to a hot object's heat haze.
// Different from DARK_BOLT_CAMERA_DISTORTION_* below, which warps the whole
// camera. Both can be on at once; this one is local, that one is ambient.
export const DARK_BOLT_HEAT_HAZE_ENABLED = true;
// X/Y intensity. The bolt sprite is small on screen, so intensities can be
// higher than the camera warp — these get scaled by the sprite's UVs.
export const DARK_BOLT_HEAT_HAZE_X = 0.03;
export const DARK_BOLT_HEAT_HAZE_Y = 0.03;

// ── Scar trail (red "erase" line drawn along the bolt's flight path) ────────
// Discrete fading line segments dropped at the bolt's position every emit
// interval. Stay in place where dropped (they're the "cut" left by the bolt
// passing through), fading over their lifetime. Stack tightly so they read as
// one continuous scar line instead of dotted points.
export const DARK_BOLT_SCAR_ENABLED = true;
// Tighter interval = denser line, more sprite churn. 22 ms ≈ 45/sec — at 200
// px/s bolt speed that's a segment every ~4-5 px.
export const DARK_BOLT_SCAR_EMIT_INTERVAL_MS = 22;
// Geometry of each segment. Length should be ≥ the emit-interval distance
// (bolt_speed * interval / 1000) so consecutive segments overlap slightly and
// the line reads as continuous rather than dotted.
export const DARK_BOLT_SCAR_SEGMENT_LENGTH_PX = 14;
export const DARK_BOLT_SCAR_SEGMENT_THICKNESS_PX = 2;
// How long each segment stays before fully fading out. Long enough that the
// player can SEE the line trailing behind, short enough that off-screen scars
// from earlier casts don't pile up forever.
export const DARK_BOLT_SCAR_LIFETIME_MS = 850;
export const DARK_BOLT_SCAR_START_ALPHA = 0.9;
// Bright crimson — pop harder than the env-light tint so the scar reads as a
// hot cut even after the bolt has moved past it.
export const DARK_BOLT_SCAR_TINT = 0xff1820;

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
