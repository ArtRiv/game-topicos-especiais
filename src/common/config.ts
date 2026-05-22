export const ENABLE_LOGGING = false;
export const ENABLE_DEBUG_ZONE_AREA = false;
export const DEBUG_COLLISION_ALPHA = 0;

// Spell "ghost" telegraph — a dimmed preview of the real spell that fires immediately
// on cast and lands SPELL_GHOST_LEAD_MS before the real one, so the opposing mage gets
// a reaction window to dodge. Set ENABLED=false to play without telegraphs (e.g. to
// gate behind a future powerup pickup).
//
//   LEAD_MS   = how far ahead of the real spell the ghost lands. 150ms is roughly a
//               human reaction floor; tune up (200) for "easy" or down (100) for "fair".
//   TINT      = ghost color multiplier. Light cyan reads as "not real, but threatening".
//   ALPHA     = ghost opacity. 0.4 is visible but obviously not the real spell.
export const SPELL_GHOST_PREVIEW_ENABLED = false;
export const SPELL_GHOST_LEAD_MS = 250;
export const SPELL_GHOST_TINT = 0x88ddff;
export const SPELL_GHOST_ALPHA = 0.4;

// DEV shortcut: skip the splash → main-menu → lobby → loading chain and jump
// straight into PreloadScene → GameScene with the DataManager defaults. Useful
// when iterating on gameplay tweaks and reloading the page constantly.
// IMPORTANT: leave this false when committing/shipping — multiplayer / match
// setup is bypassed entirely, so this is single-player only.
export const DEV_SKIP_TO_GAMEPLAY = false;

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

// Lightning sprite variant: 'CURRENT' = Thunder Effect 02 sheet; 'MAGIC_PACK_9' = the
// alternative Lightning frames in Magic Pack 9 files (used by ThunderStrike when set).
export const LIGHTNING_SPRITE_VARIANT: 'CURRENT' | 'MAGIC_PACK_9' = 'CURRENT';

// Lightning burst variant for the FireBolt + ThunderStrike combo. Switch via debug panel.
export const LIGHTNING_BURST_VARIANT: '002' | '003' = '003';

// Damage values for the new combo spells.
export const LIGHTNING_BURST_COMBO_DAMAGE = 8;     // FireBolt + ThunderStrike
export const LIGHTNING_STRIKE_COMBO_DAMAGE = 6;    // ThunderStrike + FireArea
export const LIGHTNING_BURST_COMBO_BODY_RADIUS = 28;
export const LIGHTNING_STRIKE_COMBO_BODY_RADIUS = 26;

// Dark Bolt (darkness orb — was a projectile, now a long-lived ground orb).
// Damage model: tick damage every DARK_BOLT_TICK_INTERVAL ms to enemies inside the orb.
// Player i-frames (PLAYER_INVULNERABLE_AFTER_HIT_DURATION) naturally throttle re-hits.
export const DARK_BOLT_DAMAGE = 1; // legacy "instant" damage — unused under the tick model
export const DARK_BOLT_DAMAGE_PER_TICK = 1;
export const DARK_BOLT_TICK_INTERVAL = 600; // ms between damage ticks
export const DARK_BOLT_MANA_COST = 6; // up from 2 — 8s persistent orb is a heavy commit
export const DARK_BOLT_COOLDOWN = 4000; // ms — up from 650; orb stays for 8s, can't spam
export const DARK_BOLT_SPEED = 650; // legacy (projectile speed) — kept for back-compat with any debug-panel binding
export const DARK_BOLT_LIFETIME = 2200; // legacy (projectile lifetime) — see DARK_BOLT_ORB_HOLD_MS
export const DARK_BOLT_ORB_HOLD_MS = 8000; // how long the orb persists after the build-up animation finishes

