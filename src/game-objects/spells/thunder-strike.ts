import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import {
  THUNDER_STRIKE_BODY_RADIUS,
  THUNDER_STRIKE_LOOP_DURATION,
  THUNDER_STRIKE_MANA_COST,
  THUNDER_STRIKE_COOLDOWN,
} from '../../common/config';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import type { CharacterGameObject } from '../common/character-game-object';
import { registerSpell } from './spell-registry';

export class ThunderStrike extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.THUNDER;
  readonly spellId: SpellId = SPELL_ID.THUNDER_STRIKE;
  readonly spellType: SpellType = SPELL_TYPE.AREA;
  readonly manaCost: number = THUNDER_STRIKE_MANA_COST;
  readonly cooldown: number = THUNDER_STRIKE_COOLDOWN;

  #loopTimer: Phaser.Time.TimerEvent | undefined;
  #hitEnemies: Set<CharacterGameObject> = new Set();
  #damageActive: boolean = false;

  get baseDamage(): number {
    return RUNTIME_CONFIG.THUNDER_STRIKE_DAMAGE;
  }

  get isDamageActive(): boolean {
    return this.#damageActive;
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, ASSET_KEYS.THUNDER_STRIKE);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(3);

    // Body starts disabled — activated after the strike animation completes
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(
      THUNDER_STRIKE_BODY_RADIUS,
      32 - THUNDER_STRIKE_BODY_RADIUS, // offset so circle centres on sprite
      32 - THUNDER_STRIKE_BODY_RADIUS,
    );
    body.setImmovable(true);
    body.setAllowGravity(false);
    body.enable = false;

    // Phase 1: play strike-down animation; on complete → activate body
    this.play(ASSET_KEYS.THUNDER_STRIKE);
    this.once(`animationcomplete-${ASSET_KEYS.THUNDER_STRIKE}`, () => {
      if (!this.active) return;
      this.#activateBody();
    });
  }

  /** Called in the overlap callback for each enemy. Damages each enemy only once per activation. */
  public hitEnemy(enemy: CharacterGameObject): void {
    if (!this.#damageActive || this.#hitEnemies.has(enemy)) return;
    this.#hitEnemies.add(enemy);
    enemy.hit('DOWN', this.baseDamage);
  }

  public destroy(fromScene?: boolean): void {
    this.#loopTimer?.destroy();
    this.#hitEnemies.clear();
    super.destroy(fromScene);
  }

  #activateBody(): void {
    if (!this.active) return;
    this.#damageActive = true;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = true;

    // Phase 2: body active for THUNDER_STRIKE_LOOP_DURATION ms, then splash
    this.#loopTimer = this.scene.time.delayedCall(RUNTIME_CONFIG.THUNDER_STRIKE_LOOP_DURATION, () => {
      if (!this.active) return;
      this.#startSplash();
    });
  }

  #startSplash(): void {
    if (!this.active) return;
    this.#damageActive = false;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;

    // Resize sprite display to match the smaller splash frame (48×48) to avoid visual shift
    this.setDisplaySize(48, 48);
    this.play(ASSET_KEYS.THUNDER_SPLASH);
    this.once(`animationcomplete-${ASSET_KEYS.THUNDER_SPLASH}`, () => {
      this.destroy();
    });
  }
}

// Side-effect: register factory (casterX/Y ignored — spell lands at target position)
registerSpell(SPELL_ID.THUNDER_STRIKE, (scene, _cx, _cy, tx, ty) => new ThunderStrike(scene, tx, ty));
