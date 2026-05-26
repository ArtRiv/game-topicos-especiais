export const ASSET_PACK_KEYS = {
  MAIN: 'MAIN',
} as const;

export const ASSET_KEYS = {
  PLAYER: 'PLAYER',
  POT: 'POT',
  POT_BREAK: 'POT_BREAK',
  SPIDER: 'SPIDER',
  WISP: 'WISP',
  DROW: 'DROW',
  DAGGER: 'DAGGER',
  DUNGEON_1_BACKGROUND: 'DUNGEON_1_BACKGROUND',
  DUNGEON_1_FOREGROUND: 'DUNGEON_1_FOREGROUND',
  DUNGEON_1_LEVEL: 'DUNGEON_1_LEVEL',
  COLLISION: 'COLLISION',
  DUNGEON_OBJECTS: 'DUNGEON_OBJECTS',
  ENEMY_DEATH: 'ENEMY_DEATH',
  UI_DIALOG: 'UI_DIALOG',
  UI_ICONS: 'UI_ICONS',
  UI_CURSOR: 'UI_CURSOR',
  WORLD_BACKGROUND: 'WORLD_BACKGROUND',
  WORLD_FOREGROUND: 'WORLD_FOREGROUND',
  WORLD_LEVEL: 'WORLD_LEVEL',
  MAP_THUMB_WORLD: 'MAP_THUMB_WORLD',
  MAP_THUMB_DUNGEON_1: 'MAP_THUMB_DUNGEON_1',
  MAP_THUMB_STAGES: 'MAP_THUMB_STAGES',
  // Stages arena map (PvP open field). Renders its own tile layers via 6 themed
  // tilesets, so unlike WORLD/DUNGEON_1 it has no separate BG/FG PNGs.
  STAGES_LEVEL: 'STAGES_LEVEL',
  STAGES_COLLISION: 'STAGES_COLLISION',
  STAGES_TX_PLANT: 'STAGES_TX_PLANT',
  STAGES_TX_TILESET_GRASS: 'STAGES_TX_TILESET_GRASS',
  STAGES_TX_SHADOW_PLANT: 'STAGES_TX_SHADOW_PLANT',
  STAGES_TX_TILESET_WALL: 'STAGES_TX_TILESET_WALL',
  STAGES_TX_STRUCT: 'STAGES_TX_STRUCT',
  STAGES_TX_PROPS: 'STAGES_TX_PROPS',
  HUD_NUMBERS: 'HUD_NUMBERS',
  FONT_PRESS_START_2P: 'FONT_PRESS_START_2P',
  FIRE_BOLT: 'FIRE_BOLT',
  FIRE_BOLT_IMPACT: 'FIRE_BOLT_IMPACT',
  FIRE_AREA_EXPLOSION: 'FIRE_AREA_EXPLOSION',
  FIRE_BREATH_BEAM: 'FIRE_BREATH_BEAM',
  FIRE_BREATH_HIT: 'FIRE_BREATH_HIT',
  EARTH_BOLT: 'EARTH_BOLT',
  EARTH_BOLT_IMPACT: 'EARTH_BOLT_IMPACT',
  EARTH_FIRE_ROCK_BURST: 'EARTH_FIRE_ROCK_BURST',
  EARTH_FIRE_EXPLOSION: 'EARTH_FIRE_EXPLOSION',
  EARTH_BOLT_LAVA_POOL: 'EARTH_BOLT_LAVA_POOL',
  EARTH_FIRE_BURST_VFX1: 'EARTH_FIRE_BURST_VFX1',
  EARTH_FIRE_BURST_VFX2: 'EARTH_FIRE_BURST_VFX2',
  EARTH_FIRE_BURST_VFX3: 'EARTH_FIRE_BURST_VFX3',
  EARTH_WALL: 'EARTH_WALL',
  EARTH_BUMP: 'EARTH_BUMP',
  FLYING_OBELISK: 'FLYING_OBELISK',
  WATER_SPIKE: 'WATER_SPIKE',
  WATER_SPIKE_STARTUP: 'WATER_SPIKE_STARTUP',
  WATER_TORNADO_STARTUP_LOOP: 'WATER_TORNADO_STARTUP_LOOP',
  WATER_TORNADO_END: 'WATER_TORNADO_END',
  ICE_SHARD: 'ICE_SHARD',
  ICE_SHARD_HIT: 'ICE_SHARD_HIT',
  WIND_BOLT: 'WIND_BOLT',
  WIND_BOLT_HIT: 'WIND_BOLT_HIT',
  THUNDER_STRIKE: 'THUNDER_STRIKE',
  THUNDER_SPLASH: 'THUNDER_SPLASH',
  PIXELART_SPLASH: 'PIXELART_SPLASH',
  // --- UI / Menu (Phase 9.2 port) ---
  MENU_BG: 'MENU_BG',
  MENU_BG_VIDEO: 'MENU_BG_VIDEO',
  MENU_MUSIC: 'MENU_MUSIC',
  GAMEPLAY_MUSIC: 'GAMEPLAY_MUSIC',
  INTRO_MUSIC: 'INTRO_MUSIC',
  // --- Dash VFX ---
  PLAYER_ROLL_1: 'PLAYER_ROLL_1',
  PLAYER_ROLL_2: 'PLAYER_ROLL_2',
  PLAYER_ROLL_3: 'PLAYER_ROLL_3',
  PLAYER_ROLL_4: 'PLAYER_ROLL_4',
  PLAYER_ROLL_5: 'PLAYER_ROLL_5',
  DASH_SMOKE: 'DASH_SMOKE',
  // --- Combo VFX (Phase: dark/lightning extension) ---
  LIGHTNING_BURST_002: 'LIGHTNING_BURST_002',
  LIGHTNING_BURST_003: 'LIGHTNING_BURST_003',
  LIGHTNING_STRIKE_001: 'LIGHTNING_STRIKE_001',
  THUNDER_STRIKE_ALT: 'THUNDER_STRIKE_ALT',
  VOID_ORB: 'VOID_ORB',
  // Impact VFX shown where a FireBolt first overlaps a FireArea (signals the player
  // that the bolt-into-area combo is firing). Spritesheet: 336x48 = 7 frames @ 48x48.
  FIRE_BOLT_AREA_IMPACT: 'FIRE_BOLT_AREA_IMPACT',
  // Directional smoke burst used as the steam puff for fire-vs-water combos.
  // Per-frame PNGs (21 frames, large white variant).
  STEAM_BURST: 'STEAM_BURST',
  // WaterBall spell — 4x4 spritesheets, 80x80 per startup frame, 64x64 per impact frame.
  WATER_BALL_STARTUP: 'WATER_BALL_STARTUP',
  WATER_BALL_IMPACT: 'WATER_BALL_IMPACT',
  // AirBurst — wind super-dash VFX (3x3 grid, 144x144 total → 48x48 per frame).
  AIR_BURST: 'AIR_BURST',
  // Spell cooldown HUD icons (32x32 PNGs from public/assets/spell-ico/)
  SPELL_ICO_FIRE: 'SPELL_ICO_FIRE',
  SPELL_ICO_ROCK: 'SPELL_ICO_ROCK',
  SPELL_ICO_WATER: 'SPELL_ICO_WATER',
  SPELL_ICO_WIND: 'SPELL_ICO_WIND',
  SPELL_ICO_DARK: 'SPELL_ICO_DARK',
  // Lightning and Ice are generated programmatically in UiScene (no PNG available)
  SPELL_ICO_LIGHTNING: 'SPELL_ICO_LIGHTNING',
  SPELL_ICO_ICE: 'SPELL_ICO_ICE',
  // Element carousel — 192x192 PNGs from public/assets/ui/element-menu/ + Kenney panel border.
  ELEMENT_ICON_FIRE: 'ELEMENT_ICON_FIRE',
  ELEMENT_ICON_WATER: 'ELEMENT_ICON_WATER',
  ELEMENT_ICON_EARTH: 'ELEMENT_ICON_EARTH',
  ELEMENT_ICON_WIND: 'ELEMENT_ICON_WIND',
  ELEMENT_ICON_LIGHTNING: 'ELEMENT_ICON_LIGHTNING',
  CAROUSEL_PANEL: 'CAROUSEL_PANEL',
  // LightningBeam — held/channeled lightning beam (replaces ThunderSplash). Two stacked
  // spritesheets (vfx1 + vfx2), each 1024x128 = 4 frames @ 256x128.
  LIGHTNING_BEAM_VFX1: 'LIGHTNING_BEAM_VFX1',
  LIGHTNING_BEAM_VFX2: 'LIGHTNING_BEAM_VFX2',
  // VoidOrb sprite swap — Blood Mage VFX1, 3-phase animation (start/loop/end), 128x128
  // per frame. Frames-per-sheet differ per phase: start=8, loop=5, end=6.
  VOID_ORB_BM_START: 'VOID_ORB_BM_START',
  VOID_ORB_BM_LOOP: 'VOID_ORB_BM_LOOP',
  VOID_ORB_BM_END: 'VOID_ORB_BM_END',
  VOID_ORB_BM_VFX2: 'VOID_ORB_BM_VFX2',         // 12-frame backdrop layered under VFX1
  VOID_ORB_PARTICLE: 'VOID_ORB_PARTICLE',        // generated at runtime — 4×4 white dot
  VOID_ORB_DISPLACEMENT: 'VOID_ORB_DISPLACEMENT',// generated at runtime — radial noise map
  // DarkBolt — Hollow-Purple-style erasure projectile. Blood Mage VFX3 sheet, 4 frames @ 128×128.
  DARK_BOLT_BM_VFX3: 'DARK_BOLT_BM_VFX3',
  // Star Shield — Starcaller VFX 3 sphere. 5×3 sheet, 128×128 per frame (15 total).
  // Wraps the caster as an invulnerability/reflection bubble.
  STAR_SHIELD: 'STAR_SHIELD',
} as const;

