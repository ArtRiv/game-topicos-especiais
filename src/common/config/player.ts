// Player tunables — movement, health, attack range, mana, aiming + cursor.

export const PLAYER_SPEED = 80;
export const PLAYER_INVULNERABLE_AFTER_HIT_DURATION = 500;
export const PLAYER_HURT_PUSH_BACK_SPEED = 50;
// Health is stored in half-heart units (1 heart = 2 HP). 20 = 10 hearts on the HUD —
// gives more visible granularity per spell hit, useful for damage tuning + PvP testing.
// Drop back to 6 for the original "Zelda-feel" later if desired.
export const PLAYER_START_MAX_HEALTH = 10;
export const PLAYER_ATTACK_DAMAGE = 1;
// Max distance (px) the cast target can be from the caster. Targets farther than this
// are clamped along the aim direction. Affects both projectile cast points and AOE placement.
export const PLAYER_ATTACK_RANGE_PX = 120;

// If the cursor's horizontal/vertical offset from the caster is smaller than this many
// pixels, snap the matching axis to 0 so up/down/left/right casts go exactly cardinal.
// Fixes the "straight-up cast drifts slightly left/right" feel when the player is hovering
// near the caster's centre line.
export const AIM_SNAP_THRESHOLD_PX = 6;

// Show a faded circle at the attack range so the player can see their reach.
export const SHOW_PLAYER_ATTACK_RANGE = true;
export const PLAYER_ATTACK_RANGE_RING_COLOR = 0xffffff;
export const PLAYER_ATTACK_RANGE_RING_ALPHA = 0.05;

// Mana
export const PLAYER_MAX_MANA = 100;
export const PLAYER_MANA_REGEN_RATE = 5; // per second

// Cursor hotspot offset tuning. Browser CSS cursor uses these as the hotspot pixel
// coordinates within /assets/cursor/cursor.png. Increase X to move hotspot right, Y to move down.
export const CURSOR_HOTSPOT_X = 35;
export const CURSOR_HOTSPOT_Y = 35;
