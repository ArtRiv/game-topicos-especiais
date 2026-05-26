import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import {
  WIND_BOLT_IMPACT_FORWARD_OFFSET,
  WIND_BOLT_LIFETIME,
  FLAME_SLASH_DAMAGE_MULT,
  FLAME_SLASH_TINT,
  FLAME_SLASH_PALETTE,
  FLAME_SLASH_EMBER_INTERVAL_MS,
  FLAME_SLASH_EMBER_PER_EMIT_MIN,
  FLAME_SLASH_EMBER_PER_EMIT_MAX,
  FLAME_SLASH_EMBER_SIZE_PX_MIN,
  FLAME_SLASH_EMBER_SIZE_PX_MAX,
  FLAME_SLASH_EMBER_RISE_PX_MIN,
  FLAME_SLASH_EMBER_RISE_PX_MAX,
  FLAME_SLASH_EMBER_LIFETIME_MS,
  FLAME_SLASH_EMBER_SPAWN_RADIUS_PX,
  FLAME_SLASH_GLOW_INNER_COLOR,
  FLAME_SLASH_GLOW_OUTER_COLOR,
  FLAME_SLASH_GLOW_INNER_RADIUS_PX,
  FLAME_SLASH_GLOW_OUTER_RADIUS_PX,
  FLAME_SLASH_GLOW_INNER_ALPHA,
  FLAME_SLASH_GLOW_OUTER_ALPHA,
} from '../../common/config';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { registerSpell } from './spell-registry';

