import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { ASSET_KEYS, ASSET_PACK_KEYS } from '../common/assets';
import { LevelData } from '../common/types';
import { DataManager } from '../common/data-manager';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({
      key: SCENE_KEYS.PRELOAD_SCENE,
    });
  }

  public preload(): void {
    // load asset pack that has assets for the rest of the game
    this.load.pack(ASSET_PACK_KEYS.MAIN, 'assets/data/assets.json');
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
  }
}
