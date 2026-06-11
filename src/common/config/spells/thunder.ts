// THUNDER element — Thunder Strike, Thunder Splash (legacy), plus the cross-element
// "lightning" combos that combine FireBolt+ThunderStrike (LightningBurst) and
// ThunderStrike+FireArea (LightningStrike), and the Electrified Puddle state spawned
// by ThunderStrike-on-Puddle.

// ─── Lightning sprite variants (driven from the debug panel) ──────────────────
// Lightning sprite variant: 'CURRENT' = Thunder Effect 02 sheet; 'MAGIC_PACK_9' = the
// alternative Lightning frames in Magic Pack 9 files (used by ThunderStrike when set).
export const LIGHTNING_SPRITE_VARIANT: 'CURRENT' | 'MAGIC_PACK_9' = 'CURRENT';
// Lightning burst variant for the FireBolt + ThunderStrike combo. Switch via debug panel.
export const LIGHTNING_BURST_VARIANT: '002' | '003' = '003';

// ─── Lightning combos (cross-element) ─────────────────────────────────────────
export const LIGHTNING_BURST_COMBO_DAMAGE = 3;     // FireBolt + ThunderStrike — "choque" (event balance: was 5; 1.5 hearts)
export const LIGHTNING_STRIKE_COMBO_DAMAGE = 5;    // ThunderStrike + FireArea — hard combo, rewards more (event balance: was 4; 2.5 hearts)
export const LIGHTNING_BURST_COMBO_BODY_RADIUS = 28;
export const LIGHTNING_STRIKE_COMBO_BODY_RADIUS = 26;

// ─── Thunder Strike (area) ────────────────────────────────────────────────────
// Hard-to-dodge AoE that requires closing distance on the target; capped at 1
// full heart so it doesn't out-trade the infinite-range fireball. (event
// balance pass: was 3)
export const THUNDER_STRIKE_DAMAGE = 2;
export const THUNDER_STRIKE_MANA_COST = 3;
export const THUNDER_STRIKE_COOLDOWN = 1200; // ms
export const THUNDER_STRIKE_LOOP_DURATION = 400; // ms body stays active
export const THUNDER_STRIKE_BODY_RADIUS = 20; // px

// Vanilla ThunderStrike alignment + timing tunables (the void-empowered variant
// keeps its own VOID_EMPOWERED_Y_OFFSET_PX inside thunder-strike.ts and is unaffected).
//   SPRITE_Y_OFFSET_PX: positive pushes the visible bolt + hitbox DOWN together. Use
//     this when the bolt's bottom-of-frame anchor doesn't land exactly on the cursor.
//   HITBOX_Y_OFFSET_PX: positive shifts ONLY the hitbox down (sprite stays put). Use
//     when the visible bolt looks right but damage registers above the strike point.
//     With the current sheet the body sits r=20 px above the strike point — setting
//     this to ~20 centres the body on the strike point.
//   ANIM_TIMESCALE: playback speed multiplier applied to the strike-down animation.
//     1 = native 18 fps (~720 ms total); 2 halves the descent, 3 thirds it.
//   REACTION_BUFFER_MS: gap between the animation ending and the damage window
//     opening. 120 = original; drop to 0 for instant damage on strike.
export const THUNDER_STRIKE_SPRITE_Y_OFFSET_PX = 0;
export const THUNDER_STRIKE_HITBOX_Y_OFFSET_PX = 0;
export const THUNDER_STRIKE_ANIM_TIMESCALE = 1;
export const THUNDER_STRIKE_REACTION_BUFFER_MS = 450;

// Lightning + Puddle combo splash placement. The Pixelart Splash sprite is anchored
// at the strike's centre (= cursor position). Use these to nudge it if the artwork's
// pivot isn't at the centre of its 32×32 frame.
//   X_OFFSET_PX: positive → right.
//   Y_OFFSET_PX: positive → down, negative → up.
export const THUNDER_PUDDLE_SPLASH_X_OFFSET_PX = 0;
export const THUNDER_PUDDLE_SPLASH_Y_OFFSET_PX = -18;
// Delay (ms) between the ThunderStrike cast and the splash VFX + electrification.
// The strike-down animation is 13 frames @ 18 fps (≈55ms/frame); the bolt visually
// touches the ground around frame 6, so ~333ms feels right at ANIM_TIMESCALE = 1.
// If you change THUNDER_STRIKE_ANIM_TIMESCALE, scale this proportionally.
export const THUNDER_PUDDLE_SPLASH_DELAY_MS = 333;

// Delay (ms) between the ThunderStrike landing on a FireArea and the
// lightning_burst_002 explosion spawning at the contact point. Same animation
// timing rationale as THUNDER_PUDDLE_SPLASH_DELAY_MS — the bolt visually
// touches the ground around frame 6 of the 13-frame strike-down animation,
// so ~333ms feels right at ANIM_TIMESCALE = 1. Scale proportionally if you
// change THUNDER_STRIKE_ANIM_TIMESCALE.
export const THUNDER_FIREAREA_BURST_DELAY_MS = 250;

