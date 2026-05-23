import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { ASSET_KEYS, ASSET_PACK_KEYS, DASH_ANIMATION_KEYS } from '../common/assets';
import { LevelData } from '../common/types';
import { DataManager } from '../common/data-manager';
import { MusicManager } from '../common/music-manager';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({
      key: SCENE_KEYS.PRELOAD_SCENE,
    });
  }

  public preload(): void {
    // BitmapText atlas (Phase 9.1-04 standard). SplashScene/MainMenuScene
    // also self-load this since they boot before PreloadScene; the cache
    // guard makes subsequent loads safe no-ops.
    const BMFONT_KEY = 'press_start_2p';
    if (!this.cache.bitmapFont.has(BMFONT_KEY)) {
      this.load.bitmapFont(
        BMFONT_KEY,
        'assets/fonts/Press_Start_2P/press_start_white-2.png',
        'assets/fonts/Press_Start_2P/press_start_white-2.xml',
      );
    }

    // load asset pack that has assets for the rest of the game
    this.load.pack(ASSET_PACK_KEYS.MAIN, 'assets/data/assets.json');

    // Ensure music tracks are queued in case we boot via the DEV_SKIP_TO_GAMEPLAY
    // shortcut (which bypasses SplashScene, where loadTracks normally runs).
    // loadTracks is idempotent — no-op if the audio is already cached.
    MusicManager.instance.loadTracks(this);

    // Explicit lobby thumbnail loads. The MAP_THUMB_* entries inside the
    // levels/world and levels/dungeon_1 sub-packs in assets.json are not
    // resolved by the MAIN-keyed pack load (Phaser only fetches entries
    // whose pack key matches), so they would never reach the texture cache
    // before LobbyScene renders. Loading them here guarantees presence.
    this.load.image(
      ASSET_KEYS.MAP_THUMB_WORLD,
      'assets/images/levels/world/thumbnail.png',
    );
    this.load.image(
      ASSET_KEYS.MAP_THUMB_DUNGEON_1,
      'assets/images/levels/dungeon_1/thumbnail.png',
    );

    // Combo / new-spell sprites added in the dark/lightning extension.
    // Lightning bursts and lightning strike are shipped as per-frame PNGs (frameNNNN.png),
    // so we load them individually and assemble the animation from the same-prefix keys.
    const loadFrameSeries = (baseKey: string, basePath: string, count: number): void => {
      for (let i = 0; i < count; i++) {
        const padded = `frame${i.toString().padStart(4, '0')}`;
        this.load.image(`${baseKey}_${i}`, `${basePath}/${padded}.png`);
      }
    };

    loadFrameSeries(
      ASSET_KEYS.LIGHTNING_BURST_002,
      'assets/spells/Lightning/lightning_burst_002/lightning_burst_002_large_violet',
      9,
    );
    loadFrameSeries(
      ASSET_KEYS.LIGHTNING_BURST_003,
      'assets/spells/Lightning/lightning_burst_003/lightning_burst_003_large_violet',
      10,
    );
    loadFrameSeries(
      ASSET_KEYS.LIGHTNING_STRIKE_001,
      'assets/spells/Lightning/lightning_strike_001/lightning_strike_001_large_violet',
      7,
    );

    // FireBolt-into-FireArea impact (placeholder: Hit Effect 01 sheet 1). 336x48 sheet,
    // 48x48 per frame = 7 frames. We use sheet 1 first per request; sheets 2 and 3 exist
    // for easy swapping if the placeholder doesn't read well.
    this.load.spritesheet(
      ASSET_KEYS.FIRE_BOLT_AREA_IMPACT,
      'assets/spells/Hit Effect 01/Hit Effect 01 1.png',
      { frameWidth: 48, frameHeight: 48 },
    );

    // Steam burst (fire + water combo) — per-frame PNGs, 21 frames, large white.
    loadFrameSeries(
      ASSET_KEYS.STEAM_BURST,
      'assets/spells/Smoke Bursts/directional_smoke_burst_001/directional_smoke_burst_001_large_white',
      21,
    );

    // Spell cooldown HUD icons
    this.load.image(ASSET_KEYS.SPELL_ICO_FIRE,  'assets/spell-ico/fire.png');
    this.load.image(ASSET_KEYS.SPELL_ICO_ROCK,  'assets/spell-ico/rock.png');
    this.load.image(ASSET_KEYS.SPELL_ICO_WATER, 'assets/spell-ico/water.png');
    this.load.image(ASSET_KEYS.SPELL_ICO_WIND,  'assets/spell-ico/wind.png');
    this.load.image(ASSET_KEYS.SPELL_ICO_DARK,  'assets/spell-ico/dark.png');

    // Dark Bolt / alternative Lightning — load individual frames (sheet packing is uneven).
    for (let i = 1; i <= 12; i++) {
      this.load.image(
        `${ASSET_KEYS.DARK_BOLT}_${i - 1}`,
        `assets/spells/Magic Pack 9 files/Magic Pack 9 files/sprites/DarkBolt/Dark-Bolt${i}.png`,
      );
    }
    for (let i = 1; i <= 11; i++) {
      this.load.image(
        `${ASSET_KEYS.THUNDER_STRIKE_ALT}_${i - 1}`,
        `assets/spells/Magic Pack 9 files/Magic Pack 9 files/sprites/Lightning/Lightning${i}.png`,
      );
    }
  }

  public create(): void {
    this.#createAnimations();

    const sceneData: LevelData = {
      level: DataManager.instance.data.currentArea.name,
      roomId: DataManager.instance.data.currentArea.startRoomId,
      doorId: DataManager.instance.data.currentArea.startDoorId,
    };
    this.scene.start(SCENE_KEYS.GAME_SCENE, sceneData);
  }

  #createAnimations(): void {
    this.anims.createFromAseprite(ASSET_KEYS.HUD_NUMBERS);
    this.anims.createFromAseprite(ASSET_KEYS.PLAYER);
    this.anims.createFromAseprite(ASSET_KEYS.SPIDER);
    this.anims.createFromAseprite(ASSET_KEYS.WISP);
    this.anims.createFromAseprite(ASSET_KEYS.DROW);
    this.anims.create({
      key: ASSET_KEYS.ENEMY_DEATH,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.ENEMY_DEATH),
      frameRate: 6,
      repeat: 0,
      delay: 0,
    });
    this.anims.create({
      key: ASSET_KEYS.POT_BREAK,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.POT_BREAK),
      frameRate: 6,
      repeat: 0,
      delay: 0,
      hideOnComplete: true,
    });
    this.anims.create({
      key: ASSET_KEYS.DAGGER,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.DAGGER),
      frameRate: 16,
      repeat: -1,
      delay: 0,
    });

    // Fire Bolt animation (projectile - frames 0-3 looping)
    this.anims.create({
      key: ASSET_KEYS.FIRE_BOLT,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.FIRE_BOLT, { start: 0, end: 3 }),
      frameRate: 12,
      repeat: -1,
      delay: 0,
    });

    // Fire Bolt impact animation (frames 5-10, frame 4 is skipped empty space)
    this.anims.create({
      key: ASSET_KEYS.FIRE_BOLT_IMPACT,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.FIRE_BOLT_IMPACT, { start: 5, end: 10 }),
      frameRate: 18,
      repeat: 0,
      delay: 0,
      hideOnComplete: true,
    });

    // Fire Area Explosion animations (area of effect)
    // Start: Initial white explosion (frames 0-9)
    this.anims.create({
      key: `${ASSET_KEYS.FIRE_AREA_EXPLOSION}_START`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.FIRE_AREA_EXPLOSION, { start: 0, end: 8 }),
      frameRate: 15,
      repeat: 0,
      delay: 0,
    });

    // Loop: Active fire area (frames 10-12)
    this.anims.create({
      key: `${ASSET_KEYS.FIRE_AREA_EXPLOSION}_LOOP`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.FIRE_AREA_EXPLOSION, { start: 9, end: 11 }),
      frameRate: 8,
      repeat: -1,
      delay: 0,
    });

    // End: Fade out animation (frames 13+)
    this.anims.create({
      key: `${ASSET_KEYS.FIRE_AREA_EXPLOSION}_END`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.FIRE_AREA_EXPLOSION, { start: 13 }),
      frameRate: 12,
      repeat: 0,
      delay: 0,
    });

    // Fire Breath beam animations (channeled spell, spritesheet: 8 frames/row, 48x48)
    // START: row 1, frames 0-2 (initial burst)
    this.anims.create({
      key: `${ASSET_KEYS.FIRE_BREATH_BEAM}_START`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.FIRE_BREATH_BEAM, { start: 0, end: 2 }),
      frameRate: 12,
      repeat: 0,
    });
    // LOOP: row 2, frames 8-11 (active looping flame)
    this.anims.create({
      key: `${ASSET_KEYS.FIRE_BREATH_BEAM}_LOOP`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.FIRE_BREATH_BEAM, { start: 8, end: 11 }),
      frameRate: 10,
      repeat: -1,
    });
    // END: row 3, frames 16-22 (fade out)
    this.anims.create({
      key: `${ASSET_KEYS.FIRE_BREATH_BEAM}_END`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.FIRE_BREATH_BEAM, { start: 16, end: 22 }),
      frameRate: 12,
      repeat: 0,
      hideOnComplete: true,
    });

    // Fire Breath hit effect animation (5 frames, looping)
    this.anims.create({
      key: ASSET_KEYS.FIRE_BREATH_HIT,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.FIRE_BREATH_HIT),
      frameRate: 14,
      repeat: -1,
    });

    // Earth Wall pillar animations (48x48 frames, 4x4 grid = 16 frames total)
    // Frame 0 is empty; frames 14-15 are empty — skipped.
    this.anims.create({
      key: `${ASSET_KEYS.EARTH_WALL}_EMERGE`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.EARTH_WALL, { start: 1, end: 2 }),
      frameRate: 10,
      repeat: 0,
    });
    this.anims.create({
      key: `${ASSET_KEYS.EARTH_WALL}_IDLE`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.EARTH_WALL, { start: 3, end: 4 }),
      frameRate: 6,
      repeat: -1,
    });
    this.anims.create({
      key: `${ASSET_KEYS.EARTH_WALL}_CRUMBLE`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.EARTH_WALL, { start: 5, end: 13 }),
      frameRate: 12,
      repeat: 0,
      hideOnComplete: true,
    });

    // Earth Bump animations (per spec: frame 0 empty, 1-3 rising, 4-6 fully out,
    // 7-12 ending, 13-15 empty). The new flow plays everything ONCE at a high frame
    // rate so the bump pops out, holds briefly, then sinks — no back-and-forth caused
    // by the previous STARTUP→LOOP transition reusing frame 3.
    this.anims.create({
      key: `${ASSET_KEYS.EARTH_BUMP}_STARTUP`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.EARTH_BUMP, { start: 1, end: 3 }),
      frameRate: 24,
      repeat: 0,
    });
    this.anims.create({
      key: `${ASSET_KEYS.EARTH_BUMP}_LOOP`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.EARTH_BUMP, { start: 4, end: 6 }),
      frameRate: 16,
      repeat: 0,
    });
    this.anims.create({
      key: `${ASSET_KEYS.EARTH_BUMP}_END`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.EARTH_BUMP, { start: 7, end: 12 }),
      frameRate: 24,
      repeat: 0,
      hideOnComplete: true,
    });

    // Earth Bolt projectile animation (frames 0-5, looping spinning rock)
    this.anims.create({
      key: ASSET_KEYS.EARTH_BOLT,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.EARTH_BOLT, { start: 0, end: 5 }),
      frameRate: 12,
      repeat: -1,
    });

    // Earth Bolt impact animation (frames 0-6, play once)
    this.anims.create({
      key: ASSET_KEYS.EARTH_BOLT_IMPACT,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.EARTH_BOLT_IMPACT, { start: 0, end: 6 }),
      frameRate: 14,
      repeat: 0,
      hideOnComplete: true,
    });

    // Lava Pool looping animation (EarthBolt+FireArea combo) — frames 0-3 of
    // the Impact Spritesheet, tinted red at runtime to look like lava.
    this.anims.create({
      key: ASSET_KEYS.EARTH_BOLT_LAVA_POOL,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.EARTH_BOLT_IMPACT, { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1,
    });

    // Earth + Fire combo: rock burst (12 frames across 2 rows, play once)
    this.anims.create({
      key: ASSET_KEYS.EARTH_FIRE_ROCK_BURST,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.EARTH_FIRE_ROCK_BURST, { start: 0, end: 11 }),
      frameRate: 16,
      repeat: 0,
    });

    // Earth + Fire combo: big explosion (16 frames 4×4 grid, play once)
    this.anims.create({
      key: ASSET_KEYS.EARTH_FIRE_EXPLOSION,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.EARTH_FIRE_EXPLOSION, { start: 0, end: 15 }),
      frameRate: 18,
      repeat: 0,
    });

    // Water Spike startup anticipation (11 frames, 1-column sheet, 64×16 per frame)
    this.anims.create({
      key: `${ASSET_KEYS.WATER_SPIKE}_STARTUP`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.WATER_SPIKE_STARTUP, { start: 0, end: 10 }),
      frameRate: 10,
      repeat: 0,
    });

    // Water Spike rise phase (frames 0-3, play once). 30fps matches the in-file preview
    // the user prefers — the spike snaps up rather than rising lazily, giving the spell
    // visual punch. The slow STARTUP anim (the dodge-window puddle) is intentionally
    // unchanged so opposing mages still have a fair window to react before the spike.
    this.anims.create({
      key: `${ASSET_KEYS.WATER_SPIKE}_RISE`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.WATER_SPIKE, { start: 0, end: 3 }),
      frameRate: 30,
      repeat: 0,
    });

    // Water Spike loop phase (frames 4-7, looping)
    this.anims.create({
      key: `${ASSET_KEYS.WATER_SPIKE}_LOOP`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.WATER_SPIKE, { start: 4, end: 7 }),
      frameRate: 10,
      repeat: -1,
    });

    // Water Spike fade phase (frames 8-15, play once then hide)
    this.anims.create({
      key: `${ASSET_KEYS.WATER_SPIKE}_FADE`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.WATER_SPIKE, { start: 8, end: 15 }),
      frameRate: 10,
      repeat: 0,
      hideOnComplete: true,
    });

    // Water Tornado (Water Blast) startup phase (frames 0-3)
    this.anims.create({
      key: `${ASSET_KEYS.WATER_TORNADO_STARTUP_LOOP}_START`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.WATER_TORNADO_STARTUP_LOOP, { start: 0, end: 3 }),
      frameRate: 12,
      repeat: 0,
    });

    // Water Tornado loop phase (frames 4-11)
    this.anims.create({
      key: `${ASSET_KEYS.WATER_TORNADO_STARTUP_LOOP}_LOOP`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.WATER_TORNADO_STARTUP_LOOP, { start: 4, end: 11 }),
      frameRate: 12,
      repeat: -1,
    });

    // Water Ball — startup sheet is 5x5 grid (25 frames, 64x64 each):
    //   0..3   = form-up
    //   4..20  = infinite loop band (17 frames)
    //   21..24 = empty (skipped — user noted these are blank in the source sheet)
    this.anims.create({
      key: `${ASSET_KEYS.WATER_BALL_STARTUP}_START`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.WATER_BALL_STARTUP, { start: 0, end: 3 }),
      frameRate: 14,
      repeat: 0,
    });
    this.anims.create({
      key: `${ASSET_KEYS.WATER_BALL_STARTUP}_LOOP`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.WATER_BALL_STARTUP, { start: 4, end: 20 }),
      frameRate: 18,
      repeat: -1,
    });

    // Water Ball impact — 4x4 grid (16 frames, 64x64 each), play once then hide.
    this.anims.create({
      key: ASSET_KEYS.WATER_BALL_IMPACT,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.WATER_BALL_IMPACT, { start: 0, end: 15 }),
      frameRate: 24,
      repeat: 0,
      hideOnComplete: true,
    });

    // Water Tornado end phase (frames 0-8 of the End spritesheet)
    this.anims.create({
      key: `${ASSET_KEYS.WATER_TORNADO_END}_END`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.WATER_TORNADO_END, { start: 0, end: 8 }),
      frameRate: 12,
      repeat: 0,
      hideOnComplete: true,
    });

    // Ice Shard projectile animation — Ice VFX 1 Start.png is a 1x3 sheet (48x32 per
    // frame): the shard forms over 3 frames then holds on the last frame for the rest
    // of its flight. `repeat: 0` means Phaser stops on the last frame and stays there
    // until something else (explode → ICE_SHARD_HIT) replaces the anim.
    this.anims.create({
      key: ASSET_KEYS.ICE_SHARD,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.ICE_SHARD, { start: 0, end: 2 }),
      frameRate: 14,
      repeat: 0,
    });

    // Ice Shard hit/explode animation — Ice VFX 1 Hit.png is a 1x8 sheet (48x32).
    this.anims.create({
      key: ASSET_KEYS.ICE_SHARD_HIT,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.ICE_SHARD_HIT, { start: 0, end: 7 }),
      frameRate: 18,
      repeat: 0,
      hideOnComplete: true,
    });

    // Wind Bolt projectile animation (all 6 frames, looping)
    this.anims.create({
      key: ASSET_KEYS.WIND_BOLT,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.WIND_BOLT, { start: 0, end: 5 }),
      frameRate: 12,
      repeat: -1,
    });

    // Wind Bolt hit animation (all 6 frames, play once then hide)
    this.anims.create({
      key: ASSET_KEYS.WIND_BOLT_HIT,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.WIND_BOLT_HIT, { start: 0, end: 5 }),
      frameRate: 18,
      repeat: 0,
      hideOnComplete: true,
    });

    // Thunder Strike descending animation (13 frames, play once — body activates on complete)
    this.anims.create({
      key: ASSET_KEYS.THUNDER_STRIKE,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.THUNDER_STRIKE, { start: 0, end: 12 }),
      frameRate: 18,
      repeat: 0,
    });

    // Thunder Splash dissipation animation (14 frames, play once then hide)
    this.anims.create({
      key: ASSET_KEYS.THUNDER_SPLASH,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.THUNDER_SPLASH, { start: 0, end: 13 }),
      frameRate: 18,
      repeat: 0,
      hideOnComplete: true,
    });

    // Pixelart Splash (lightning-on-puddle splash VFX). 6 frames @ 32x32, play once then hide.
    this.anims.create({
      key: ASSET_KEYS.PIXELART_SPLASH,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.PIXELART_SPLASH, { start: 0, end: 5 }),
      frameRate: 20,
      repeat: 0,
      hideOnComplete: true,
    });

    // Thunder Splash spell — slow lightning projectile cast with the THUNDER_SPLASH sheet
    // (14 frames @ 48x48). Three animation phases, each pinned to a fixed slice of frames:
    //   _CHARGE  frames 0..1  — stationary windup at the caster
    //   _TRAVEL  frames 2..6  — slowly drifts toward the target
    //   _LAND    frames 7..13 — plays out at the landing point, hides on complete
    this.anims.create({
      key: `${ASSET_KEYS.THUNDER_SPLASH}_CHARGE`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.THUNDER_SPLASH, { start: 0, end: 1 }),
      frameRate: 8,
      repeat: 0,
    });
    this.anims.create({
      key: `${ASSET_KEYS.THUNDER_SPLASH}_TRAVEL`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.THUNDER_SPLASH, { start: 2, end: 6 }),
      frameRate: 8,
      repeat: 0,
    });
    this.anims.create({
      key: `${ASSET_KEYS.THUNDER_SPLASH}_LAND`,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.THUNDER_SPLASH, { start: 7, end: 13 }),
      frameRate: 14,
      repeat: 0,
      hideOnComplete: true,
    });

    // Air Burst — wind super-dash VFX (3x3 grid → 9 frames @ 48x48).
    this.anims.create({
      key: ASSET_KEYS.AIR_BURST,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.AIR_BURST, { start: 0, end: 8 }),
      frameRate: 24,
      repeat: 0,
      hideOnComplete: true,
    });

    // Dash roll animation — 5 separate 16x16 images. Frame rate ≈ 5 frames / DASH_DURATION_MS (150 ms) = 33 fps.
    this.anims.create({
      key: DASH_ANIMATION_KEYS.ROLL,
      frames: [
        { key: ASSET_KEYS.PLAYER_ROLL_1 },
        { key: ASSET_KEYS.PLAYER_ROLL_2 },
        { key: ASSET_KEYS.PLAYER_ROLL_3 },
        { key: ASSET_KEYS.PLAYER_ROLL_4 },
        { key: ASSET_KEYS.PLAYER_ROLL_5 },
      ],
      frameRate: 30,
      repeat: 0,
    });

    // Dash smoke puff — 8 frames at 64x64.
    this.anims.create({
      key: DASH_ANIMATION_KEYS.SMOKE,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.DASH_SMOKE, { start: 0, end: 7 }),
      frameRate: 18,
      repeat: 0,
      hideOnComplete: true,
    });

    // Per-frame composite animations (assets loaded as N individual images).
    const makeSeriesAnim = (animKey: string, baseKey: string, count: number, frameRate: number): void => {
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = 0; i < count; i++) frames.push({ key: `${baseKey}_${i}` });
      this.anims.create({ key: animKey, frames, frameRate, repeat: 0, hideOnComplete: true });
    };

    makeSeriesAnim(ASSET_KEYS.LIGHTNING_BURST_002, ASSET_KEYS.LIGHTNING_BURST_002, 9, 18);
    makeSeriesAnim(ASSET_KEYS.LIGHTNING_BURST_003, ASSET_KEYS.LIGHTNING_BURST_003, 10, 18);
    makeSeriesAnim(ASSET_KEYS.LIGHTNING_STRIKE_001, ASSET_KEYS.LIGHTNING_STRIKE_001, 7, 18);
    makeSeriesAnim(ASSET_KEYS.STEAM_BURST, ASSET_KEYS.STEAM_BURST, 21, 20);

    // Dark Bolt orb animations are built lazily in dark-bolt.ts based on the current
    // DARK_BOLT_LOOP_FRAME_LOW / _HIGH config values (so the loop range can be tuned
    // without changing this file). Cached in Phaser's anim system after first cast.

    // FireBolt-into-FireArea impact: 7 frames @ 48x48 from the Hit Effect 01 sheet.
    this.anims.create({
      key: ASSET_KEYS.FIRE_BOLT_AREA_IMPACT,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.FIRE_BOLT_AREA_IMPACT, { start: 0, end: 6 }),
      frameRate: 22,
      repeat: 0,
      hideOnComplete: true,
    });

    // Dark Bolt projectile — 12 frames, looping.
    const darkBoltFrames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = 0; i < 12; i++) darkBoltFrames.push({ key: `${ASSET_KEYS.DARK_BOLT}_${i}` });
    this.anims.create({ key: ASSET_KEYS.DARK_BOLT, frames: darkBoltFrames, frameRate: 16, repeat: -1 });

    // Magic Pack 9 alternative Lightning — 11 frames, play once.
    const thunderAltFrames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = 0; i < 11; i++) thunderAltFrames.push({ key: `${ASSET_KEYS.THUNDER_STRIKE_ALT}_${i}` });
    this.anims.create({ key: ASSET_KEYS.THUNDER_STRIKE_ALT, frames: thunderAltFrames, frameRate: 18, repeat: 0 });
  }
}
