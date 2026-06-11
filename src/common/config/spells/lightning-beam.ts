// LIGHTNING BEAM — channeled, held-to-cast spell bound to THUNDER's right click
// (replaces ThunderSplash). Long rotated-rectangle hitbox emanating from the
// caster's hand toward the cursor.

// Beam dimensions — LENGTH is along the aim, HEIGHT is the hitbox thickness.
//   BEAM_LENGTH_PX:        how far the beam reaches (visual + hitbox length)
//   BEAM_HEIGHT_PX:        thickness of the hitbox; lower = harder to hit. Visual
//                          width is controlled by BEAM_DISPLAY_HEIGHT_PX separately.
//   BEAM_DISPLAY_HEIGHT_PX: rendered height of the beam sprites (purely cosmetic)
export const LIGHTNING_BEAM_LENGTH_PX = 140;
export const LIGHTNING_BEAM_HEIGHT_PX = 18;
export const LIGHTNING_BEAM_DISPLAY_HEIGHT_PX = 48;

// Hand offsets are in BEAM-LOCAL space, not world space — they rotate with the aim so
// the beam emerges from the same point on the character no matter which direction you
// face. FORWARD pushes the pivot along the aim direction (positive = away from caster
// toward cursor). PERP pushes perpendicular to the aim (positive = clockwise from
// "forward", i.e. "below" the beam when aiming right, "to the right" when aiming up).
export const LIGHTNING_BEAM_HAND_FORWARD_PX = 0;
export const LIGHTNING_BEAM_HAND_PERP_PX = 2;

// Damage + mana drain — both fire on the same tick. Mana running out ends the channel.
export const LIGHTNING_BEAM_DAMAGE_PER_TICK = 1;
// Tick interval widened to cut the beam's DPS (it was "extremely broken" — ~3.3
// dmg/s at 180ms). 400ms ≈ 2.5 dmg/s, keeping per-hit feel but far less burst.
// (event balance pass: was 180)
export const LIGHTNING_BEAM_TICK_INTERVAL_MS = 400;
export const LIGHTNING_BEAM_MANA_PER_TICK = 1;

// Chaos / animation variety. The beam re-randomises its visual every JITTER_INTERVAL_MS
// for a more "alive electric" feel.
//   JITTER_INTERVAL_MS: how often the visuals re-roll (flips, angle jitter, forks)
//   ANGLE_JITTER_RAD:   max random rotation added to each layer per re-roll (radians)
//   FLIP_CHANCE:        chance per re-roll that a layer flips its sprite (X and/or Y)
//   FORK_CHANCE:        chance per re-roll that a secondary forked sub-beam spawns
//   FORK_LENGTH_RATIO:  fork length as a fraction of the main beam (0..1)
//   FORK_ANGLE_RAD:     max angular deviation of the fork from the main beam direction
export const LIGHTNING_BEAM_JITTER_INTERVAL_MS = 60;
export const LIGHTNING_BEAM_ANGLE_JITTER_RAD = 0.12;
export const LIGHTNING_BEAM_FLIP_CHANCE = 0.55;
export const LIGHTNING_BEAM_FORK_CHANCE = 0.45;
export const LIGHTNING_BEAM_FORK_LENGTH_RATIO = 0.55;
export const LIGHTNING_BEAM_FORK_ANGLE_RAD = 0.35;

// Maximum angular velocity (radians per SECOND) of the beam's aim. Lower = sluggish
// turn (player can't just spin the beam around to sweep the room). Reasonable values:
//   π   (180°/s)  — quick but punishable, full half-turn per second
//   π/2 (90°/s)   — moderate, ~2 seconds for a full circle
//   π/3 (60°/s)   — slow, deliberate aim — the default. Hold the beam, don't spin it.
export const LIGHTNING_BEAM_TURN_SPEED_RAD_PER_SEC = Math.PI / 3;

// Cooldown after the beam ENDS (release or mana-empty), not at cast time. A short
// held tap is therefore just as punishing as a long sustained beam — both are followed
// by a fixed downtime window before the next cast is allowed.
export const LIGHTNING_BEAM_COOLDOWN_MS = 1500;

// ─── Charged Lightning Ray (replaces the continuous beam) ─────────────────────
// Hold the THUNDER slot-1 button to charge: the aim DIRECTION is locked at the
// moment you start holding and the caster stands still channelling. Releasing
// fires ONE straight ray in that locked direction whose DAMAGE and LENGTH scale
// with how long you held (clamped between MIN and MAX). This is a cast-ONCE spell
// — origin, angle, damage and length are decided locally and broadcast a single
// time, so remote clients just replicate it (no real-time aim sync).
//
//   CHARGE_MAX_MS:        hold time (ms) at which damage/length hit their max.
//   CHARGE_MIN_MS:        minimum hold (ms) before a release fires at all. A tap
//                         shorter than this is cancelled (no ray, no cooldown) so
//                         a mis-click doesn't waste the spell.
//   DAMAGE_MIN/MAX:       half-heart damage at min-charge / full-charge (lerped).
//   LENGTH_MIN/MAX_PX:    ray length (px) at min-charge / full-charge (lerped).
//   HEIGHT_PX:            hitbox thickness (px) — same role as the old beam HEIGHT.
//   DISPLAY_HEIGHT_PX:    rendered sprite height (cosmetic).
//   VISIBLE_MS:           how long the fired ray stays on screen (single hit is
//                         applied on spawn; this is just the flash duration).
//   COOLDOWN_MS:          downtime after a ray fires before the next charge.
//   MANA_COST:            mana spent on release (flat — charging itself is free).
export const CHARGED_RAY_CHARGE_MAX_MS = 1200;
export const CHARGED_RAY_CHARGE_MIN_MS = 150;
export const CHARGED_RAY_DAMAGE_MIN = 1;   // 0.5 heart at a quick release
export const CHARGED_RAY_DAMAGE_MAX = 4;   // 2 hearts fully charged
export const CHARGED_RAY_LENGTH_MIN_PX = 90;
export const CHARGED_RAY_LENGTH_MAX_PX = 200;
export const CHARGED_RAY_HEIGHT_PX = 18;
export const CHARGED_RAY_DISPLAY_HEIGHT_PX = 48;
export const CHARGED_RAY_VISIBLE_MS = 260;
export const CHARGED_RAY_COOLDOWN_MS = 900;
export const CHARGED_RAY_MANA_COST = 3;
// Hand pivot offsets (beam-local space) — same meaning as LIGHTNING_BEAM_HAND_*.
export const CHARGED_RAY_HAND_FORWARD_PX = 0;
export const CHARGED_RAY_HAND_PERP_PX = 2;
// Charge-up VFX on the caster: a small pulsing glow that grows START→END as the
// charge fills, telegraphing the spell to nearby players.
export const CHARGED_RAY_CHARGE_TINT = 0xffe680;
export const CHARGED_RAY_CHARGE_GLOW_START = 1;
export const CHARGED_RAY_CHARGE_GLOW_MAX = 5;
