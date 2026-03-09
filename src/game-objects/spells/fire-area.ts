import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import {
  FIRE_AREA_DAMAGE_PER_TICK,
  FIRE_AREA_MANA_COST,
  FIRE_AREA_COOLDOWN,
  FIRE_AREA_DURATION,
  FIRE_AREA_TICK_INTERVAL,
} from '../../common/config';
import { CharacterGameObject } from '../common/character-game-object';
import { DIRECTION } from '../../common/common';

export class FireArea extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.FIRE;
  readonly spellId: SpellId = SPELL_ID.FIRE_AREA;
  readonly spellType: SpellType = SPELL_TYPE.AREA;
  readonly baseDamage: number = FIRE_AREA_DAMAGE_PER_TICK;
  readonly manaCost: number = FIRE_AREA_MANA_COST;
  readonly cooldown: number = FIRE_AREA_COOLDOWN;
  #tickTimer: Phaser.Time.TimerEvent | undefined;
  #durationTimer: Phaser.Time.TimerEvent | undefined;
  #enemiesInArea: Set<CharacterGameObject>;
  #isEnding: boolean = false;
  #boltsInsideCount: number = 0;
  #comboPulseTween: Phaser.Tweens.Tween | undefined;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, ASSET_KEYS.FIRE_AREA_EXPLOSION);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(3);
    this.#enemiesInArea = new Set();

    // set physics body as a circle for area-of-effect
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(32, 32);
    body.setImmovable(true);
    body.setAllowGravity(false);

    // Start animation sequence: play initial explosion
    this.play(`${ASSET_KEYS.FIRE_AREA_EXPLOSION}_START`);
    
    // When start animation completes, play the looping fire animation
    this.once('animationcomplete', () => {
      if (!this.#isEnding) {
        this.play(`${ASSET_KEYS.FIRE_AREA_EXPLOSION}_LOOP`);
      }
    });

    // set up tick damage
    this.#tickTimer = scene.time.addEvent({
      delay: FIRE_AREA_TICK_INTERVAL,
      callback: this.#applyTickDamage,
      callbackScope: this,
      loop: true,
    });

    // Play end animation before destruction
    this.#durationTimer = scene.time.delayedCall(FIRE_AREA_DURATION, () => {
      this.#playEndAnimation();
    });
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  public addEnemyInArea(enemy: CharacterGameObject): void {
    this.#enemiesInArea.add(enemy);
  }

  public removeEnemyFromArea(enemy: CharacterGameObject): void {
    this.#enemiesInArea.delete(enemy);
  }

  public onFireBoltEnter(): void {
    this.#boltsInsideCount += 1;
    if (this.#boltsInsideCount > 1) {
      return;
    }

    this.setTint(0xffd27f);
    this.#comboPulseTween = this.scene.tweens.add({
      targets: this,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 90,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  public onFireBoltExit(): void {
    this.#boltsInsideCount = Math.max(0, this.#boltsInsideCount - 1);
    if (this.#boltsInsideCount > 0) {
      return;
    }

    this.#comboPulseTween?.stop();
    this.#comboPulseTween = undefined;
    this.clearTint();
    this.setScale(1);
  }

  #applyTickDamage(): void {
    for (const enemy of this.#enemiesInArea) {
      if (enemy.active && !enemy.isDefeated) {
        enemy.hit(DIRECTION.DOWN, this.baseDamage);
      }
    }
  }

  #playEndAnimation(): void {
    this.#isEnding = true;
    this.#tickTimer?.destroy();
    
    // Stop current animation and play the ending fade animation
    this.stop();
    this.play(`${ASSET_KEYS.FIRE_AREA_EXPLOSION}_END`);
    
    // Destroy after end animation completes
    this.once('animationcomplete', () => {
      this.destroy();
    });
  }

  public destroy(fromScene?: boolean): void {
    this.#tickTimer?.destroy();
    this.#durationTimer?.destroy();
    this.#comboPulseTween?.stop();
    this.#enemiesInArea.clear();
    super.destroy(fromScene);
  }
}
