// DARK BOLT — pickup-granted DARKNESS special spell. Cast via R key, no element/slot
// binding. Multi-layer visual: VFX1 main orb + VFX2 startup backdrop + procedural
// ray particles + camera-level screen-space displacement + per-layer glow.

// ─── Core orb ────────────────────────────────────────────────────────────────
// Special spell — should be a real threat. High per-tick so a player caught in
// the orb dies fast unless they escape (e.g. wind dash). 7 half-hearts = 3.5
// hearts per tick. NOTE: cross-player tick damage is wired in Plan 2 (the orb
// currently only damages enemies/bots, not remote players). (event balance
// pass: was 1)
export const VOID_ORB_DAMAGE_PER_TICK = 7;
export const VOID_ORB_TICK_INTERVAL = 600;
export const VOID_ORB_MANA_COST = 6;
export const VOID_ORB_COOLDOWN = 4000;
export const VOID_ORB_ORB_HOLD_MS = 20000;

// ─── Pickup ──────────────────────────────────────────────────────────────────
// One pickup = one cast. (event balance pass: was 3 — a single special charge
// per pickup, matching DarkBolt / StarShield.)
export const VOID_ORB_PICKUP_CHARGES = 1;
export const VOID_ORB_PICKUP_OFFSET_X = 40;
export const VOID_ORB_PICKUP_OFFSET_Y = 0;
export const VOID_ORB_BM_DISPLAY_SCALE = 0.6;
export const VOID_ORB_BM_BODY_RADIUS = 24;

// ─── VFX layers ──────────────────────────────────────────────────────────────
// VFX1 is the main 3-phase orb (start → loop → end). VFX2 is a 12-frame backdrop
// that plays once. Both render through the same glow + displacement pipeline.
export const VOID_ORB_VFX1_START_DELAY_MS = 0;
export const VOID_ORB_VFX2_START_DELAY_MS = 0;
export const VOID_ORB_VFX2_FADE_MS = 220;
export const VOID_ORB_VFX2_DISPLAY_SCALE = 0.85;
export const VOID_ORB_VFX2_TINT = 0xffffff;

// ─── Glow ────────────────────────────────────────────────────────────────────
// A/B colours are cycled over GLOW_COLOR_CYCLE_MS for the "blood mixture" look.
export const VOID_ORB_GLOW_COLOR_A = 0x6a0416;
export const VOID_ORB_GLOW_COLOR_B = 0x180205;
export const VOID_ORB_GLOW_COLOR_CYCLE_MS = 900;
export const VOID_ORB_GLOW_OUTER_STRENGTH = 1.5;
export const VOID_ORB_GLOW_INNER_STRENGTH = 1;
export const VOID_ORB_GLOW_SCALE = 1.2;

// ─── Particles ───────────────────────────────────────────────────────────────
// A/B tints are picked at random per-particle. Lower FREQUENCY_MS = denser stream.
export const VOID_ORB_PARTICLES_ENABLED = true;
export const VOID_ORB_PARTICLE_QUANTITY = 4;
export const VOID_ORB_PARTICLE_FREQUENCY_MS = 20;
export const VOID_ORB_PARTICLE_LIFETIME_MS = 600;
export const VOID_ORB_PARTICLE_SPAWN_RADIUS = 44;
export const VOID_ORB_PARTICLE_START_SCALE = 1.4;
export const VOID_ORB_PARTICLE_END_SCALE = 0;
export const VOID_ORB_PARTICLE_TINT_A = 0x6a0416;
export const VOID_ORB_PARTICLE_TINT_B = 0x180205;
// 'INWARD' = sucked toward orb. 'OUTWARD' = blasted from center. 'RANDOM' = scattered.
export const VOID_ORB_PARTICLE_DIRECTION: 'INWARD' | 'RANDOM' | 'OUTWARD' = 'INWARD';
export const VOID_ORB_PARTICLE_LENGTH_PX = 10;
export const VOID_ORB_PARTICLE_THICKNESS_PX = 1;
export const VOID_ORB_PARTICLE_TRAVEL_PX = 42;
export const VOID_ORB_PARTICLE_SPEED_PX_PER_SEC = 120;