// ─── Thunder Splash (slow lightning projectile, legacy / now unbound from slots) ──
// Frame phases mapped in preload-scene.ts:
//   CHARGE_MS  duration of the stationary windup at caster (frames 0..1 @ 8fps ≈ 250 ms)
//   TRAVEL_MS  how long the orb takes to drift to the landing point (frames 2..6 @ 8fps ≈ 625 ms)
//   LAND_MS    duration of the landing pose before destroying (frames 7..13 @ 14fps ≈ 500 ms)
// Total lifetime ≈ CHARGE + TRAVEL + LAND. The animation framerates above are the
// visual cadence; these constants are the timing source of truth for damage/destroy.
export const THUNDER_SPLASH_DAMAGE = 2;
export const THUNDER_SPLASH_MANA_COST = 2;
export const THUNDER_SPLASH_COOLDOWN = 1000; // ms
export const THUNDER_SPLASH_CHARGE_MS = 250;
export const THUNDER_SPLASH_TRAVEL_MS = 650;
export const THUNDER_SPLASH_LAND_MS = 500;
export const THUNDER_SPLASH_BODY_RADIUS = 14; // px — hitbox while landed

// ─── Electrified Puddle (ThunderStrike on a Puddle combo) ─────────────────────
// Lightning striking a wet puddle leaves it "electrified" with a charge bar that
// decays over time. Tick damage to anything standing in it, plus visible electric
// sparks spawned at random points inside the puddle — spark frequency and which
// frames are favoured both scale with charge.
//
//   CHARGE_MAX          ceiling for the bar. 100 reads as a "%".
//   DECAY_PER_SEC       charge drained per second. 25 → ~4s to clear from full.
//   DAMAGE_PER_TICK     hp removed per damage tick (LavaPool pattern).
//   TICK_INTERVAL_MS    ms between damage ticks.
//   SPARK_TICK_MS       ms between "maybe spawn sparks" evaluations.
//   SPARK_QTY_AT_FULL   expected sparks per tick at charge=MAX (can be fractional).
//   SPARK_QTY_AT_LOW    expected sparks per tick at charge≈0.
//   SPARK_LIFETIME_MS   how long each spark sprite stays before destroying.
//   SPARK_SCALE         display scale for the 48x48 spark sprite.
//   SPARK_FRAME_HI/MID/LO  THUNDER_SPLASH frame indices (0..13). HI is the
//                          "powerful" frame shown more at high charge; LO is the
//                          weak frame favoured as charge runs out.
//   SPARK_WEIGHT_*_AT_FULL / _AT_LOW  per-frame relative weights at charge=MAX and
//                          charge=0. Linearly interpolated between them. Tweak in
//                          the debug panel via RUNTIME_CONFIG.
export const ELEC_PUDDLE_CHARGE_MAX = 100;
export const ELEC_PUDDLE_DECAY_PER_SEC = 25;
export const ELEC_PUDDLE_DAMAGE_PER_TICK = 1;
export const ELEC_PUDDLE_TICK_INTERVAL_MS = 400;
export const ELEC_PUDDLE_SPARK_TICK_MS = 80;
export const ELEC_PUDDLE_SPARK_QTY_AT_FULL = 3;
export const ELEC_PUDDLE_SPARK_QTY_AT_LOW = 0.25;
export const ELEC_PUDDLE_SPARK_LIFETIME_MS = 160;
export const ELEC_PUDDLE_SPARK_SCALE = 0.7;
export const ELEC_PUDDLE_SPARK_FRAME_HI = 9;
export const ELEC_PUDDLE_SPARK_FRAME_MID = 11;
export const ELEC_PUDDLE_SPARK_FRAME_LO = 13;
export const ELEC_PUDDLE_SPARK_WEIGHT_HI_AT_FULL = 7;
export const ELEC_PUDDLE_SPARK_WEIGHT_MID_AT_FULL = 2;
export const ELEC_PUDDLE_SPARK_WEIGHT_LO_AT_FULL = 1;
export const ELEC_PUDDLE_SPARK_WEIGHT_HI_AT_LOW = 1;
export const ELEC_PUDDLE_SPARK_WEIGHT_MID_AT_LOW = 2;
export const ELEC_PUDDLE_SPARK_WEIGHT_LO_AT_LOW = 7;

// ── Lightning + MUD puddle (weaker conductor, applies snare) ──────────────
// Mud is a worse conductor than clean water. The strike still electrifies it,
// but with reduced damage, reduced charge (so it fades faster), and fewer/
// smaller sparks — and it applies a movement snare to anyone standing in
// the puddle at strike time. The snare is movement-only; characters can
// still cast spells while snared (see CharacterGameObject.applyMovementSnare).
export const ELEC_PUDDLE_MUD_DAMAGE_MULTIPLIER = 0.5;
export const ELEC_PUDDLE_MUD_CHARGE_MULTIPLIER = 0.6;
export const ELEC_PUDDLE_MUD_SPARK_QTY_MULTIPLIER = 0.5;
// Snare duration (ms) applied to every character overlapping the mud puddle
// at the moment lightning strikes it. 1.5 s = a noticeable but brief root.
export const ELEC_PUDDLE_MUD_SNARE_DURATION_MS = 1500;
