import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE, DIRECTION } from '../../common/common';
import {
  WATER_TORNADO_MANA_COST,
  WATER_TORNADO_COOLDOWN,
  WATER_TORNADO_DURATION,
  WATER_TORNADO_BODY_RADIUS,
  WATER_TORNADO_TICK_INTERVAL,
} from '../../common/config';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { CharacterGameObject } from '../common/character-game-object';
import { Puddle } from './puddle';

type WaterTornadoPhase = 'startup' | 'loop' | 'end';

export class WaterTornado extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.WATER;
  readonly spellId: SpellId = SPELL_ID.WATER_TORNADO;
  readonly spellType: SpellType = SPELL_TYPE.AREA;
  readonly manaCost: number = WATER_TORNADO_MANA_COST;
  readonly cooldown: number = WATER_TORNADO_COOLDOWN;

  #phase: WaterTornadoPhase = 'startup';
  #durationTimer: Phaser.Time.TimerEvent | undefined;
  #tickTimer: Phaser.Time.TimerEvent | undefined;
  #enemiesInArea: Set<CharacterGameObject> = new Set();
  #isDying: boolean = false;

  get baseDamage(): number {
    return RUNTIME_CONFIG.WATER_TORNADO_DAMAGE_PER_TICK;
  }

  get isDamageActive(): boolean {
    return this.#phase === 'loop' && !this.#isDying;
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    // Offset y slightly if needed so it sits on the ground.
    // The frames are 128x128. Let's offset by half height (64px).
    super(scene, x, y - 48, ASSET_KEYS.WATER_TORNADO_STARTUP_LOOP);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(3);

    const body = this.body as Phaser.Physics.Arcade.Body;
    // Circle centred horizontally, placed near the bottom of the 128px bounding box
    const radius = WATER_TORNADO_BODY_RADIUS;
    body.setCircle(radius, 64 - radius, 128 - radius * 2 - 10);
    body.setImmovable(true);
    body.setAllowGravity(false);
    body.enable = false;

    // Start with the startup animation
    this.#startStartup();
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  public addEnemyInArea(enemy: CharacterGameObject): void {
    if (!this.#isDying) {
      this.#enemiesInArea.add(enemy);
    }
  }

  public removeEnemyFromArea(enemy: CharacterGameObject): void {
    this.#enemiesInArea.delete(enemy);
  }

  #applyTickDamage(): void {
    if (!this.isDamageActive) return;
    for (const enemy of this.#enemiesInArea) {
      if (enemy.active && !enemy.isDefeated) {
        enemy.hit(DIRECTION.DOWN, this.baseDamage);
      }
    }
  }

  #startStartup(): void {
    this.#phase = 'startup';
    this.play(`${ASSET_KEYS.WATER_TORNADO_STARTUP_LOOP}_START`);
    this.once(`animationcomplete-${ASSET_KEYS.WATER_TORNADO_STARTUP_LOOP}_START`, () => {
      if (this.active) this.#startLoop();
    });
  }

  #startLoop(): void {
    if (!this.active) return;
    this.#phase = 'loop';

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = true;

    // Drop puddles around the tornado's base RIGHT when the loop begins — the water is
    // visibly on the ground while the tornado is still spinning, not magically after.
    // Cluster spawn → 7 small puddles within ~48px of the base merge into a natural
    // 2-3 larger pool footprint matching the tornado's reach.
    Puddle.spawnCluster(
      this.scene,
      this.x,
      this.y + 48, // tornado base (sprite origin sits 48px above the cast target)
      RUNTIME_CONFIG.WATER_TORNADO_PUDDLE_COUNT,
      RUNTIME_CONFIG.WATER_TORNADO_PUDDLE_SPREAD,
      RUNTIME_CONFIG.WATER_TORNADO_PUDDLE_AMOUNT_EACH,
      undefined, // lifetimeMs — use default
      RUNTIME_CONFIG.WATER_TORNADO_PUDDLE_STAGGER_MS, // drip in gradually over the loop
    );

    this.play(`${ASSET_KEYS.WATER_TORNADO_STARTUP_LOOP}_LOOP`);

    // Tick damage every WATER_TORNADO_TICK_INTERVAL ms
    this.#tickTimer = this.scene.time.addEvent({
      delay: WATER_TORNADO_TICK_INTERVAL,
      callback: this.#applyTickDamage,
      callbackScope: this,
      loop: true,
    });

    // Handle duration
    this.#durationTimer = this.scene.time.delayedCall(WATER_TORNADO_DURATION, () => {
      if (this.active) this.#startFade();
    });
  }

  #startFade(): void {
    if (!this.active || this.#isDying) return;
    this.#isDying = true;
    this.#phase = 'end';

    this.#tickTimer?.destroy();
    this.#tickTimer = undefined;
    this.#enemiesInArea.clear();

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;

    // Play end animation
    this.play(`${ASSET_KEYS.WATER_TORNADO_END}_END`);
    this.once(`animationcomplete-${ASSET_KEYS.WATER_TORNADO_END}_END`, () => {
      // Puddles already laid during #startLoop — nothing extra here.
      this.destroy();
    });
  }

  public destroy(fromScene?: boolean): void {
    this.#durationTimer?.destroy();
    this.#tickTimer?.destroy();
    this.#enemiesInArea.clear();
    super.destroy(fromScene);
  }
}

import { registerSpell } from './spell-registry';
registerSpell(SPELL_ID.WATER_TORNADO, (scene, _x, _y, tx, ty) => new WaterTornado(scene, tx, ty));
