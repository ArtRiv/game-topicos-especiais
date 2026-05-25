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
    // The steam animation is drawn in the bottom portion of the frame on
    // early frames (tiny puff at bottom-center, rising/expanding upward
    // through the sheet). With the default 0.5/0.5 origin the early puff
    // ends up *below* the spawn point — visually wrong for "steam rising off
    // a surface" and the cause of puffs appearing below the lava when the
    // spawn was near the lava's lower edge. Anchor to bottom-center so the
    // puff's base sits at (x, y) and the steam rises above it.
    this.setOrigin(0.5, 1);

    const r = STEAM_BURST_BODY_RADIUS;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(r);
    // Body offset is in source-texture pixel coordinates, independent of the
    // sprite's display origin. Center the damage circle in the frame so the
    // hitbox covers the puff while the animation is mid-life (most damaging
    // window) regardless of which origin the sprite uses to render.
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
