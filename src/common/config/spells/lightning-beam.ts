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
export const LIGHTNING_BEAM_TICK_INTERVAL_MS = 180;
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
