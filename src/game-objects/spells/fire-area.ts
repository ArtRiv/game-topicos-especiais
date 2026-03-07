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

    // play fire area animation
    this.play(ASSET_KEYS.FIRE_AREA_EXPLOSION);

    // set up tick damage
    this.#tickTimer = scene.time.addEvent({
      delay: FIRE_AREA_TICK_INTERVAL,
      callback: this.#applyTickDamage,
      callbackScope: this,
      loop: true,
    });

    // auto destroy after duration
    this.#durationTimer = scene.time.delayedCall(FIRE_AREA_DURATION, () => {
      this.destroy();
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

  #applyTickDamage(): void {
    for (const enemy of this.#enemiesInArea) {
      if (enemy.active && !enemy.isDefeated) {
        enemy.hit(DIRECTION.DOWN, this.baseDamage);
      }
    }
  }

  public destroy(fromScene?: boolean): void {
    this.#tickTimer?.destroy();
    this.#durationTimer?.destroy();
    this.#enemiesInArea.clear();
    super.destroy(fromScene);
  }
}
