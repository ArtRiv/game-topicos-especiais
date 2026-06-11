// WATER SPIKE VARIABLES
// Hard to land (usually only connects on a trapped player), so it hits hard:
// 4 half-hearts = 2 full hearts. (event balance pass: was 2)
export const WATER_SPIKE_DAMAGE = 4;
export const WATER_SPIKE_MANA_COST = 2;
export const WATER_SPIKE_COOLDOWN = 800;
export const WATER_SPIKE_LOOP_DURATION = 300;
export const WATER_SPIKE_BODY_RADIUS = 10;

// WATER BALL VARIABLES
export const WATER_BALL_DAMAGE = 2;
export const WATER_BALL_MANA_COST = 4;
export const WATER_BALL_COOLDOWN = 1500;
export const WATER_BALL_SPEED = 500;
export const WATER_BALL_LIFETIME = 2200;
export const WATER_BALL_BODY_RADIUS = 14;
export const WATER_BALL_IMPACT_ROTATION_OFFSET = Math.PI / 2; // Higher rotates splash more away from travel direction.

// WATER TORNADO VARIABLES
export const WATER_TORNADO_DAMAGE = 3;
export const WATER_TORNADO_DAMAGE_PER_TICK = 0.5;
export const WATER_TORNADO_MANA_COST = 3;
export const WATER_TORNADO_COOLDOWN = 1500;
export const WATER_TORNADO_DURATION = 6000;
export const WATER_TORNADO_TICK_INTERVAL = 500;
export const WATER_TORNADO_BODY_RADIUS = 20;
export const WATER_TORNADO_SPIN_CENTER_Y_OFFSET = 32;
export const WATER_TORNADO_SPIN_RADIUS_PADDING = 0; // Higher affects players a bit farther from the funnel edge.
export const WATER_TORNADO_SPIN_OMEGA = 24; // Higher = faster spin, lower = gentler swirl.
// Target orbit radius (px) — the spin radius the player is sucked toward
// once caught. Lower = tighter, more "pulled into the eye" feel. The old
// MIN_ORBIT was only a floor on the player's *entry* distance, which is why
// reducing it didn't shrink the spin circle.
export const WATER_TORNADO_SPIN_TARGET_ORBIT = 4;
// Pull-in rate (1/sec) for the exponential lerp from the player's current
// distance toward TARGET_ORBIT. Roughly, this is how many "time constants"
// pass per second — higher = snappier suck-in. 8 ≈ ~63% closer every
// 0.125s, so a player caught at the edge reaches near-center in ~0.5s. Use
// a very large value (e.g. 100) for an instant snap.
export const WATER_TORNADO_SPIN_PULL_RATE = 1;

// PUDDLE BASE VARIABLES
export const PUDDLE_DEFAULT_LIFETIME_MS = 18000;
export const PUDDLE_MERGE_RADIUS = 16;
export const PUDDLE_MAX_AMOUNT = 4;
export const PUDDLE_BASE_RADIUS_PX = 12;
export const PUDDLE_AMOUNT_RADIUS_PX = 6;
export const PUDDLE_TINT = 0x3a6fd6;
export const PUDDLE_HIGHLIGHT_TINT = 0xaaddff;
export const PUDDLE_ELECTRIFIED_TINT = 0x88e0ff;
export const PUDDLE_ELECTRIFIED_HIGHLIGHT_TINT = 0xfffacc;

// MUD PUDDLE VARIABLES
export const PUDDLE_MUD_TINT = 0x4a3520;
export const PUDDLE_MUD_HIGHLIGHT_TINT = 0x6b4c2a;
export const PUDDLE_MUD_LIFETIME_MS = 24000;
export const MUD_PUDDLE_SLOW_MULTIPLIER = 0.5;

// COMBO: WATER + EARTH VARIABLES
export const TORNADO_GRIND_MUD_COUNT = 1;
export const TORNADO_GRIND_MUD_SPREAD = 5;
export const TORNADO_GRIND_MUD_AMOUNT_EACH = 0.5;
export const SPIKE_WALL_BLOCK_MUD_COUNT = 3;
export const SPIKE_WALL_BLOCK_MUD_SPREAD = 8;
export const SPIKE_WALL_BLOCK_MUD_AMOUNT_EACH = 1;

