import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Direction, Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { DIRECTION, ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import {
  CHARGED_RAY_DISPLAY_HEIGHT_PX,
  CHARGED_RAY_HAND_FORWARD_PX,
  CHARGED_RAY_HAND_PERP_PX,
  CHARGED_RAY_MANA_COST,
  CHARGED_RAY_COOLDOWN_MS,
} from '../../common/config';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { registerSpell } from './spell-registry';

/**
 * ChargedLightningRay — a press-and-hold charged replacement for the old
 * continuous LightningBeam. The GameScene charge machine decides the direction
 * (locked at charge-start), the damage and the length (both scaled by hold time)
 * and then constructs ONE ray. This object is therefore a pure cast-once spell:
 *   - it renders a straight beam from the caster's hand along a FIXED angle,
 *   - it applies its damage exactly ONCE (on spawn — see #updateChargedRayHits
 *     in GameScene, which reads isPointInBeam against this fixed geometry),
 *   - it fades out after VISIBLE_MS and self-destroys.
 *
 * Because nothing here re-aims at the cursor and nothing streams per-frame, the
 * remote replica is trivially identical: GameScene spawns the same class with the
 * same (origin, angle, length) carried in the one-shot SPELL_CAST broadcast.
 *
 * The angle/length/damage are supplied by the constructor — the caster's spell
 * modifiers (future TDM upgrades) are applied UPSTREAM in the charge machine, so
 * this class stays a dumb renderer + hitbox.
 */
export class ChargedLightningRay extends Phaser.GameObjects.Container implements ActiveSpell {
  readonly element: Element = ELEMENT.THUNDER;
  readonly spellId: SpellId = SPELL_ID.LIGHTNING_BEAM;
  readonly spellType: SpellType = SPELL_TYPE.AREA;
  readonly manaCost: number = CHARGED_RAY_MANA_COST;
  readonly cooldown: number = CHARGED_RAY_COOLDOWN_MS;

  #angle: number;
  #length: number;
  #damage: number;
  #caster: (Phaser.GameObjects.GameObject & { x: number; y: number }) | null;
  #beamSprite1: Phaser.GameObjects.Sprite;
  #beamSprite2: Phaser.GameObjects.Sprite;
  #debugGfx: Phaser.GameObjects.Graphics;
  #hitThisCast: Set<unknown> = new Set();
  #fadeTween: Phaser.Tweens.Tween | undefined;
  #destroyTimer: Phaser.Time.TimerEvent | undefined;

  get baseDamage(): number {
    return this.#damage;
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  /**
   * @param angle  fixed world-space aim angle (radians) — locked at charge start.
   * @param length ray length (px) — already scaled by charge + modifiers.
   * @param damage half-heart damage — already scaled by charge + modifiers.
   */
  constructor(
    scene: Phaser.Scene,
    casterX: number,
    casterY: number,
    angle: number,
    length: number,
    damage: number,
    caster?: Phaser.GameObjects.GameObject,
  ) {
    super(scene, casterX, casterY);
    scene.add.existing(this);
    this.setDepth(3.5);
    this.#angle = angle;
    this.#length = length;
    this.#damage = damage;
    this.#caster = (caster ?? null) as (Phaser.GameObjects.GameObject & { x: number; y: number }) | null;

    this.#beamSprite1 = scene.add.sprite(0, 0, ASSET_KEYS.LIGHTNING_BEAM_VFX1).setOrigin(0, 0.5);
    this.#beamSprite2 = scene.add.sprite(0, 0, ASSET_KEYS.LIGHTNING_BEAM_VFX2).setOrigin(0, 0.5);
    this.#beamSprite1.play(ASSET_KEYS.LIGHTNING_BEAM_VFX1);
    this.#beamSprite2.play(ASSET_KEYS.LIGHTNING_BEAM_VFX2);
    this.#beamSprite2.setBlendMode(Phaser.BlendModes.ADD);

    this.#debugGfx = scene.add.graphics();
    this.add([this.#beamSprite1, this.#beamSprite2, this.#debugGfx]);

    this.#layout();

    // Single-hit flash: stay full for most of VISIBLE_MS, then fade and destroy.
    const visibleMs = RUNTIME_CONFIG.CHARGED_RAY_VISIBLE_MS;
    this.#fadeTween = scene.tweens.add({
      targets: this,
      alpha: 0,
      delay: Math.max(0, visibleMs - 120),
      duration: 120,
      ease: 'Quad.easeIn',
    });
    this.#destroyTimer = scene.time.delayedCall(visibleMs, () => this.destroy());

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.#follow, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.#follow, this);
      this.#fadeTween?.stop();
      this.#destroyTimer?.destroy();
    });
  }

  /** Keep the ray's pivot anchored to the caster's hand (the ANGLE never changes).
   *  The caster may walk slightly during the brief VISIBLE_MS; the beam slides with
   *  them but keeps its locked direction — both screens stay identical because the
   *  angle is fixed and the caster position is networked. */
  #follow(): void {
    if (!this.active) return;
    this.#layout();
  }

  /** Position the container at the caster's hand pivot and stretch the sprites to
   *  the fixed length. Shares the geometry with the old beam's #aimAt. */
  #layout(): void {
    const cx = this.#caster?.x ?? this.x;
    const cy = this.#caster?.y ?? this.y;
    const cos = Math.cos(this.#angle);
    const sin = Math.sin(this.#angle);
    const worldOffX = CHARGED_RAY_HAND_FORWARD_PX * cos - CHARGED_RAY_HAND_PERP_PX * sin;
    const worldOffY = CHARGED_RAY_HAND_FORWARD_PX * sin + CHARGED_RAY_HAND_PERP_PX * cos;
    this.setPosition(cx + worldOffX, cy + worldOffY);
    this.setRotation(this.#angle);
    const sxScale = this.#length / this.#beamSprite1.width;
    const syScale = CHARGED_RAY_DISPLAY_HEIGHT_PX / this.#beamSprite1.height;
    this.#beamSprite1.setScale(sxScale, syScale);
    this.#beamSprite2.setScale(sxScale, syScale);
    if (this.scene.physics?.world?.drawDebug) {
      this.#debugGfx.clear();
      this.#debugGfx.lineStyle(1, 0x00ff00, 1);
      this.#debugGfx.strokeRect(0, -RUNTIME_CONFIG.CHARGED_RAY_HEIGHT_PX / 2, this.#length, RUNTIME_CONFIG.CHARGED_RAY_HEIGHT_PX);
    } else {
      this.#debugGfx.clear();
    }
  }

  /** Rotated-rectangle hit test in world coords (same math as the old beam). */
  public isPointInBeam(x: number, y: number): boolean {
    const cos = Math.cos(this.#angle);
    const sin = Math.sin(this.#angle);
    const dx = x - this.x;
    const dy = y - this.y;
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;
    if (localX < 0 || localX > this.#length) return false;
    if (Math.abs(localY) > RUNTIME_CONFIG.CHARGED_RAY_HEIGHT_PX / 2) return false;
    return true;
  }

  /** Per-cast hit dedupe set — a target is damaged at most once by this ray. */
  public get hitThisCastSet(): Set<unknown> {
    return this.#hitThisCast;
  }

  /** Cardinal direction of the ray, for hit reactions. */
  public get aimDirection(): Direction {
    if (Math.abs(Math.cos(this.#angle)) >= Math.abs(Math.sin(this.#angle))) {
      return Math.cos(this.#angle) >= 0 ? DIRECTION.RIGHT : DIRECTION.LEFT;
    }
    return Math.sin(this.#angle) >= 0 ? DIRECTION.DOWN : DIRECTION.UP;
  }

  /** No-op: the ray doesn't react to walls (it's an instantaneous flash). */
  public explode(): void { /* intentionally empty */ }
}

// Registered under LIGHTNING_BEAM so the existing THUNDER slot-1 / HUD wiring keeps
// working — the charged ray simply IS the new lightning spell. The GameScene charge
// machine constructs local rays directly (it needs the charge level), so this
// factory's main job is spawning REMOTE replicas from the one-shot SPELL_CAST. The
// remote path carries (angle, length, damage) packed into targetX/targetY/element-
// adjacent fields; GameScene unpacks them and calls the constructor, so this
// registry factory is a thin fallback that derives a sane ray from the aim target.
registerSpell(SPELL_ID.LIGHTNING_BEAM, (scene, cx, cy, tx, ty, _dir, caster) => {
  const angle = Math.atan2(ty - cy, tx - cx);
  const length = RUNTIME_CONFIG.CHARGED_RAY_LENGTH_MIN_PX;
  const damage = RUNTIME_CONFIG.CHARGED_RAY_DAMAGE_MIN;
  return new ChargedLightningRay(scene, cx, cy, angle, length, damage, caster);
});
