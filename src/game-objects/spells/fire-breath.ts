import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import {
  FIRE_BREATH_DAMAGE_PER_TICK,
  FIRE_BREATH_MANA_PER_TICK,
  FIRE_BREATH_MANA_DRAIN_INTERVAL,
  FIRE_BREATH_MAX_REACH,
  FIRE_BREATH_STEP_SIZE,
  FIRE_BREATH_ANGLE_TOLERANCE,
} from '../../common/config';
import { ManaComponent } from '../../components/game-object/mana-component';

export class FireBreath extends Phaser.GameObjects.Container implements ActiveSpell {
  readonly element: Element = ELEMENT.FIRE;
  readonly spellId: SpellId = SPELL_ID.FIRE_BREATH;
  readonly spellType: SpellType = SPELL_TYPE.CHANNELED;
  readonly baseDamage: number = FIRE_BREATH_DAMAGE_PER_TICK;
  readonly manaCost: number = FIRE_BREATH_MANA_PER_TICK;
  readonly cooldown: number = 0;

  #beamSprite: Phaser.GameObjects.Sprite;
  #hitEffectSprite: Phaser.GameObjects.Sprite;
  #angle: number = 0;
  #wallDistance: number = FIRE_BREATH_MAX_REACH;
  #isEnding: boolean = false;
  #phase: 'start' | 'loop' | 'end' = 'start';
  #collisionLayer: Phaser.Tilemaps.TilemapLayer;
  #manaTimer: Phaser.Time.TimerEvent;

  constructor(
    scene: Phaser.Scene,
    playerX: number,
    playerY: number,
    targetX: number,
    targetY: number,
    collisionLayer: Phaser.Tilemaps.TilemapLayer,
    manaComponent: ManaComponent,
  ) {
    super(scene, playerX, playerY);
    scene.add.existing(this);
    this.#collisionLayer = collisionLayer;
    this.setDepth(4);

    this.#angle = Phaser.Math.Angle.Between(playerX, playerY, targetX, targetY);
    this.setRotation(this.#angle);

    // Beam sprite: origin at left edge so it extends rightward from player
    this.#beamSprite = new Phaser.GameObjects.Sprite(scene, 0, 0, ASSET_KEYS.FIRE_BREATH_BEAM);
    this.#beamSprite.setOrigin(0, 0.5);

    // Hit effect: at the wall contact point (positioned at max reach initially)
    this.#hitEffectSprite = new Phaser.GameObjects.Sprite(scene, FIRE_BREATH_MAX_REACH, 0, ASSET_KEYS.FIRE_BREATH_HIT);
    this.#hitEffectSprite.setOrigin(0.5, 0.5);
    this.#hitEffectSprite.setVisible(false);

    this.add([this.#beamSprite, this.#hitEffectSprite]);

    // Play startup animation, then transition to loop
    this.#beamSprite.play(`${ASSET_KEYS.FIRE_BREATH_BEAM}_START`);
    this.#beamSprite.once('animationcomplete', () => {
      if (!this.#isEnding) {
        this.#phase = 'loop';
        this.#beamSprite.play(`${ASSET_KEYS.FIRE_BREATH_BEAM}_LOOP`);
        this.#hitEffectSprite.setVisible(true);
        this.#hitEffectSprite.play(ASSET_KEYS.FIRE_BREATH_HIT);
      }
    });

    // Drain mana on interval; end breath if mana runs out
    this.#manaTimer = scene.time.addEvent({
      delay: FIRE_BREATH_MANA_DRAIN_INTERVAL,
      callback: () => {
        if (this.#isEnding) return;
        const drained = manaComponent.consume(FIRE_BREATH_MANA_PER_TICK);
        if (!drained) {
          this.beginEnding();
        }
      },
      loop: true,
    });
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  get isEnding(): boolean {
    return this.#isEnding;
  }

  /** Current calculated distance to the nearest wall (pixels). */
  get wallDistance(): number {
    return this.#wallDistance;
  }

  /** Current aim angle in radians. */
  get aimAngle(): number {
    return this.#angle;
  }

  /** Called each frame while the player holds the key. Updates position and aim. */
  public update(playerX: number, playerY: number, targetX: number, targetY: number): void {
    if (this.#isEnding || !this.active) return;

    this.setPosition(playerX, playerY);
    this.#angle = Phaser.Math.Angle.Between(playerX, playerY, targetX, targetY);
    this.setRotation(this.#angle);

    // Only recalculate and scale during the loop (active) phase
    if (this.#phase === 'loop') {
      this.#wallDistance = this.#calculateWallDistance();
      this.#beamSprite.setDisplaySize(this.#wallDistance, 48);
      this.#hitEffectSprite.setPosition(this.#wallDistance, 0);
    }
  }

  /** Returns true if the enemy position is within the active breath cone. */
  public isEnemyInBreath(enemyX: number, enemyY: number): boolean {
    if (this.#phase !== 'loop' || this.#isEnding) return false;

    const dx = enemyX - this.x;
    const dy = enemyY - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > this.#wallDistance + 16) return false; // +16 tolerance

    const enemyAngle = Math.atan2(dy, dx);
    const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - this.#angle));
    return angleDiff < FIRE_BREATH_ANGLE_TOLERANCE;
  }

  /** Stops active beam and plays the end animation before destroying. */
  public beginEnding(): void {
    if (this.#isEnding) return;
    this.#isEnding = true;
    this.#phase = 'end';
    this.#manaTimer.destroy();
    this.#hitEffectSprite.setVisible(false);

    this.#beamSprite.stop();
    this.#beamSprite.play(`${ASSET_KEYS.FIRE_BREATH_BEAM}_END`);
    this.#beamSprite.once('animationcomplete', () => {
      this.destroy();
    });
  }

  public destroy(fromScene?: boolean): void {
    this.#manaTimer?.destroy();
    super.destroy(fromScene);
  }

  #calculateWallDistance(): number {
    const cosA = Math.cos(this.#angle);
    const sinA = Math.sin(this.#angle);
    const steps = Math.ceil(FIRE_BREATH_MAX_REACH / FIRE_BREATH_STEP_SIZE);

    for (let i = 1; i <= steps; i++) {
      const px = this.x + cosA * (i * FIRE_BREATH_STEP_SIZE);
      const py = this.y + sinA * (i * FIRE_BREATH_STEP_SIZE);
      const tile = this.#collisionLayer.getTileAtWorldXY(px, py);
      if (tile !== null && tile.collides) {
        return Math.max(16, (i - 1) * FIRE_BREATH_STEP_SIZE);
      }
    }

    return FIRE_BREATH_MAX_REACH;
  }
}