export class WindBolt extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.WIND;
  readonly spellId: SpellId = SPELL_ID.WIND_BOLT;
  readonly spellType: SpellType = SPELL_TYPE.PROJECTILE;
  readonly manaCost: number = RUNTIME_CONFIG.WIND_BOLT_MANA_COST;
  readonly cooldown: number = RUNTIME_CONFIG.WIND_BOLT_COOLDOWN;

  #lifetimeTimer: Phaser.Time.TimerEvent | undefined;
  #isExploding: boolean = false;
  #isFlameSlash: boolean = false;
  #flameEmberTimer: Phaser.Time.TimerEvent | undefined;
  #flameGlow: Phaser.GameObjects.Graphics | undefined;

  get baseDamage(): number {
    const base = RUNTIME_CONFIG.WIND_BOLT_DAMAGE;
    return this.#isFlameSlash ? Math.round(base * FLAME_SLASH_DAMAGE_MULT) : base;
  }

  get isFlameSlash(): boolean {
    return this.#isFlameSlash;
  }

  /** Ignite the bolt into a Flame Slash after passing through a FireArea.
   *  Idempotent — repeated calls (additional fire pass-throughs) are no-ops.
   *  Tints the bolt warm-red, attaches a soft additive glow underneath, and
   *  starts emitting rising ember particles cycled through FLAME_SLASH_PALETTE. */
  public igniteToFlame(): void {
    if (this.#isFlameSlash || !this.active) return;
    this.#isFlameSlash = true;
    // setTintFill (not setTint) — the base WindBolt sprite is cyan/green,
    // and setTint multiplies, which turns warm tints muddy/green. setTintFill
    // replaces the sprite's color outright so the palette renders as picked.
    this.setTintFill(FLAME_SLASH_TINT);

    // Soft additive glow — drawn once, repositioned each frame in preUpdate
    // (a child container would be cleaner but adds depth-sort complications;
    // a free graphics + manual reposition keeps this self-contained).
    const glow = this.scene.add.graphics();
    glow.fillStyle(FLAME_SLASH_GLOW_OUTER_COLOR, FLAME_SLASH_GLOW_OUTER_ALPHA);
    glow.fillCircle(0, 0, FLAME_SLASH_GLOW_OUTER_RADIUS_PX);
    glow.fillStyle(FLAME_SLASH_GLOW_INNER_COLOR, FLAME_SLASH_GLOW_INNER_ALPHA);
    glow.fillCircle(0, 0, FLAME_SLASH_GLOW_INNER_RADIUS_PX);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    glow.setDepth(this.depth - 0.1);
    glow.setPosition(this.x, this.y);
    this.#flameGlow = glow;

    // Ember timer — mirrors the lava-puddle ember pattern (small graphics
    // rect, rise + fade tween), but emits from around the bolt as it travels.
    this.#flameEmberTimer = this.scene.time.addEvent({
      delay: FLAME_SLASH_EMBER_INTERVAL_MS,
      loop: true,
      callback: () => this.#emitFlameEmbers(),
    });
  }

  #emitFlameEmbers(): void {
    if (!this.active || !this.scene || this.#isExploding) return;
    const min = FLAME_SLASH_EMBER_PER_EMIT_MIN;
    const max = FLAME_SLASH_EMBER_PER_EMIT_MAX;
    const count = Math.floor(min + Math.random() * (max - min + 1));
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * FLAME_SLASH_EMBER_SPAWN_RADIUS_PX;
      const sx = this.x + Math.cos(angle) * dist;
      const sy = this.y + Math.sin(angle) * dist;
      const size =
        FLAME_SLASH_EMBER_SIZE_PX_MIN +
        Math.floor(
          Math.random() * (FLAME_SLASH_EMBER_SIZE_PX_MAX - FLAME_SLASH_EMBER_SIZE_PX_MIN + 1),
        );
      const tint =
        FLAME_SLASH_PALETTE[Math.floor(Math.random() * FLAME_SLASH_PALETTE.length)];
      const ember = this.scene.add.graphics({ x: sx, y: sy });
      ember.fillStyle(tint, 1);
      ember.fillRect(-size / 2, -size / 2, size, size);
      ember.setDepth(2);

      const rise =
        FLAME_SLASH_EMBER_RISE_PX_MIN +
        Math.random() * (FLAME_SLASH_EMBER_RISE_PX_MAX - FLAME_SLASH_EMBER_RISE_PX_MIN);
      this.scene.tweens.add({
        targets: ember,
        y: sy - rise,
        alpha: 0,
        duration: FLAME_SLASH_EMBER_LIFETIME_MS,
        ease: 'Quad.easeOut',
        onComplete: () => ember.destroy(),
      });
    }
  }

  protected preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (this.#flameGlow && this.#flameGlow.active) {
      this.#flameGlow.setPosition(this.x, this.y);
    }
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, targetX: number, targetY: number) {
    super(scene, x, y, ASSET_KEYS.WIND_BOLT);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(3);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(4, 4, true);

    const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    body.setVelocity(
      Math.cos(angle) * RUNTIME_CONFIG.WIND_BOLT_SPEED,
      Math.sin(angle) * RUNTIME_CONFIG.WIND_BOLT_SPEED,
    );
    this.setRotation(angle);
    this.play(ASSET_KEYS.WIND_BOLT);

    this.#lifetimeTimer = scene.time.delayedCall(WIND_BOLT_LIFETIME, () => {
      this.destroy();
    });
  }

  public explode(): void {
    if (this.#isExploding || !this.active) return;
    this.#isExploding = true;
    this.#lifetimeTimer?.destroy();

    const impactAngle = this.rotation;
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocity(0, 0);
      body.enable = false;
    }

    this.setPosition(
      this.x + Math.cos(impactAngle) * WIND_BOLT_IMPACT_FORWARD_OFFSET,
      this.y + Math.sin(impactAngle) * WIND_BOLT_IMPACT_FORWARD_OFFSET,
    );
    this.setRotation(impactAngle);
    this.setVisible(true);
    this.play(ASSET_KEYS.WIND_BOLT_HIT);
    this.once(`animationcomplete-${ASSET_KEYS.WIND_BOLT_HIT}`, () => {
      this.destroy();
    });
  }

  public destroy(fromScene?: boolean): void {
    this.#lifetimeTimer?.destroy();
    this.#flameEmberTimer?.destroy();
    this.#flameEmberTimer = undefined;
    this.#flameGlow?.destroy();
    this.#flameGlow = undefined;
    super.destroy(fromScene);
  }
}

// Side-effect: register factory
registerSpell(SPELL_ID.WIND_BOLT, (scene, x, y, tx, ty) => new WindBolt(scene, x, y, tx, ty));
