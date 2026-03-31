import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Direction, Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { DIRECTION, ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import {
  FIRE_BREATH_BEAM_CONTACT_OVERLAP,
  FIRE_BREATH_DAMAGE_PER_TICK,
  FIRE_BREATH_MANA_PER_TICK,
  FIRE_BREATH_MANA_DRAIN_INTERVAL,
  FIRE_BREATH_MAX_REACH,
  FIRE_BREATH_STEP_SIZE,
  FIRE_BREATH_ANGLE_TOLERANCE,
  FIRE_BREATH_HIT_SURFACE_OFFSET,
  FIRE_BREATH_MOUTH_FORWARD_OFFSET,
  FIRE_BREATH_MOUTH_VERTICAL_OFFSET,
  FIRE_BREATH_TURN_SPEED,
  FIRE_BREATH_MAX_DEVIATION,
  FIRE_BREATH_FIRE_AREA_DAMAGE_MULTIPLIER,
  FIRE_BREATH_FIRE_AREA_BEAM_HEIGHT,
  FIRE_BREATH_FIRE_AREA_REACH_MULTIPLIER,
  FIRE_BREATH_FIRE_AREA_ANGLE_TOLERANCE,
} from '../../common/config';
import { ManaComponent } from '../../components/game-object/mana-component';

type FireBreathImpact = {
  distance: number;
  point: Phaser.Math.Vector2;
  normal: Phaser.Math.Vector2;
};

export class FireBreath extends Phaser.GameObjects.Container implements ActiveSpell {
  readonly element: Element = ELEMENT.FIRE;
  readonly spellId: SpellId = SPELL_ID.FIRE_BREATH;
  readonly spellType: SpellType = SPELL_TYPE.CHANNELED;
  readonly manaCost: number = FIRE_BREATH_MANA_PER_TICK;
  readonly cooldown: number = 0;

  get baseDamage(): number {
    return this.#comboActive
      ? FIRE_BREATH_DAMAGE_PER_TICK * FIRE_BREATH_FIRE_AREA_DAMAGE_MULTIPLIER
      : FIRE_BREATH_DAMAGE_PER_TICK;
  }

  #beamSprite: Phaser.GameObjects.Sprite;
  #hitEffectSprite: Phaser.GameObjects.Sprite;
  #angle: number = 0;
  #initialAngle: number = 0;
  #wallDistance: number = FIRE_BREATH_MAX_REACH;
  #isEnding: boolean = false;
  #phase: 'start' | 'loop' | 'end' = 'start';
  #collisionLayer: Phaser.Tilemaps.TilemapLayer;
  #blockingGroup: Phaser.GameObjects.Group;
  #manaTimer: Phaser.Time.TimerEvent;
  #impact: FireBreathImpact | undefined;
  #facingDirection: Direction = DIRECTION.RIGHT;
  #comboActive: boolean = false;

  constructor(
    scene: Phaser.Scene,
    playerX: number,
    playerY: number,
    targetX: number,
    targetY: number,
    collisionLayer: Phaser.Tilemaps.TilemapLayer,
    blockingGroup: Phaser.GameObjects.Group,
    manaComponent?: ManaComponent,
  ) {
    super(scene, playerX, playerY);
    scene.add.existing(this);
    this.#collisionLayer = collisionLayer;
    this.#blockingGroup = blockingGroup;
    this.setDepth(1);

    this.#angle = Phaser.Math.Angle.Between(playerX, playerY, targetX, targetY);
    this.#initialAngle = this.#angle;
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
        this.#hitEffectSprite.play(ASSET_KEYS.FIRE_BREATH_HIT);
        this.#syncImpactVisuals();
      }
    });

    // Drain mana on interval; end breath if mana runs out (skipped for remote/visual-only breaths)
    this.#manaTimer = scene.time.addEvent({
      delay: FIRE_BREATH_MANA_DRAIN_INTERVAL,
      callback: () => {
        if (this.#isEnding || !manaComponent) return;
        const drained = manaComponent.consume(FIRE_BREATH_MANA_PER_TICK);
        if (!drained) {
          this.beginEnding();
        }
      },
      loop: true,
    });

    this.#syncTransform(playerX, playerY, targetX, targetY, true);
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

  get facingDirection(): Direction {
    return this.#facingDirection;
  }

  /** Activates or deactivates the FireArea combo, boosting damage, reach, and beam width. */
  public setComboActive(active: boolean): void {
    if (this.#comboActive === active) return;
    this.#comboActive = active;
    if (active) {
      this.#beamSprite.setTint(0xffd27f);
      this.#hitEffectSprite.setTint(0xffd27f);
    } else {
      this.#beamSprite.clearTint();
      this.#hitEffectSprite.clearTint();
    }
  }

  /** Returns true if a fire area centered at (areaX, areaY) is within the active breath beam. */
  public isAreaInBreath(areaX: number, areaY: number): boolean {
    if (this.#phase !== 'loop' || this.#isEnding) return false;

    const dx = areaX - this.x;
    const dy = areaY - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > FIRE_BREATH_MAX_REACH + 20) return false; // +20 for area half-size buffer

    const areaAngle = Math.atan2(dy, dx);
    const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(areaAngle - this.#angle));
    return angleDiff < FIRE_BREATH_FIRE_AREA_ANGLE_TOLERANCE;
  }

  /** Called each frame while the player holds the key. Updates position and aim. */
  public update(playerX: number, playerY: number, targetX: number, targetY: number): void {
    if (this.#isEnding || !this.active) return;

    this.#syncTransform(playerX, playerY, targetX, targetY);
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

  #syncTransform(playerX: number, playerY: number, targetX: number, targetY: number, snapToTarget: boolean = false): void {
    const rawTargetAngle = Phaser.Math.Angle.Between(playerX, playerY, targetX, targetY);
    if (snapToTarget) {
      this.#angle = rawTargetAngle;
    } else {
      // Clamp the target angle so it cannot deviate more than MAX_DEVIATION from the initial cast angle
      const diff = Phaser.Math.Angle.Wrap(rawTargetAngle - this.#initialAngle);
      let clampedTarget: number;
      if (diff > FIRE_BREATH_MAX_DEVIATION) {
        clampedTarget = Phaser.Math.Angle.Wrap(this.#initialAngle + FIRE_BREATH_MAX_DEVIATION);
      } else if (diff < -FIRE_BREATH_MAX_DEVIATION) {
        clampedTarget = Phaser.Math.Angle.Wrap(this.#initialAngle - FIRE_BREATH_MAX_DEVIATION);
      } else {
        clampedTarget = rawTargetAngle;
      }
      const deltaSeconds = this.scene.game.loop.delta / 1000;
      const maxTurn = FIRE_BREATH_TURN_SPEED * deltaSeconds;
      this.#angle = Phaser.Math.Angle.RotateTo(this.#angle, clampedTarget, maxTurn);
    }

    this.#facingDirection = this.#getFacingDirection(this.#angle);
    this.#beamSprite.setFlipY(this.#facingDirection === DIRECTION.LEFT);

    const sourcePosition = this.#getSourcePosition(playerX, playerY, this.#angle, this.#facingDirection);
    this.setPosition(sourcePosition.x, sourcePosition.y);
    this.setRotation(this.#angle);

    this.#impact = this.#calculateImpact(sourcePosition);
    const comboMaxReach = FIRE_BREATH_MAX_REACH * (this.#comboActive ? FIRE_BREATH_FIRE_AREA_REACH_MULTIPLIER : 1);
    this.#wallDistance = this.#impact?.distance ?? comboMaxReach;
    const beamVisualLength = this.#impact === undefined
      ? comboMaxReach
      : Math.min(comboMaxReach, this.#wallDistance + FIRE_BREATH_BEAM_CONTACT_OVERLAP);
    const beamHeight = this.#comboActive ? FIRE_BREATH_FIRE_AREA_BEAM_HEIGHT : 48;
    this.#beamSprite.setDisplaySize(Math.max(beamVisualLength, 1), beamHeight);
    this.#syncImpactVisuals();
  }

  #syncImpactVisuals(): void {
    if (this.#phase !== 'loop' || this.#impact === undefined) {
      this.#hitEffectSprite.setVisible(false);
      return;
    }

    const hitWorldPosition = this.#impact.point.clone().add(this.#impact.normal.clone().scale(FIRE_BREATH_HIT_SURFACE_OFFSET));
    const hitLocalPosition = hitWorldPosition.subtract(new Phaser.Math.Vector2(this.x, this.y)).rotate(-this.rotation);
    const tangentAngle = Math.atan2(this.#impact.normal.x, -this.#impact.normal.y);
    const hitEffectWorldRotation = tangentAngle - Math.PI / 2;

    this.#hitEffectSprite
      .setVisible(true)
      .setPosition(hitLocalPosition.x, hitLocalPosition.y)
      .setRotation(hitEffectWorldRotation - this.rotation);
  }

  #getSourcePosition(
    playerX: number,
    playerY: number,
    angle: number,
    facingDirection: Direction,
  ): Phaser.Math.Vector2 {
    const mouthAnchor = new Phaser.Math.Vector2(playerX, playerY - FIRE_BREATH_MOUTH_VERTICAL_OFFSET);

    if (facingDirection === DIRECTION.RIGHT) {
      mouthAnchor.x += 6;
      mouthAnchor.y -= 1;
    } else if (facingDirection === DIRECTION.LEFT) {
      mouthAnchor.x -= 6;
      mouthAnchor.y -= 1;
    } else if (facingDirection === DIRECTION.UP) {
      mouthAnchor.y -= -12; // align with top of 16x16 sprite (head area)
      mouthAnchor.x += -12
    } else {
      mouthAnchor.y += 15; // align with bottom of 16x16 sprite (feet area)
      mouthAnchor.x += 12;
    }

    mouthAnchor.x += Math.cos(angle) * FIRE_BREATH_MOUTH_FORWARD_OFFSET;
    mouthAnchor.y += Math.sin(angle) * FIRE_BREATH_MOUTH_FORWARD_OFFSET;

    return mouthAnchor;
  }

  #getFacingDirection(angle: number): Direction {
    const normalizedAngle = Phaser.Math.Angle.Wrap(angle);

    if (normalizedAngle >= -Math.PI / 4 && normalizedAngle < Math.PI / 4) {
      return DIRECTION.RIGHT;
    }
    if (normalizedAngle >= Math.PI / 4 && normalizedAngle < (3 * Math.PI) / 4) {
      return DIRECTION.DOWN;
    }
    if (normalizedAngle >= -(3 * Math.PI) / 4 && normalizedAngle < -Math.PI / 4) {
      return DIRECTION.UP;
    }

    return DIRECTION.LEFT;
  }

  #calculateImpact(origin: Phaser.Math.Vector2): FireBreathImpact | undefined {
    const direction = new Phaser.Math.Vector2(Math.cos(this.#angle), Math.sin(this.#angle));
    const tileImpact = this.#findTileImpact(origin, direction);
    const blockingImpact = this.#findBlockingImpact(origin, direction);

    if (tileImpact === undefined) {
      return blockingImpact;
    }
    if (blockingImpact === undefined) {
      return tileImpact;
    }

    return tileImpact.distance <= blockingImpact.distance ? tileImpact : blockingImpact;
  }

  #findTileImpact(origin: Phaser.Math.Vector2, direction: Phaser.Math.Vector2): FireBreathImpact | undefined {
    const steps = Math.ceil(FIRE_BREATH_MAX_REACH / FIRE_BREATH_STEP_SIZE);

    for (let index = 1; index <= steps; index++) {
      const distance = index * FIRE_BREATH_STEP_SIZE;
      const sampleX = origin.x + direction.x * distance;
      const sampleY = origin.y + direction.y * distance;
      const tile = this.#collisionLayer.getTileAtWorldXY(sampleX, sampleY);

      if (tile === null || !tile.collides) {
        continue;
      }

      const tileBounds = new Phaser.Geom.Rectangle(tile.pixelX, tile.pixelY, tile.width, tile.height);
      return this.#raycastRect(origin, direction, tileBounds);
    }

    return undefined;
  }

  #findBlockingImpact(origin: Phaser.Math.Vector2, direction: Phaser.Math.Vector2): FireBreathImpact | undefined {
    let nearestImpact: FireBreathImpact | undefined;

    this.#blockingGroup.getChildren().forEach((child) => {
      if (!child.active) {
        return;
      }

      const body = (child as Phaser.GameObjects.GameObject & { body?: Phaser.Physics.Arcade.Body }).body;
      if (!(body instanceof Phaser.Physics.Arcade.Body) || !body.enable) {
        return;
      }

      const bounds = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
      const impact = this.#raycastRect(origin, direction, bounds);
      if (impact === undefined) {
        return;
      }

      if (nearestImpact === undefined || impact.distance < nearestImpact.distance) {
        nearestImpact = impact;
      }
    });

    return nearestImpact;
  }

  #raycastRect(
    origin: Phaser.Math.Vector2,
    direction: Phaser.Math.Vector2,
    rect: Phaser.Geom.Rectangle,
  ): FireBreathImpact | undefined {
    let entryDistance = 0;
    let exitDistance = FIRE_BREATH_MAX_REACH;
    let hitNormal = new Phaser.Math.Vector2(0, 0);

    const axes = [
      {
        origin: origin.x,
        direction: direction.x,
        min: rect.left,
        max: rect.right,
        negativeNormal: new Phaser.Math.Vector2(-1, 0),
        positiveNormal: new Phaser.Math.Vector2(1, 0),
      },
      {
        origin: origin.y,
        direction: direction.y,
        min: rect.top,
        max: rect.bottom,
        negativeNormal: new Phaser.Math.Vector2(0, -1),
        positiveNormal: new Phaser.Math.Vector2(0, 1),
      },
    ];

    for (const axis of axes) {
      if (Math.abs(axis.direction) < Number.EPSILON) {
        if (axis.origin < axis.min || axis.origin > axis.max) {
          return undefined;
        }
        continue;
      }

      let nearDistance = (axis.min - axis.origin) / axis.direction;
      let farDistance = (axis.max - axis.origin) / axis.direction;
      let nearNormal = axis.negativeNormal;

      if (nearDistance > farDistance) {
        [nearDistance, farDistance] = [farDistance, nearDistance];
        nearNormal = axis.positiveNormal;
      }

      if (nearDistance > entryDistance) {
        entryDistance = nearDistance;
        hitNormal = nearNormal.clone();
      }

      exitDistance = Math.min(exitDistance, farDistance);
      if (entryDistance > exitDistance) {
        return undefined;
      }
    }

    if (entryDistance < 0 || entryDistance > FIRE_BREATH_MAX_REACH) {
      return undefined;
    }

    return {
      distance: entryDistance,
      point: origin.clone().add(direction.clone().scale(entryDistance)),
      normal: hitNormal,
    };
  }
}
