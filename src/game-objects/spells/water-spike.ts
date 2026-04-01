import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import {
  WATER_SPIKE_MANA_COST,
  WATER_SPIKE_COOLDOWN,
  WATER_SPIKE_LOOP_DURATION,
  WATER_SPIKE_BODY_RADIUS,
} from '../../common/config';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { CharacterGameObject } from '../common/character-game-object';

type WaterSpikePhase = 'startup' | 'rise' | 'loop' | 'fade';

export class WaterSpike extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.WATER;
  readonly spellId: SpellId = SPELL_ID.WATER_SPIKE;
  readonly spellType: SpellType = SPELL_TYPE.AREA;
  readonly manaCost: number = WATER_SPIKE_MANA_COST;
  readonly cooldown: number = WATER_SPIKE_COOLDOWN;

  #startupSprite: Phaser.GameObjects.Sprite;
  #startupTimer: Phaser.Time.TimerEvent | undefined;
  #phase: WaterSpikePhase = 'startup';
  #loopTimer: Phaser.Time.TimerEvent | undefined;
  #hitEnemies: Set<CharacterGameObject> = new Set();

  get baseDamage(): number {
    return RUNTIME_CONFIG.WATER_SPIKE_DAMAGE;
  }

  get isDamageActive(): boolean {
    return this.#phase === 'rise' || this.#phase === 'loop';
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    // Offset y by half the frame height so the bottom of the 80px frame sits at the target position.
    // Never use setOrigin() on an Arcade Physics sprite — the body sync uses the body's own
    // width/height (not the frame size) and will drift the sprite sideways every update tick.
    super(scene, x, y - 40, ASSET_KEYS.WATER_SPIKE);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(3);
    this.setVisible(false);

    const body = this.body as Phaser.Physics.Arcade.Body;
    // Circle centred on the sprite with default origin (0.5, 0.5)
    body.setCircle(WATER_SPIKE_BODY_RADIUS, 32 - WATER_SPIKE_BODY_RADIUS, 40 - WATER_SPIKE_BODY_RADIUS);
    body.setImmovable(true);
    body.setAllowGravity(false);
    body.enable = false;

    // Startup sprite — plain sprite, setOrigin works fine here (no physics body)
    this.#startupSprite = scene.add.sprite(x, y, ASSET_KEYS.WATER_SPIKE_STARTUP);
    this.#startupSprite.setDepth(3);
    this.#startupSprite.setOrigin(0.5, 1);
    this.#startupSprite.setDisplaySize(64, 16);
    this.#startupSprite.play(`${ASSET_KEYS.WATER_SPIKE}_STARTUP`);

    // Duration: 11 frames ÷ 10 fps = 1100 ms
    this.#startupTimer = scene.time.delayedCall(1100, () => {
      if (!this.active) return;
      this.#startupSprite.setVisible(false);
      this.#startRise();
    });
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  /** Called when this spike overlaps with an enemy. Damages each enemy once per activation. */
  public hitEnemy(enemy: CharacterGameObject): void {
    if (!this.isDamageActive || this.#hitEnemies.has(enemy)) return;
    this.#hitEnemies.add(enemy);
    enemy.hit('DOWN', this.baseDamage);
  }

  public destroy(fromScene?: boolean): void {
    this.#startupTimer?.destroy();
    this.#loopTimer?.destroy();
    this.#startupSprite?.destroy();
    this.#hitEnemies.clear();
    super.destroy(fromScene);
  }

  #startRise(): void {
    if (!this.active) return;
    this.#phase = 'rise';
    this.setVisible(true);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = true;

    this.play(`${ASSET_KEYS.WATER_SPIKE}_RISE`);
    this.once(`animationcomplete-${ASSET_KEYS.WATER_SPIKE}_RISE`, () => {
      if (this.active) this.#startLoop();
    });
  }

  #startLoop(): void {
    if (!this.active) return;
    this.#phase = 'loop';
    this.play(`${ASSET_KEYS.WATER_SPIKE}_LOOP`);

    this.#loopTimer = this.scene.time.delayedCall(WATER_SPIKE_LOOP_DURATION, () => {
      if (this.active) this.#startFade();
    });
  }

  #startFade(): void {
    if (!this.active) return;
    this.#phase = 'fade';
    this.#hitEnemies.clear();

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;

    this.play(`${ASSET_KEYS.WATER_SPIKE}_FADE`);
    this.once(`animationcomplete-${ASSET_KEYS.WATER_SPIKE}_FADE`, () => {
      this.destroy();
    });
  }
}

import { registerSpell } from './spell-registry';
registerSpell(SPELL_ID.WATER_SPIKE, (scene, _x, _y, tx, ty) => new WaterSpike(scene, tx, ty));
