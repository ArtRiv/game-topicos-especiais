import * as Phaser from 'phaser';
import { ASSET_KEYS } from '../../common/assets';
import { DIRECTION } from '../../common/common';
import type { CharacterGameObject } from '../common/character-game-object';

/**
 * Steam puff spawned when a fire spell collides with a water spell. Single-play VFX
 * with a small AoE damage window — meant to be a chip-damage combo, not a heavy hit
 * (the value of the combo is consuming the opponent's fire spell while keeping your
 * water spell alive). Skips FireBreath by design — that combo is reserved for later.
 */
const STEAM_BURST_BODY_RADIUS = 18;
const STEAM_BURST_DAMAGE = 1;

export class SteamBurst extends Phaser.Physics.Arcade.Sprite {
  #hitEnemies: Set<CharacterGameObject> = new Set();
  #damageActive: boolean = true;

  get baseDamage(): number {
    return STEAM_BURST_DAMAGE;
  }

  get isDamageActive(): boolean {
    return this.#damageActive;
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, `${ASSET_KEYS.STEAM_BURST}_0`);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(5);

    const r = STEAM_BURST_BODY_RADIUS;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(r);
    body.setOffset((this.width - r * 2) / 2, (this.height - r * 2) / 2);
    body.setImmovable(true);
    body.setAllowGravity(false);

    this.play(ASSET_KEYS.STEAM_BURST);
    this.once(`animationcomplete-${ASSET_KEYS.STEAM_BURST}`, () => {
      this.#damageActive = false;
      this.destroy();
    });
  }

  public hitEnemy(enemy: CharacterGameObject): void {
    if (!this.#damageActive || this.#hitEnemies.has(enemy) || enemy.isDefeated) return;
    this.#hitEnemies.add(enemy);
    enemy.hit(DIRECTION.DOWN, this.baseDamage);
  }
}
