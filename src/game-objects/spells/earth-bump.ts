import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE, DIRECTION } from '../../common/common';
import { Direction } from '../../common/types';
import {
  EARTH_BUMP_MANA_COST,
  EARTH_BUMP_COOLDOWN,
  EARTH_BUMP_DURATION,
  EARTH_BUMP_BODY_RADIUS,
  EARTH_BUMP_CURSOR_Y_OFFSET,
} from '../../common/config';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { CharacterGameObject } from '../common/character-game-object';

type EarthBumpPhase = 'startup' | 'loop' | 'end';

export class EarthBump extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.EARTH;
  readonly spellId: SpellId = SPELL_ID.EARTH_BUMP;
  readonly spellType: SpellType = SPELL_TYPE.AREA; // area/cone type
  readonly manaCost: number = EARTH_BUMP_MANA_COST;
  readonly cooldown: number = EARTH_BUMP_COOLDOWN;

  #phase: EarthBumpPhase = 'startup';
  #durationTimer: Phaser.Time.TimerEvent | undefined;
  #hitEnemies: Set<CharacterGameObject> = new Set();
  #isDying: boolean = false;
  #direction: Direction;
  #damageMult: number = 1;
  #knockbackMult: number = 1;

  get baseDamage(): number {
    return Math.max(1, Math.round(RUNTIME_CONFIG.EARTH_BUMP_DAMAGE * this.#damageMult));
  }

  get knockbackForce(): number {
    return RUNTIME_CONFIG.EARTH_BUMP_KNOCKBACK_FORCE * this.#knockbackMult;
  }

  get knockbackDuration(): number {
    return RUNTIME_CONFIG.EARTH_BUMP_KNOCKBACK_DURATION;
  }

  /** Exposed for cross-player knockback in GameScene's overlap-A handler. */
  get direction(): Direction {
    return this.#direction;
  }

  get isDamageActive(): boolean {
    return (this.#phase === 'startup' || this.#phase === 'loop') && !this.#isDying;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, direction: Direction, caster?: { spellModifiers?: { earthBumpDamageMult?: number; earthBumpKnockbackMult?: number } }) {
    super(scene, x, y - EARTH_BUMP_CURSOR_Y_OFFSET, ASSET_KEYS.EARTH_BUMP);
    this.#damageMult = caster?.spellModifiers?.earthBumpDamageMult ?? 1;
    this.#knockbackMult = caster?.spellModifiers?.earthBumpKnockbackMult ?? 1;
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.#direction = direction;
    if (this.#direction === DIRECTION.LEFT) {
      this.setFlipX(true);
    }

    // Slight offset depending on direction can be applied later if needed
    // Current setup spawns it directly on target X/Y

    this.setDepth(3);

    const body = this.body as Phaser.Physics.Arcade.Body;
    const radius = EARTH_BUMP_BODY_RADIUS;
    body.setCircle(radius, 24 - radius, 24 - radius);
    body.setImmovable(true);
    body.setAllowGravity(false);
    body.enable = false;

    this.#startStartup();
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  public hitEnemy(enemy: CharacterGameObject): void {
    if (!this.isDamageActive || this.#hitEnemies.has(enemy) || this.#isDying) return;
    this.#hitEnemies.add(enemy);

    // Apply basic hit damage
    enemy.hit(this.#direction, this.baseDamage);

    // Apply knockback along the REAL line from the bump's center to the target,
    // not the 4-way cast direction. The old cardinal-only push made a target
    // that was up-and-to-the-right of the bump fly straight up (or sideways),
    // which read as "the knockback goes the wrong way". Radial-from-bump matches
    // the visual: the ground heaves and shoves whatever's standing on it outward.
    // Order matters: hit() may transition to HurtState, which sets its own
    // pushback velocity; applying knockback AFTER it overrides with the larger
    // force so the user sees the bump as a launch rather than a tap.
    const nx = enemy.x - this.x;
    const ny = enemy.y - this.y;
    if (Math.hypot(nx, ny) < 1e-4) {
      // Target is dead-center on the bump — fall back to the cast direction so
      // there's still a definite launch vector.
      enemy.applyKnockback(this.#direction, this.knockbackForce, this.knockbackDuration);
    } else {
      enemy.applyKnockbackVector(nx, ny, this.knockbackForce, this.knockbackDuration);
    }
  }

  #startStartup(): void {
    this.#phase = 'startup';

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = true; // start hitting early during rise

    this.play(`${ASSET_KEYS.EARTH_BUMP}_STARTUP`);
    this.once(`animationcomplete-${ASSET_KEYS.EARTH_BUMP}_STARTUP`, () => {
      if (this.active) this.#startLoop();
    });
  }

  #startLoop(): void {
    if (!this.active) return;
    this.#phase = 'loop';
    this.play(`${ASSET_KEYS.EARTH_BUMP}_LOOP`);

    this.#durationTimer = this.scene.time.delayedCall(RUNTIME_CONFIG.EARTH_BUMP_DURATION, () => {
      if (this.active) this.#startFade();
    });
  }

  #startFade(): void {
    if (!this.active || this.#isDying) return;
    this.#isDying = true;
    this.#phase = 'end';

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;

    this.play(`${ASSET_KEYS.EARTH_BUMP}_END`);
    this.once(`animationcomplete-${ASSET_KEYS.EARTH_BUMP}_END`, () => {
      this.destroy();
    });
  }

  public destroy(fromScene?: boolean): void {
    this.#durationTimer?.destroy();
    this.#hitEnemies.clear();
    super.destroy(fromScene);
  }
}

import { registerSpell } from './spell-registry';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
registerSpell(SPELL_ID.EARTH_BUMP, (scene, _x, _y, tx, ty, dir, caster) => new EarthBump(scene, tx, ty, dir, caster as any));