// LAVA PUDDLE VARIABLES
export const PUDDLE_LAVA_LIFETIME_MS = 60000;
export const PUDDLE_LAVA_RADIUS_MULTIPLIER = 0.9;
export const PUDDLE_LAVA_BODY_RADIUS_FRAC = 0.7;

export const PUDDLE_LAVA_RIM_TINT = 0xffaa44;
export const PUDDLE_LAVA_RIM_ALPHA = 0.6;
export const PUDDLE_LAVA_CORE_TINT = 0x882200;
export const PUDDLE_LAVA_CORE_ALPHA = 0.95;

export const PUDDLE_LAVA_RIM_BLOB_COUNT = 7;
export const PUDDLE_LAVA_RIM_RX_FRAC = 0.66;
export const PUDDLE_LAVA_RIM_RY_FRAC = 0.58;
export const PUDDLE_LAVA_RIM_SIZE_JITTER = 0.01;
export const PUDDLE_LAVA_RIM_OFFSET_FRAC = 0.14;
export const PUDDLE_LAVA_RIM_ANGLE_JITTER = 2.4; // Higher breaks the ring into a more chaotic outline.
export const PUDDLE_LAVA_RIM_ELLIPSE_ROTATION_RANGE = 1.25; // Higher randomizes blob rotation more.

export const PUDDLE_LAVA_CORE_BLOB_COUNT = 8;
export const PUDDLE_LAVA_CORE_RX_FRAC = 0.58;
export const PUDDLE_LAVA_CORE_RY_FRAC = 0.42;
export const PUDDLE_LAVA_CORE_SIZE_JITTER = 0.03;
export const PUDDLE_LAVA_CORE_OFFSET_FRAC = 0.1;
export const PUDDLE_LAVA_CORE_ANGLE_JITTER = 0.9; // Higher makes the core perimeter less round.
export const PUDDLE_LAVA_CORE_ELLIPSE_ROTATION_RANGE = Math.PI / 4; // Higher rotates core blobs more randomly.

export const PUDDLE_LAVA_NOISE_TINT_LIGHT = 0xffdd66;
export const PUDDLE_LAVA_NOISE_TINT_DARK = 0x441100;
export const PUDDLE_LAVA_NOISE_COUNT = 15;
export const PUDDLE_LAVA_NOISE_SIZE_MIN_PX = 1;
export const PUDDLE_LAVA_NOISE_SIZE_MAX_PX = 1;

export const PUDDLE_LAVA_BUBBLE_REDRAW_MS = 550;

export const PUDDLE_LAVA_EMBER_EMIT_INTERVAL_MS = 230;
export const PUDDLE_LAVA_EMBER_PER_EMIT_MIN = 2;
export const PUDDLE_LAVA_EMBER_PER_EMIT_MAX = 3;
export const PUDDLE_LAVA_EMBER_LIFETIME_MS = 420;
export const PUDDLE_LAVA_EMBER_RISE_PX_MIN = 20;
export const PUDDLE_LAVA_EMBER_RISE_PX_MAX = 40;
export const PUDDLE_LAVA_EMBER_SIZE_PX_MIN = 2;
export const PUDDLE_LAVA_EMBER_SIZE_PX_MAX = 3;
export const PUDDLE_LAVA_EMBER_TINTS: readonly number[] = [0xffd066, 0xff9933, 0xffaa44];

export const LAVA_PUDDLE_SLOW_MULTIPLIER = 0.5;
export const LAVA_PUDDLE_DAMAGE_PER_TICK = 2;
export const LAVA_PUDDLE_TICK_INTERVAL_MS = 400;
export const MOLTEN_BOLT_LAVA_PUDDLE_AMOUNT = 2;

