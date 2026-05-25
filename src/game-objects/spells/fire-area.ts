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
  FIRE_BREATH_FIRE_AREA_AREA_SCALE,
} from '../../common/config';
import { CharacterGameObject } from '../common/character-game-object';
import { DIRECTION } from '../../common/common';
import type { Player } from '../player/player';
import type { GameScene } from '../../scenes/game-scene';

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
  #breathActive: boolean = false;
  // Self-only silhouette shown above the flames while the local player is inside,
  // so the user can still see roughly where they are. Each client renders its own.
  #playerGhost: Phaser.GameObjects.Sprite | undefined;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, ASSET_KEYS.FIRE_AREA_EXPLOSION);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Y-based depth: characters use `depth = this.y` (see CharacterGameObject.update),
    // so any character whose center Y is less than the spell's depth renders BEHIND.
    // Using `y + 16` (≈ body half-height) ensures every character physically overlapping
    // the 32×32 fire area is hidden by the flames — they're standing IN the fire.
    this.setDepth(y + 16);
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
    if (this.#boltsInsideCount > 1 || this.#breathActive) {
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
    if (this.#boltsInsideCount > 0 || this.#breathActive) {
      return;
    }

    this.#comboPulseTween?.stop();
    this.#comboPulseTween = undefined;
    this.clearTint();
    this.setScale(1);
  }

  public onFireBreathEnter(): void {
    if (this.#breathActive || this.#isEnding) return;
    this.#breathActive = true;

    // Breath combo overrides bolt visuals
    this.#comboPulseTween?.stop();
    this.#comboPulseTween = undefined;

    this.setTint(0xffd27f);
    this.setScale(FIRE_BREATH_FIRE_AREA_AREA_SCALE);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(32 * FIRE_BREATH_FIRE_AREA_AREA_SCALE, 32 * FIRE_BREATH_FIRE_AREA_AREA_SCALE, true);
    // Keep depth proportional to the grown body so players inside the bigger area stay hidden.
    this.setDepth(this.y + 16 * FIRE_BREATH_FIRE_AREA_AREA_SCALE);
  }

  public onFireBreathExit(): void {
    if (!this.#breathActive) return;
    this.#breathActive = false;

    this.clearTint();
    this.setScale(1);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(32, 32, true);
    this.setDepth(this.y + 16);

    // Restore bolt combo visuals if a bolt is still inside
    if (this.#boltsInsideCount > 0) {
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
  }

  public preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (this.#isEnding) {
      this.#playerGhost?.setVisible(false);
      return;
    }
    const scene = this.scene as GameScene;
    const player = scene.player;
    if (!player?.active) {
      this.#playerGhost?.setVisible(false);
      return;
    }
    const body = this.body as Phaser.Physics.Arcade.Body;
    const r = body.halfWidth; // square 32×body.width, scales with breath combo
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    if (dx * dx + dy * dy > r * r) {
      this.#playerGhost?.setVisible(false);
      return;
    }
    if (!this.#playerGhost || !this.#playerGhost.scene) {
      this.#playerGhost = this.scene.add.sprite(player.x, player.y, player.texture.key);
      this.#playerGhost.setTint(0xffb066);
      this.#playerGhost.setAlpha(0.55);
    }
    const g = this.#playerGhost;
    g.setTexture(player.texture.key, player.frame.name);
    g.setPosition(player.x, player.y);
    g.setFlipX(player.flipX);
    g.setOrigin(player.originX, player.originY);
    g.setScale(player.scaleX, player.scaleY);
    g.setDepth(this.depth + 1);
    g.setVisible(true);
  }

  #applyTickDamage(): void {
    for (const enemy of this.#enemiesInArea) {
      if (enemy.active && !enemy.isDefeated) {
        enemy.hit(DIRECTION.DOWN, this.baseDamage);
      }
    }
  }

  /** Combo extinguish: play START (if still in it) → END, no LOOP. Stops damage
   *  immediately. Idempotent — safe to call multiple times. Used by the VoidOrb
   *  combo (and any other counter that wants the user to *see* the fire appear and
   *  die rather than just vanish). */
  public extinguish(): void {
    if (this.#isEnding) return;
    // Kill damage immediately — the fire is being countered, not consumed.
    this.#tickTimer?.destroy();
    this.#tickTimer = undefined;
    this.#durationTimer?.destroy();
    this.#durationTimer = undefined;

    const currentAnim = this.anims.currentAnim?.key;
    const startKey = `${ASSET_KEYS.FIRE_AREA_EXPLOSION}_START`;

    const goToEnd = (): void => this.#playEndAnimation();

    if (currentAnim === startKey && this.anims.isPlaying) {
      // Still in the START flourish — let it finish naturally, then play END.
      // Remove any pre-existing animationcomplete handler (the one that would queue LOOP).
      this.off('animationcomplete');
      this.once('animationcomplete', goToEnd);
    } else {
      // Already in LOOP (or anim finished) — skip straight to END.
      goToEnd();
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
    this.#playerGhost?.destroy();
    this.#playerGhost = undefined;
    this.#enemiesInArea.clear();
    super.destroy(fromScene);
  }
}

import { registerSpell } from './spell-registry';
registerSpell(SPELL_ID.FIRE_AREA, (scene, _x, _y, tx, ty) => new FireArea(scene, tx, ty));