// Dark Bolt orb ping-pong loop range. Frames are indices into lightning_burst_003
// (0..9). The orb builds up 0 → HIGH, then ping-pongs between LOW and HIGH for
// DARK_BOLT_ORB_HOLD_MS, then dissipates through any frames after HIGH up to 9.
//
//   Build-up: 0 → 1 → ... → HIGH                       (plays once)
//   Loop:     HIGH-1, HIGH-2, ..., LOW, LOW+1, ..., HIGH  (cycle, repeated)
//   Dissipate: HIGH+1, HIGH+2, ..., 9                  (plays once at end)
//
// Constraints: 0 ≤ LOW < HIGH ≤ 9. Wider gap = more dramatic pulsing.
// Try (1, 7), (0, 7), (2, 8), etc. to taste — the loop anim is rebuilt at cast
// time so changes take effect on the next cast (no rebuild needed).
export const DARK_BOLT_LOOP_FRAME_LOW = 1;
export const DARK_BOLT_LOOP_FRAME_HIGH = 7;

// Cursor hotspot offset tuning. Browser CSS cursor uses these as the hotspot pixel
// coordinates within /assets/cursor/cursor.png. Increase X to move hotspot right, Y to move down.
export const CURSOR_HOTSPOT_X = 35;
export const CURSOR_HOTSPOT_Y = 35;

export const ENEMY_SPIDER_SPEED = 80;
export const ENEMY_SPIDER_CHANGE_DIRECTION_DELAY_MIN = 500;
export const ENEMY_SPIDER_CHANGE_DIRECTION_DELAY_MAX = 1500;
export const ENEMY_SPIDER_CHANGE_DIRECTION_DELAY_WAIT = 200;
export const ENEMY_SPIDER_HURT_PUSH_BACK_SPEED = 50;
export const ENEMY_SPIDER_MAX_HEALTH = 2;

export const ENEMY_WISP_SPEED = 50;
export const ENEMY_WISP_PULSE_ANIMATION_SCALE_X = 1.2;
export const ENEMY_WISP_PULSE_ANIMATION_SCALE_Y = 1.2;
export const ENEMY_WISP_PULSE_ANIMATION_DURATION = 500;
export const ENEMY_WISP_MAX_HEALTH = 1;

export const ENEMY_BOSS_DROW_SPEED = 80;
export const ENEMY_BOSS_DROW_MAX_HEALTH = 6;
export const ENEMY_BOSS_DROW_DEATH_ANIMATION_DURATION = 3000;
export const ENEMY_BOSS_IDLE_STATE_DURATION = 3000;
export const ENEMY_BOSS_HIDDEN_STATE_DURATION = 1000;
export const ENEMY_BOSS_TELEPORT_STATE_INITIAL_DELAY = 150;
export const ENEMY_BOSS_TELEPORT_STATE_FINISHED_DELAY = 500;
export const ENEMY_BOSS_PREPARE_ATTACK_STATE_FINISHED_DELAY = 500;
export const ENEMY_BOSS_ATTACK_DAMAGE = 1;
export const ENEMY_BOSS_ATTACK_SPEED = 160;
export const ENEMY_BOSS_START_INITIAL_DELAY = 1000;

export const HURT_PUSH_BACK_DELAY = 200;
export const BOSS_HURT_PUSH_BACK_DELAY = 50;

export const THROW_ITEM_SPEED = 300;
export const THROW_ITEM_DELAY_BEFORE_CALLBACK = 200;

export const LIFT_ITEM_ANIMATION_DELAY = 0;
export const LIFT_ITEM_ANIMATION_DURATION = 250;
export const LIFT_ITEM_ANIMATION_ENABLE_DEBUGGING = false;

export const ROOM_TRANSITION_PLAYER_INTO_HALL_DURATION = 750;
export const ROOM_TRANSITION_PLAYER_INTO_HALL_DELAY = 250;
export const ROOM_TRANSITION_PLAYER_INTO_NEXT_ROOM_DURATION = 1000;
export const ROOM_TRANSITION_PLAYER_INTO_NEXT_ROOM_DELAY = 1200;
export const ROOM_TRANSITION_CAMERA_ANIMATION_DURATION = 1000;
export const ROOM_TRANSITION_CAMERA_ANIMATION_DELAY = 500;

// Mana
export const PLAYER_MAX_MANA = 100;
export const PLAYER_MANA_REGEN_RATE = 5; // per second