// COMBO: LAVA + WATER EXTINGUISH VARIABLES
export const LAVA_TORNADO_EXTINGUISH_MS = 2000;
export const LAVA_WATER_PUDDLE_EXTINGUISH_AMOUNT = 0.1;
export const LAVA_STEAM_BURST_INTERVAL_MS = 500;
export const LAVA_STEAM_BURSTS_PER_TICK = 1;
export const LAVA_WATER_PUDDLE_STEAM_COUNT = 1;
export const LAVA_STEAM_SPAWN_RADIUS_FRAC = 0.3;

// COMBO: DARKBOLT + PUDDLE PULL VARIABLES
// Mirrors the VoidOrb + EarthWall pull model: puddles within PULL_RADIUS
// slide toward the orb's body center each frame (exponential falloff so the
// pull is gentle at the rim and accelerates near the orb). A puddle that
// reaches CONSUME_RADIUS is destroyed — the void "drinks" it. Applies to all
// puddle kinds (water, mud, lava). For lava, this runs IN PARALLEL with the
// LAVA + WATER extinguish combo, so a lava puddle being pulled toward an orb
// while a tornado is also overlapping it will still extinguish normally.
export const VOID_ORB_PUDDLE_PULL_RADIUS = 165;
export const VOID_ORB_PUDDLE_PULL_SPEED = 145;
export const VOID_ORB_PUDDLE_PULL_FALLOFF_EXP = 3.5;
export const VOID_ORB_PUDDLE_CONSUME_RADIUS = 10;
// Consume burst — chunks that fly INTO the orb when a puddle is destroyed.
// Same shape as the EarthWall pulverize chunks: small pixel squares,
// position-jittered around the puddle's bounds, tweened to (orb.x, orb.y)
// with a random arrival jitter so they scatter across the orb sprite
// instead of converging on one pixel (which reads as the "water particles
// like the tornado absorption" effect the user asked for). Tinted per-kind
// so water reads cyan, mud reads earthy, lava reads ember-orange.
export const VOID_ORB_PUDDLE_CONSUME_CHUNK_COUNT = 24;
export const VOID_ORB_PUDDLE_CONSUME_CHUNK_SIZE_MIN_PX = 1;
export const VOID_ORB_PUDDLE_CONSUME_CHUNK_SIZE_MAX_PX = 3;
export const VOID_ORB_PUDDLE_CONSUME_CHUNK_DURATION_MS = 320;
export const VOID_ORB_PUDDLE_CONSUME_ARRIVAL_JITTER_PX = 10;
// Per-kind chunk tints (alternating LIGHT / DARK each chunk for variation).
// Water defaults match the existing tornado-absorption fragment cyan
// (VoidOrb sprite uses 0x9ad6ff for the spiraling dots) so the visual
// language is consistent.
export const VOID_ORB_PUDDLE_CONSUME_TINT_WATER_LIGHT = 0x9ad6ff;
export const VOID_ORB_PUDDLE_CONSUME_TINT_WATER_DARK = 0x3a6fd6;
export const VOID_ORB_PUDDLE_CONSUME_TINT_MUD_LIGHT = 0x8b6332;
export const VOID_ORB_PUDDLE_CONSUME_TINT_MUD_DARK = 0x4a3520;
export const VOID_ORB_PUDDLE_CONSUME_TINT_LAVA_LIGHT = 0xffaa44;
export const VOID_ORB_PUDDLE_CONSUME_TINT_LAVA_DARK = 0x882200;

// WATER SPELL PUDDLE SPAWN VARIABLES
export const WATER_SPIKE_PUDDLE_COUNT = 5;
export const WATER_SPIKE_PUDDLE_SPREAD = 14;
export const WATER_SPIKE_PUDDLE_AMOUNT_EACH = 0.5;
export const WATER_TORNADO_PUDDLE_COUNT = 14;
export const WATER_TORNADO_PUDDLE_SPREAD = 24;
export const WATER_TORNADO_PUDDLE_AMOUNT_EACH = 0.5;
export const WATER_TORNADO_PUDDLE_STAGGER_MS = 200;
export const WATER_BALL_PUDDLE_COUNT = 4;
export const WATER_BALL_PUDDLE_SPREAD = 32;
export const WATER_BALL_PUDDLE_AMOUNT_EACH = 0.6;
