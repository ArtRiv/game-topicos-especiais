export const ENABLE_LOGGING = false;
export const ENABLE_DEBUG_ZONE_AREA = false;
export const DEBUG_COLLISION_ALPHA = 0;

export const PLAYER_SPEED = 80;
export const PLAYER_INVULNERABLE_AFTER_HIT_DURATION = 1000;
export const PLAYER_HURT_PUSH_BACK_SPEED = 50;
export const PLAYER_START_MAX_HEALTH = 6;
export const PLAYER_ATTACK_DAMAGE = 1;

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

// Earth Bolt (projectile)
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
export const EARTH_BUMP_DURATION = 800; // time it stays active
export const EARTH_BUMP_BODY_RADIUS = 16;
export const EARTH_BUMP_KNOCKBACK_FORCE = 300;
export const EARTH_BUMP_KNOCKBACK_DURATION = 300;

// Fire Bolt (projectile)
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
export const WATER_SPIKE_BODY_RADIUS = 20; // AoE circle radius in px

// Water Tornado (water blast spell)
export const WATER_TORNADO_DAMAGE = 3;
export const WATER_TORNADO_DAMAGE_PER_TICK = 1;
export const WATER_TORNADO_MANA_COST = 3;
export const WATER_TORNADO_COOLDOWN = 1500; // ms
export const WATER_TORNADO_DURATION = 2000; // time it stays alive in ms
export const WATER_TORNADO_TICK_INTERVAL = 300; // damage tick interval
export const WATER_TORNADO_BODY_RADIUS = 24;


// Networking (Phase 1: LAN Foundation)
export const NETWORK_SERVER_URL = 'http://localhost';
export const NETWORK_SERVER_PORT = 3000;
export const NETWORK_TICK_RATE_HZ = 60;