export const DASH_ANIMATION_KEYS = {
  ROLL: 'player_roll',
  SMOKE: 'dash_smoke',
} as const;

export const PLAYER_ANIMATION_KEYS = {
  WALK_DOWN: 'player_walk_down',
  WALK_UP: 'player_walk_up',
  WALK_SIDE: 'player_walk_side',
  IDLE_DOWN: 'player_idle_down',
  IDLE_UP: 'player_idle_up',
  IDLE_SIDE: 'player_idle_side',
  IDLE_HOLD_DOWN: 'player_hand_in_air_down',
  IDLE_HOLD_UP: 'player_hand_in_air_up',
  IDLE_HOLD_SIDE: 'player_hand_in_air_side',
  WALK_HOLD_DOWN: 'player_walk_hand_in_air_down',
  WALK_HOLD_UP: 'player_walk_hand_in_air_up',
  WALK_HOLD_SIDE: 'player_walk_hand_in_air_side',
  LIFT_DOWN: 'player_open_chest_down',
  LIFT_UP: 'player_open_chest_up',
  LIFT_SIDE: 'player_open_chest_side',
  HURT_DOWN: 'player_hit_down',
  HURT_UP: 'player_hit_up',
  HURT_SIDE: 'player_hit_side',
  DIE_DOWN: 'player_die_down',
  DIE_UP: 'player_die_up',
  DIE_SIDE: 'player_die_side',
  SWORD_1_ATTACK_DOWN: 'player_atk_1_down',
  SWORD_1_ATTACK_UP: 'player_atk_1_up',
  SWORD_1_ATTACK_SIDE: 'player_atk_1_side',
} as const;

