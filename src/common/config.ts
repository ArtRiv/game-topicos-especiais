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
export const FIRE_BREATH_MOUTH_FORWARD_OFFSET = 2; // pixels forward from the mouth anchor
export const FIRE_BREATH_MOUTH_VERTICAL_OFFSET = 6; // pixels upward from player center
export const FIRE_BREATH_HIT_SURFACE_OFFSET = 0; // pixels pulled away from the impact surface
export const FIRE_BREATH_BEAM_CONTACT_OVERLAP = 10; // pixels of visual overlap so the flame reaches the hit point
