import * as Phaser from 'phaser';
import { ASSET_KEYS } from '../../common/assets';
import {
  EARTH_WALL_PILLAR_HP,
  EARTH_WALL_HIT_FLASH_DURATION,
  EARTH_WALL_DURATION,
  EARTH_WALL_PILLAR_BODY_WIDTH,
  EARTH_WALL_PILLAR_BODY_HEIGHT,
  EARTH_WALL_PULVERIZE_CHUNK_COUNT,
  EARTH_WALL_PULVERIZE_CHUNK_SIZE_MIN_PX,
  EARTH_WALL_PULVERIZE_CHUNK_SIZE_MAX_PX,
  EARTH_WALL_PULVERIZE_CHUNK_DURATION_MS,
  EARTH_WALL_PULVERIZE_TINT_LIGHT,
  EARTH_WALL_PULVERIZE_TINT_DARK,
  EARTH_WALL_PULVERIZE_ARRIVAL_JITTER_PX,
  EARTH_WALL_DARK_PULL_DUST_PER_EMIT,
  EARTH_WALL_DARK_PULL_DUST_DURATION_MS,
} from '../../common/config';

/**
 * A static earth-element barrier pillar placed by the EarthWall spell.
 * Blocks enemy movement, absorbs damage (HP pool), plays a crumble animation on death.
 */
export class EarthWallPillar extends Phaser.Physics.Arcade.Sprite {
  #currentHp: number;
  #isBeingDestroyed: boolean = false;
  #hitFlashTimer?: Phaser.Time.TimerEvent;

  get isBeingDestroyed(): boolean {
    return this.#isBeingDestroyed;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, hpBonus: number = 0, durationMult: number = 1) {
    super(scene, x, y, ASSET_KEYS.EARTH_WALL, 1);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.#currentHp = EARTH_WALL_PILLAR_HP + hpBonus;
    this.setDepth(4);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(EARTH_WALL_PILLAR_BODY_WIDTH, EARTH_WALL_PILLAR_BODY_HEIGHT, true);
    body.setImmovable(true);
    body.setAllowGravity(false);

    // Y-based depth so lower pillars render in front of higher ones
    this.setDepth(y);

    // Play emerge animation, then transition to looping idle
    this.play(`${ASSET_KEYS.EARTH_WALL}_EMERGE`);
    this.once(`animationcomplete-${ASSET_KEYS.EARTH_WALL}_EMERGE`, () => {
      if (this.active && !this.#isBeingDestroyed) {
        this.play(`${ASSET_KEYS.EARTH_WALL}_IDLE`);
      }
    });

    // Auto-collapse after EARTH_WALL_DURATION ms so abandoned walls don't litter the map.
    // shatter() (combo path) and takeDamage() (HP-driven) skip the auto timer naturally
    // since both call #crumble() which guards on isBeingDestroyed.
    scene.time.delayedCall(EARTH_WALL_DURATION * durationMult, () => {
      if (this.active && !this.#isBeingDestroyed) {
        this.#crumble();
      }
    });
  }

  /** Apply damage to this pillar. Flashes white on hit; plays death anim when HP reaches 0. */
  public takeDamage(damage: number): void {
    if (this.#isBeingDestroyed || !this.active) return;

    this.#currentHp -= damage;

    // Brief white flash to indicate damage
    this.#hitFlashTimer?.remove(false);
    this.setTintFill(0xffffff);
    this.#hitFlashTimer = this.scene.time.delayedCall(EARTH_WALL_HIT_FLASH_DURATION, () => {
      if (this.active && !this.#isBeingDestroyed) {
        this.clearTint();
      }
      this.#hitFlashTimer = undefined;
    });