// Earth Bolt (projectile) — sprite origin tuning, same rationale as FIRE_BOLT_SPRITE_ORIGIN_Y.
export const EARTH_BOLT_SPRITE_ORIGIN_X = 0.5;
export const EARTH_BOLT_SPRITE_ORIGIN_Y = 0.5;
export const EARTH_BOLT_DAMAGE = 1;
export const EARTH_BOLT_MANA_COST = 1;
export const EARTH_BOLT_COOLDOWN = 600; // ms - slightly slower than fire bolt
export const EARTH_BOLT_SPEED = 600; // slower, heavier rock
export const EARTH_BOLT_LIFETIME = 2200; // ms before auto-destroy
export const EARTH_BOLT_IMPACT_FORWARD_OFFSET = 16;
// The impact sprite is drawn horizontally while the firebolt's is vertical — offset by 90° so both align the same way.
export const EARTH_BOLT_IMPACT_ROTATION_OFFSET = Math.PI / 2;

// EarthBolt + FireArea combo: Lava Pool
export const LAVA_POOL_DAMAGE_PER_TICK = 1;
export const LAVA_POOL_TICK_INTERVAL = 600; // ms between damage ticks
export const LAVA_POOL_DURATION = 5000; // ms the pool stays active
export const LAVA_POOL_SCALE = 1.5; // visual scale
export const LAVA_POOL_BODY_RADIUS = 14; // AoE circle radius in px

// Earth + Fire combo explosion
export const EARTH_FIRE_EXPLOSION_DAMAGE = 5;
export const EARTH_FIRE_EXPLOSION_SCALE = 2.0;
export const EARTH_FIRE_EXPLOSION_BODY_RADIUS = 20;

// Earth Wall (area protection)
export const EARTH_WALL_PILLAR_HP = 5;
export const EARTH_WALL_PILLAR_COUNT = 8;
export const EARTH_WALL_PILLAR_SPACING = 8;
export const EARTH_WALL_DURATION = 16000; // ms the wall stays up
export const EARTH_WALL_MANA_COST = 0;
export const EARTH_WALL_COOLDOWN = 100; // ms
export const EARTH_WALL_HIT_FLASH_DURATION = 80; // ms white flash on hit
export const EARTH_WALL_FIREBOLT_SPLASH_RADIUS = 24; // px — FireBolt hit damages adjacent pillars within this radius

// Earth Bump (knockback spell)
export const EARTH_BUMP_DAMAGE = 1;
export const EARTH_BUMP_MANA_COST = 1;
export const EARTH_BUMP_COOLDOWN = 1000; // ms
export const EARTH_BUMP_DURATION = 250; // time it stays "fully out" before sinking (was 800)
export const EARTH_BUMP_BODY_RADIUS = 16;
export const EARTH_BUMP_KNOCKBACK_FORCE = 300;
export const EARTH_BUMP_KNOCKBACK_DURATION = 300;

// Fire Bolt (projectile)
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
export const FIRE_BOLT_FIRE_AREA_DAMAGE_MULTIPLIER = 2;
export const FIRE_BOLT_FIRE_AREA_SPEED_MULTIPLIER = 1.35;
export const FIRE_BOLT_FIRE_AREA_SCALE_MULTIPLIER = 1.25;
export const FIRE_BOLT_FIRE_AREA_IMPACT_SCALE_MULTIPLIER = 1.45;

// Fire Area
export const FIRE_AREA_DAMAGE_PER_TICK = 1;
export const FIRE_AREA_MANA_COST = 1; // 1/4 of max mana
export const FIRE_AREA_COOLDOWN = 3000; // ms
export const FIRE_AREA_DURATION = 5000; // ms - longer duration for easier combos
export const FIRE_AREA_TICK_INTERVAL = 500; // ms between damage ticks

// Fire Breath (channeled)
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

// Water Spike (area damage spell)
export const WATER_SPIKE_DAMAGE = 2;
export const WATER_SPIKE_MANA_COST = 2;
export const WATER_SPIKE_COOLDOWN = 800; // ms
export const WATER_SPIKE_LOOP_DURATION = 300; // ms the spike stays active (damage window)
export const WATER_SPIKE_BODY_RADIUS = 10; // AoE circle radius in px