export const SPIDER_ANIMATION_KEYS = {
  WALK: 'spider_walk',
  HIT: 'spider_hit',
  DEATH: ASSET_KEYS.ENEMY_DEATH,
} as const;

export const DROW_ANIMATION_KEYS = {
  WALK_DOWN: 'drow_walk_down',
  WALK_UP: 'drow_walk_up',
  WALK_LEFT: 'drow_walk_left',
  WALK_RIGHT: 'drow_walk_right',
  IDLE_DOWN: 'drow_idle_down',
  IDLE_UP: 'drow_idle_up',
  IDLE_SIDE: 'drow_idle_right',
  HIT: 'drow_hit',
  ATTACK_DOWN: 'drow_atk_down',
  ATTACK_UP: 'drow_atk_up',
  ATTACK_SIDE: 'drow_atk_right',
} as const;

export const WISP_ANIMATION_KEYS = {
  IDLE: 'wisp_idle',
} as const;

export const CHARACTER_ANIMATIONS = {
  IDLE_DOWN: 'IDLE_DOWN',
  IDLE_UP: 'IDLE_UP',
  IDLE_LEFT: 'IDLE_LEFT',
  IDLE_RIGHT: 'IDLE_RIGHT',
  WALK_DOWN: 'WALK_DOWN',
  WALK_UP: 'WALK_UP',
  WALK_LEFT: 'WALK_LEFT',
  WALK_RIGHT: 'WALK_RIGHT',
  IDLE_HOLD_DOWN: 'IDLE_HOLD_DOWN',
  IDLE_HOLD_UP: 'IDLE_HOLD_UP',
  IDLE_HOLD_LEFT: 'IDLE_HOLD_LEFT',
  IDLE_HOLD_RIGHT: 'IDLE_HOLD_RIGHT',
  WALK_HOLD_DOWN: 'WALK_HOLD_DOWN',
  WALK_HOLD_UP: 'WALK_HOLD_UP',
  WALK_HOLD_LEFT: 'WALK_HOLD_LEFT',
  WALK_HOLD_RIGHT: 'WALK_HOLD_RIGHT',
  LIFT_DOWN: 'LIFT_DOWN',
  LIFT_UP: 'LIFT_UP',
  LIFT_LEFT: 'LIFT_LEFT',
  LIFT_RIGHT: 'LIFT_RIGHT',
  HURT_DOWN: 'HURT_DOWN',
  HURT_UP: 'HURT_UP',
  HURT_LEFT: 'HURT_LEFT',
  HURT_RIGHT: 'HURT_RIGHT',
  DIE_DOWN: 'DIE_DOWN',
  DIE_UP: 'DIE_UP',
  DIE_LEFT: 'DIE_LEFT',
  DIE_RIGHT: 'DIE_RIGHT',
} as const;