    if (this.#currentHp <= 0) {
      this.#crumble();
    }
  }

  /**
   * EarthBump + EarthWall combo path: instantly crumble the pillar regardless of HP.
   * Caller is responsible for spawning the shard projectile.
   */
  public shatter(): void {
    if (this.#isBeingDestroyed || !this.active) return;
    this.#currentHp = 0;
    this.#crumble();
  }

  /**
   * VoidOrb + EarthWall combo path: pulverize the pillar into pixel chunks
   * that fly toward (toX, toY) — the orb's body center. Skips the
   * crumble-sink-into-floor animation entirely. The chunks landing on the
   * orb sprite read as "brown pixels appearing on the orb", which is the
   * void-eating-rock visual the void-orb combo wants.
   *
   * Chunks are scene-owned (not parented to the pillar) so they outlive the
   * pillar's immediate destruction. Each chunk tween-completes by destroying
   * itself; no global state to clean up.
   */
  public pulverize(toX: number, toY: number): void {
    if (this.#isBeingDestroyed || !this.active) return;
    this.#isBeingDestroyed = true;
    this.#hitFlashTimer?.remove(false);
    this.#hitFlashTimer = undefined;
    this.clearTint();

    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.enable = false;

    const bounds = this.getBounds();
    this.#spawnDarkChunks(
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
      EARTH_WALL_PULVERIZE_CHUNK_COUNT,
      toX,
      toY,
      EARTH_WALL_PULVERIZE_CHUNK_DURATION_MS,
    );

    // No crumble animation — pop out instantly. The chunk burst carries the
    // visual weight of the death.
    this.destroy();
  }

  /**
   * Emit a thin trickle of brown chunks from the pillar's bounds toward
   * (toX, toY). Called periodically (throttled by the scene) while the
   * pillar is being pulled by an orb, BEFORE it hits the crumble ring.
   * Visually reads as "the orb is grinding chips off the wall".
   *
   * Cheap — typically spawns one chunk per call. No-op when the per-emit
   * count is configured to 0 (use this to disable the trail effect).
   */
  public emitDarkDust(toX: number, toY: number): void {
    if (this.#isBeingDestroyed || !this.active) return;
    if (EARTH_WALL_DARK_PULL_DUST_PER_EMIT <= 0) return;
    const bounds = this.getBounds();
    this.#spawnDarkChunks(
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
      EARTH_WALL_DARK_PULL_DUST_PER_EMIT,
      toX,
      toY,
      EARTH_WALL_DARK_PULL_DUST_DURATION_MS,
    );
  }

  /** Spawn `count` 1–3px brown chunks at random positions within the given
   *  bounds, each tweening to (toX, toY) with a small random arrival jitter
   *  and fading/shrinking on the way. Tint alternates between LIGHT and DARK
   *  so the burst reads as varied rock instead of a single-colour blob. */
  #spawnDarkChunks(
    bx: number,
    by: number,
    bw: number,
    bh: number,
    count: number,
    toX: number,
    toY: number,
    durationMs: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const sx = bx + Math.random() * bw;
      const sy = by + Math.random() * bh;
      const sizeRange =
        EARTH_WALL_PULVERIZE_CHUNK_SIZE_MAX_PX - EARTH_WALL_PULVERIZE_CHUNK_SIZE_MIN_PX;
      const size =
        EARTH_WALL_PULVERIZE_CHUNK_SIZE_MIN_PX +
        Math.floor(Math.random() * (sizeRange + 1));
      const tint = i % 2 === 0
        ? EARTH_WALL_PULVERIZE_TINT_LIGHT
        : EARTH_WALL_PULVERIZE_TINT_DARK;

      const chunk = this.scene.add.graphics({ x: sx, y: sy });
      chunk.fillStyle(tint, 1);
      chunk.fillRect(-size / 2, -size / 2, size, size);
      // Above the pillar (depth 4) but below the player so chunks don't
      // float on top of the mage. The orb sits at depth ~3 (vfx1 sprite),
      // so chunks arriving at the orb will sit just above it visually.
      chunk.setDepth(5);

      const jx = (Math.random() - 0.5) * 2 * EARTH_WALL_PULVERIZE_ARRIVAL_JITTER_PX;
      const jy = (Math.random() - 0.5) * 2 * EARTH_WALL_PULVERIZE_ARRIVAL_JITTER_PX;
      this.scene.tweens.add({
        targets: chunk,
        x: toX + jx,
        y: toY + jy,
        alpha: 0,
        scale: 0,
        duration: durationMs,
        ease: 'Quad.easeIn',
        onComplete: () => chunk.destroy(),
      });
    }
  }

  #crumble(): void {
    if (this.#isBeingDestroyed) return;
    this.#isBeingDestroyed = true;
    this.#hitFlashTimer?.remove(false);
    this.#hitFlashTimer = undefined;
    this.clearTint();

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.enable = false;
    }

    // Play the sink-back-into-earth animation then destroy
    this.play(`${ASSET_KEYS.EARTH_WALL}_CRUMBLE`);
    this.once(`animationcomplete-${ASSET_KEYS.EARTH_WALL}_CRUMBLE`, () => {
      this.destroy();
    });
  }
}