// Water Ball — projectile (FireBolt-like). Plays the 4-frame startup once at the
// caster's position, then loops the "infinite" middle band (frames 4..11) while flying
// to the target. On wall/enemy contact plays the 16-frame impact burst and splashes a
// cluster of puddles.
//   Startup sheet: 4x4 grid, 80x80 per frame → 16 frames total.
//     0..3   = form-up (play once at spawn)
//     4..11  = infinite loop band (8 frames, looped during flight)
//     12..15 = empty (do not use)
//   Impact sheet: 4x4 grid, 64x64 per frame → 16 frames (all used).
export const WATER_BALL_DAMAGE = 2;
export const WATER_BALL_MANA_COST = 4;
export const WATER_BALL_COOLDOWN = 1500; // ms
export const WATER_BALL_SPEED = 500; // px/s — slower than FireBolt (750), water is heavy
export const WATER_BALL_LIFETIME = 2200; // ms before auto-destroy if it never hits anything
export const WATER_BALL_BODY_RADIUS = 14;
// Impact sprite is drawn as a horizontal splash; rotating by 90° from flight angle
// makes it perpendicular to flight (matches EarthBolt's behavior). When aiming up the
// splash extends horizontally, hitting right extends vertically, etc. — physically
// correct "water splashes sideways off the surface it hits" read.
export const WATER_BALL_IMPACT_ROTATION_OFFSET = Math.PI / 2;

// Puddle (wet-floor mechanic) — left behind by water spells, future combos read these.
export const PUDDLE_DEFAULT_LIFETIME_MS = 18000;
export const PUDDLE_MERGE_RADIUS = 16; // a new puddle within this distance of an existing one merges instead
export const PUDDLE_MAX_AMOUNT = 4;
export const PUDDLE_BASE_RADIUS_PX = 12;
export const PUDDLE_AMOUNT_RADIUS_PX = 6; // per unit of amount added to base
export const PUDDLE_TINT = 0x3a6fd6;
export const PUDDLE_HIGHLIGHT_TINT = 0xaaddff;

// Per-spell puddle spawn tuning. COUNT = how many individual puddles spawned per cast.
// SPREAD = max radius (px) from cast center where puddles can land. AMOUNT_EACH = puddle
// "wetness" — bigger = bigger blob + longer-feeling lifetime when stacked via merging.
// Puddles within PUDDLE_MERGE_RADIUS of each other merge instead of overlapping, so
// COUNT × AMOUNT_EACH gives you total water dropped; SPREAD controls how dispersed it is.
export const WATER_SPIKE_PUDDLE_COUNT = 5;
export const WATER_SPIKE_PUDDLE_SPREAD = 14;
export const WATER_SPIKE_PUDDLE_AMOUNT_EACH = 0.5;
export const WATER_TORNADO_PUDDLE_COUNT = 14;
export const WATER_TORNADO_PUDDLE_SPREAD = 24;
export const WATER_TORNADO_PUDDLE_AMOUNT_EACH = 0.5;
// Tornado puddles drip in gradually over the tornado's loop — 200ms between each
// puddle reads as "the tornado is sloshing water around" instead of "14 puddles popped
// into existence at once". WaterSpike (fast spell) intentionally has no stagger.
export const WATER_TORNADO_PUDDLE_STAGGER_MS = 200;
export const WATER_BALL_PUDDLE_COUNT = 4;
export const WATER_BALL_PUDDLE_SPREAD = 32;
export const WATER_BALL_PUDDLE_AMOUNT_EACH = 0.6;

// Water Tornado (water blast spell)
export const WATER_TORNADO_DAMAGE = 3;
export const WATER_TORNADO_DAMAGE_PER_TICK = 1;
export const WATER_TORNADO_MANA_COST = 3;
export const WATER_TORNADO_COOLDOWN = 1500; // ms
export const WATER_TORNADO_DURATION = 2000; // time it stays alive in ms
export const WATER_TORNADO_TICK_INTERVAL = 300; // damage tick interval
export const WATER_TORNADO_BODY_RADIUS = 24;