export const CHEST_FRAME_KEYS = {
  BIG_CHEST_CLOSED: 'big_chest_closed.png',
  SMALL_CHEST_CLOSED: 'chest_closed.png',
  BIG_CHEST_OPEN: 'big_chest_open.png',
  SMALL_CHEST_OPEN: 'chest_open.png',
} as const;

export const DOOR_FRAME_KEYS = {
  TRAP_LEFT: 'trap_left.png',
  TRAP_RIGHT: 'trap_right.png',
  TRAP_UP: 'trap_up.png',
  TRAP_DOWN: 'trap_down.png',
  BOSS_LEFT: 'boss_left.png',
  BOSS_RIGHT: 'boss_right.png',
  BOSS_UP: 'boss_up.png',
  BOSS_DOWN: 'boss_down.png',
  LOCK_LEFT: 'lock_left.png',
  LOCK_RIGHT: 'lock_right.png',
  LOCK_UP: 'lock_up.png',
  LOCK_DOWN: 'lock_down.png',
} as const;

export const BUTTON_FRAME_KEYS = {
  FLOOR_SWITCH: 'floor_switch.png',
  PLATE_SWITCH: 'plate_switch.png',
} as const;

export const CHEST_REWARD_TO_TEXTURE_FRAME = {
  SMALL_KEY: 119,
  BOSS_KEY: 121,
  MAP: 117,
  COMPASS: 118,
  NOTHING: 126,
} as const;

export const HEART_ANIMATIONS = {
  LOSE_LAST_HALF: 'heart_lose_last_half',
  LOSE_FIRST_HALF: 'heart_lost_first_half',
};

export const HEART_TEXTURE_FRAME = {
  NONE: '15',
  FULL: '10',
  EMPTY: '14',
  HALF: '12',
} as const;
