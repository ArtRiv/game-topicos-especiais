// FIRE element — Fire Bolt (projectile), Fire Area (AoE), Fire Breath (channeled).
// Combo multipliers (FireBolt + FireArea, FireBreath + FireArea) live here too since
// they're keyed off the fire spells' base values.

// ─── Fire Bolt (projectile) ───────────────────────────────────────────────────
// Sprite-vs-hitbox alignment: the visible flame sits below the geometric centre of the
// 48x48 frame. Setting origin.y > 0.5 moves the rotation pivot down to the flame so the
// hitbox (kept centred on the projectile's world position) stays under the flame in every
// aim direction. Tune if a different fire-bolt spritesheet replaces the current one.
export const FIRE_BOLT_SPRITE_ORIGIN_X = 0.5;
export const FIRE_BOLT_SPRITE_ORIGIN_Y = 0.67;
export const FIRE_BOLT_DAMAGE = 1;
export const FIRE_BOLT_MANA_COST = 1;
export const FIRE_BOLT_COOLDOWN = 500; // ms
export const FIRE_BOLT_SPEED = 750;
export const FIRE_BOLT_LIFETIME = 2000; // ms before auto-destroy
export const FIRE_BOLT_IMPACT_FORWARD_OFFSET = 8;
// FireBolt + FireArea combo
export const FIRE_BOLT_FIRE_AREA_DAMAGE_MULTIPLIER = 2;
export const FIRE_BOLT_FIRE_AREA_SPEED_MULTIPLIER = 1.35;
export const FIRE_BOLT_FIRE_AREA_SCALE_MULTIPLIER = 1.25;
export const FIRE_BOLT_FIRE_AREA_IMPACT_SCALE_MULTIPLIER = 1.45;

// ─── Fire Area ────────────────────────────────────────────────────────────────
export const FIRE_AREA_DAMAGE_PER_TICK = 1;
export const FIRE_AREA_MANA_COST = 1; // 1/4 of max mana
export const FIRE_AREA_COOLDOWN = 3000; // ms
export const FIRE_AREA_DURATION = 5000; // ms - longer duration for easier combos
// ms between damage ticks. Slowed from 500 → 800 so a player who walks into the
// area has time to walk back out before the next tick instead of being chain-
// ticked while trying to leave. (event balance pass)
export const FIRE_AREA_TICK_INTERVAL = 800;

// ─── FireArea + Puddle evaporate combo ───────────────────────────────────────
// A FireArea sitting on top of a puddle slowly evaporates it. Each puddle has
// its own meter (0 → 1); per-frame contribution is delta / EVAPORATE_MS[kind].
// Water boils off fast; mud is denser/dirtier and takes ~3× as long. Lava is
// hotter than the fire — explicitly ignored (the FireArea isn't going to dry
// lava). Steam puffs reuse the SteamBurst sprite from the FireBolt+Water and
// LavaTornado combos, spawned at random offsets inside the puddle's visual
// disc.
export const FIRE_AREA_WATER_EVAPORATE_MS = 1500;
export const FIRE_AREA_MUD_EVAPORATE_MS = 4500;
export const FIRE_AREA_STEAM_BURST_INTERVAL_MS = 250;
export const FIRE_AREA_STEAM_BURSTS_PER_TICK = 1;
// Random spawn offset for steam puffs relative to the puddle center, as a
// fraction of the puddle's visual radius (sqrt-uniform for area coverage).
export const FIRE_AREA_STEAM_SPAWN_RADIUS_FRAC = 0.6;

// ─── Fire Breath (channeled) ──────────────────────────────────────────────────
export const FIRE_BREATH_DAMAGE_PER_TICK = 1;
export const FIRE_BREATH_MANA_PER_TICK = 2;
export const FIRE_BREATH_MANA_DRAIN_INTERVAL = 300; // ms between mana drain ticks
export const FIRE_BREATH_DAMAGE_TICK_INTERVAL = 250; // ms between damage ticks
export const FIRE_BREATH_MAX_REACH = 96; // max pixels from player to wall
export const FIRE_BREATH_STEP_SIZE = 8; // pixels per wall detection step
export const FIRE_BREATH_ANGLE_TOLERANCE = 0.45; // radians (~26 degrees half-cone)
export const FIRE_BREATH_TURN_SPEED = Math.PI * 0.95; // radians per second
export const FIRE_BREATH_MAX_DEVIATION = Math.PI / 9; // ~20 degrees max turn from initial cast angle
export const FIRE_BREATH_MOUTH_FORWARD_OFFSET = 2; // pixels forward from the mouth anchor
// FireBreath + FireArea combo
export const FIRE_BREATH_FIRE_AREA_DAMAGE_MULTIPLIER = 2.5;
export const FIRE_BREATH_FIRE_AREA_BEAM_HEIGHT = 72; // wider beam height in combo (normal is 48)
export const FIRE_BREATH_FIRE_AREA_REACH_MULTIPLIER = 1.35; // extended reach in combo
export const FIRE_BREATH_FIRE_AREA_AREA_SCALE = 1.4; // how much the fire area grows
export const FIRE_BREATH_FIRE_AREA_ANGLE_TOLERANCE = 0.7; // wider cone to detect areas (~40 deg)
export const FIRE_BREATH_MOUTH_VERTICAL_OFFSET = 6; // pixels upward from player center
export const FIRE_BREATH_HIT_SURFACE_OFFSET = 0; // pixels pulled away from the impact surface
export const FIRE_BREATH_BEAM_CONTACT_OVERLAP = 10; // pixels of visual overlap so the flame reaches the hit point