// ICE_SHARD (projectile)
export const ICE_SHARD_DAMAGE = 1;
export const ICE_SHARD_MANA_COST = 1;
export const ICE_SHARD_COOLDOWN = 550; // ms
export const ICE_SHARD_SPEED = 700;
export const ICE_SHARD_LIFETIME = 2200; // ms
export const ICE_SHARD_IMPACT_FORWARD_OFFSET = 8;

// WIND_BOLT (projectile)
export const WIND_BOLT_DAMAGE = 2;
export const WIND_BOLT_MANA_COST = 2;
export const WIND_BOLT_COOLDOWN = 700; // ms
export const WIND_BOLT_SPEED = 900;
export const WIND_BOLT_LIFETIME = 1800; // ms
export const WIND_BOLT_IMPACT_FORWARD_OFFSET = 8;

// THUNDER_STRIKE (area)
export const THUNDER_STRIKE_DAMAGE = 3;
export const THUNDER_STRIKE_MANA_COST = 3;
export const THUNDER_STRIKE_COOLDOWN = 1200; // ms
export const THUNDER_STRIKE_LOOP_DURATION = 400; // ms body stays active
export const THUNDER_STRIKE_BODY_RADIUS = 20; // px
// Vanilla ThunderStrike alignment + timing tunables (the dark-empowered variant
// keeps its own DARK_EMPOWERED_Y_OFFSET_PX inside thunder-strike.ts and is unaffected).
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
export const THUNDER_STRIKE_REACTION_BUFFER_MS = 120;

// Lightning + Puddle combo splash placement. The Pixelart Splash sprite is anchored
// at the strike's centre (= cursor position). Use these to nudge it if the artwork's
// pivot isn't at the centre of its 32×32 frame.
//   X_OFFSET_PX: positive → right.
//   Y_OFFSET_PX: positive → down, negative → up.
export const THUNDER_PUDDLE_SPLASH_X_OFFSET_PX = 0;
export const THUNDER_PUDDLE_SPLASH_Y_OFFSET_PX = 0;

// Electrified Puddle (ThunderStrike on a Puddle combo).
//
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
export const ELEC_PUDDLE_SPARK_QTY_AT_FULL = 2.2;
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

// Networking (Phase 1: LAN Foundation)
export const NETWORK_SERVER_URL = 'http://localhost';
export const NETWORK_SERVER_PORT = 3000;
export const NETWORK_TICK_RATE_HZ = 20;
export const NETWORK_DEBUG = false;

// Phase 9.3: Host-authoritative damage tunables (mirrored from game-server/src/types.ts).
// Server reads its own copies authoritatively; these client mirrors exist so the debug panel
// can adjust them via RUNTIME_CONFIG. TODO: tune from playtest.
export const RESPAWN_DELAY_MS = 5000;
export const PLAUSIBILITY_RANGE_PX = 96;
export const PLAUSIBILITY_STALE_MS = 200;
export const MAX_SPELL_DAMAGE = 50;

// Phase 9.3 — Dash tunables (D-13). All values overridable via RUNTIME_CONFIG (debug panel).
export const DASH_COOLDOWN_MS = 1500; // ms between dashes
export const DASH_DISTANCE_TILES = 1;
; // dash distance in tiles (96 px at 32 px/tile)
export const DASH_DURATION_MS = 150; // dash motion duration → velocity = 640 px/s (RESEARCH.md §3)
export const DASH_IFRAMES_ENABLED = false; // i-frames during dash (off by default)
export const DASH_IFRAMES_MS = 150; // i-frame window when enabled
export const DASH_CANCELS_CAST = false; // pressing Shift mid-cast aborts the cast
export const DASH_INTERRUPTABLE_BY_CAST = false; // pressing 1/2/3 mid-dash is ignored

// Dash VFX tunables — adjust live via RUNTIME_CONFIG / debug panel.
export const DASH_SMOKE_ALPHA = 0.5; // smoke puff opacity (0..1)
export const DASH_SMOKE_SCALE = 0.7; // smoke puff size multiplier
export const DASH_ROLL_SCALE = 1.0; // roll sprite size multiplier (Role frames are already 16x16, matching the in-frame character size)