// ─── Displacement ────────────────────────────────────────────────────────────
// ORB warps the orb sprite's own pixels (sane range 0.005 → 0.05). CAMERA warps
// the entire screen via main-camera postFX (sane range 0.001 → 0.01). Both 0 = off.
export const VOID_ORB_DISTORTION_X = 0.01;
export const VOID_ORB_DISTORTION_Y = 0.01;
export const VOID_ORB_CAMERA_DISTORTION_X = 0.005;
export const VOID_ORB_CAMERA_DISTORTION_Y = 0.005;

// ─── Pull combos (players, pillars, puddles) ─────────────────────────────────
// closeness = (1 - dist/PULL_RADIUS)^FALLOFF_EXP.
//   EXP=1 → linear. EXP=2 → quadratic. EXP=3+ → black-hole-like: barely a tug
//   at the rim, accelerating violently near the orb.
// Puddle pull constants live in water.ts (VOID_ORB_PUDDLE_PULL_*).
export const VOID_ORB_PLAYER_PULL_RADIUS = 160;
export const VOID_ORB_PLAYER_PULL_SPEED = 160;
export const VOID_ORB_PLAYER_PULL_FALLOFF_EXP = 3.5;
export const VOID_ORB_EARTHWALL_PULL_FALLOFF_EXP = 3;
export const VOID_ORB_EARTHWALL_PULL_RADIUS = 110;
export const VOID_ORB_EARTHWALL_PULL_SPEED = 90;
export const VOID_ORB_EARTHWALL_CRUMBLE_RADIUS = 16;
export const VOID_ORB_EARTHWALL_TICK_INTERVAL_MS = 300;
export const VOID_ORB_EARTHWALL_TICK_DAMAGE = 0.5;

// ─── Pixel pull FX (pure visual, no gameplay) ────────────────────────────────
// Every SPAWN_INTERVAL_MS the orb emits PARTICLES_PER_EMIT tiny pixel particles
// that tween into its body center over TRAVEL_MS. Each particle is sourced from
// one of two pools:
//   - SPRITE-SOURCED (sprite-pool roll): a random in-range sprite — player,
//     enemy, spell — picks a random pixel from its current animation frame
//     and the particle launches from the sprite's position tinted with that
//     real pixel colour. Looks like matter being shredded off the sprite.
//   - ENV-SOURCED (env-pool roll): a random point inside the FX radius
//     tinted with a random colour from ENV_PALETTE — the "ground / grass /
//     trees" filler. Override the palette per map to match your tileset.
// SPRITE_SOURCE_CHANCE is the bias toward sprite-sourced particles when at
// least one sprite is in range. With value 0.5 it's 50/50; raise toward 1
// to skew almost entirely to sprites (env only when nothing is nearby).
export const VOID_ORB_PIXEL_PULL_ENABLED = true;
export const VOID_ORB_PIXEL_PULL_RADIUS = 120;
export const VOID_ORB_PIXEL_PULL_SPAWN_INTERVAL_MS = 80;
export const VOID_ORB_PIXEL_PULL_PARTICLES_PER_EMIT = 8;
export const VOID_ORB_PIXEL_PULL_TRAVEL_MS = 280;
export const VOID_ORB_PIXEL_PULL_SIZE_MIN_PX = 1;
export const VOID_ORB_PIXEL_PULL_SIZE_MAX_PX = 2;
export const VOID_ORB_PIXEL_PULL_SPRITE_SOURCE_CHANCE = 0.1;
// Greens + browns by default (grass + trees). Tweak per map. An empty array
// disables env-sourced particles entirely → only sprite pixels are pulled.
export const VOID_ORB_PIXEL_PULL_ENV_PALETTE: readonly number[] = [
  0x4a7c2a, 0x356018, 0x5e9b3a, 0x2d4a18, 0x6b4c2a, 0x4a3520, 0x8b6332, 0x563820, 0x92af74, 0x459c64, 0xa78a4e,
  0x53393f, 0x9f264a
];
