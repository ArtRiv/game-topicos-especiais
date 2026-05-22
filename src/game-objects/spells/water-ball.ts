import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { WATER_BALL_IMPACT_ROTATION_OFFSET } from '../../common/config';
import { registerSpell } from './spell-registry';
import { Puddle } from './puddle';

/**
 * WaterBall — water-element projectile (FireBolt-like). Flies from caster to target,
 * explodes on wall or enemy contact, leaves a cluster of puddles on the impact site.
 *
 * Animation phases use the same sheet as the AREA/orb experiment we tried before:
 *   - STARTUP (frames 0..3) plays once when the projectile spawns, on top of the caster
 *   - LOOP (frames 4..11) repeats during flight (the "infinite" band of the sheet)
 *   - On hit, swap to the IMPACT sheet, play it once, then spawn puddles + destroy.
 *
 * No combos wired up yet — the puddle splash is the only secondary effect.
 */
export class WaterBall extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.WATER;
  readonly spellId: SpellId = SPELL_ID.WATER_BALL;
  readonly spellType: SpellType = SPELL_TYPE.PROJECTILE;
  readonly manaCost: number = RUNTIME_CONFIG.WATER_BALL_MANA_COST;
  readonly cooldown: number = RUNTIME_CONFIG.WATER_BALL_COOLDOWN;

  #lifetimeTimer: Phaser.Time.TimerEvent | undefined;
  #isExploding: boolean = false;

  get baseDamage(): number {
    return RUNTIME_CONFIG.WATER_BALL_DAMAGE;
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  // Sprite sheets are 80x80 / 64x64 per frame — way bigger than a FireBolt (48x48).
  // Pin both to a fixed display size so the orb always reads as a single moderate-sized
  // projectile rather than a giant blob, and so the size doesn't visibly "pop" between
  // the flight texture (80x80) and the impact texture (64x64).
  static readonly #DISPLAY_SIZE_PX = 36;

  constructor(scene: Phaser.Scene, x: number, y: number, targetX: number, targetY: number) {
    // Pass explicit frame 0 so the initial render shows exactly the first orb frame,
    // never the whole spritesheet (which is what produced the "4 balls in one spot"
    // ghost look — Phaser falls back to the full image when frame inference goes wrong).
    super(scene, x, y, ASSET_KEYS.WATER_BALL_STARTUP, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(3);
    this.setOrigin(0.5, 0.5);
    this.setDisplaySize(WaterBall.#DISPLAY_SIZE_PX, WaterBall.#DISPLAY_SIZE_PX);

    const r = RUNTIME_CONFIG.WATER_BALL_BODY_RADIUS;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(r);
    // Body offset uses the SOURCE frame size (80x80), not the displayed size — Phaser
    // physics offsets are in texture space, not screen space.
    body.setOffset(this.width / 2 - r, this.height / 2 - r);

    // Aim + velocity — straight-line travel, FireBolt-style.
    const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    body.setVelocity(
      Math.cos(angle) * RUNTIME_CONFIG.WATER_BALL_SPEED,
      Math.sin(angle) * RUNTIME_CONFIG.WATER_BALL_SPEED,
    );
    // Sprite rotation is purely cosmetic — the orb is roundish, but rotating keeps any
    // asymmetric ripple texture on the sheet aligned with the flight direction.
    this.setRotation(angle);

    // Skip the startup formation chain — for a projectile the "form-up" was reading as
    // a slow lurch at the cast point, and chaining two anims left ambiguous frames
    // visible between them. Just loop the infinite band from spawn; it's a flying orb,
    // not a charge-up. (Startup frames 0..3 remain in the sheet for area variants.)
    this.play(`${ASSET_KEYS.WATER_BALL_STARTUP}_LOOP`);

    this.#lifetimeTimer = scene.time.delayedCall(RUNTIME_CONFIG.WATER_BALL_LIFETIME, () => {
      // Fizzle without an impact splash if the ball flies into the void — no puddles, no
      // damage. This is symmetric with FireBolt's lifetime expiry.
      if (this.active) this.destroy();
    });
  }

  /** Wall + enemy collider call this. Plays the impact, drops puddles, destroys. */
  public explode(): void {
    if (this.#isExploding || !this.active) return;
    this.#isExploding = true;
    this.#lifetimeTimer?.destroy();

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocity(0, 0);
      body.enable = false;
    }

    // Capture the flight angle BEFORE we touch this.rotation — the orb was rotated to
    // match its travel direction during flight, and we need that angle to orient the
    // impact splash perpendicular to it.
    const flightAngle = this.rotation;

    // Swap to the dedicated impact sheet. Display size gets a 1.5x bump for impact
    // punch; rotation = flight + 90° puts the horizontal splash perpendicular to flight
    // direction (water hits a wall → splash spreads sideways). Same trick EarthBolt uses.
    this.setTexture(ASSET_KEYS.WATER_BALL_IMPACT, 0);
    this.setRotation(flightAngle + WATER_BALL_IMPACT_ROTATION_OFFSET);
    this.setDisplaySize(WaterBall.#DISPLAY_SIZE_PX * 1.5, WaterBall.#DISPLAY_SIZE_PX * 1.5);
    this.play(ASSET_KEYS.WATER_BALL_IMPACT);
    this.once(`animationcomplete-${ASSET_KEYS.WATER_BALL_IMPACT}`, () => {
      // Splash a scatter cluster of puddles where the ball burst.
      Puddle.spawnCluster(
        this.scene,
        this.x,
        this.y,
        RUNTIME_CONFIG.WATER_BALL_PUDDLE_COUNT,
        RUNTIME_CONFIG.WATER_BALL_PUDDLE_SPREAD,
        RUNTIME_CONFIG.WATER_BALL_PUDDLE_AMOUNT_EACH,
      );
      this.destroy();
    });
  }

  public destroy(fromScene?: boolean): void {
    this.#lifetimeTimer?.destroy();
    super.destroy(fromScene);
  }
}

registerSpell(SPELL_ID.WATER_BALL, (scene, x, y, tx, ty) => new WaterBall(scene, x, y, tx, ty));
