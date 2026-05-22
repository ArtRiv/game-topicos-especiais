import * as Phaser from 'phaser';
import {
  PUDDLE_BASE_RADIUS_PX,
  PUDDLE_AMOUNT_RADIUS_PX,
  PUDDLE_DEFAULT_LIFETIME_MS,
  PUDDLE_MAX_AMOUNT,
  PUDDLE_MERGE_RADIUS,
  PUDDLE_TINT,
  PUDDLE_HIGHLIGHT_TINT,
} from '../../common/config';

/**
 * Wet-floor / puddle marker spawned by water-element spells. Future combos read these
 * positions (lightning chain across puddles, fire vaporization, ice→slippery, etc.) —
 * each puddle carries a circular physics body so combo handlers can use plain
 * scene.physics.overlap() instead of hand-rolling distance checks.
 *
 * Visual: 6 jittered overlapping ellipses + a bright highlight ellipse — organic blob
 * that never reads as a perfect circle or square, looks like real spilled water.
 *
 * Merging: a new puddle within PUDDLE_MERGE_RADIUS of an existing one is absorbed via
 * addWater() rather than spawning a duplicate. Body radius and visual both grow.
 */
export class Puddle extends Phaser.GameObjects.Graphics {
  /** All currently-active puddles in the scene. */
  static readonly all: Set<Puddle> = new Set();

  /**
   * Drop a single puddle at (x, y). Merges into a nearby existing puddle if one is
   * within PUDDLE_MERGE_RADIUS, otherwise creates a fresh one. Returns the puddle that
   * "owns" the water at this location.
   */
  static spawnOrMerge(scene: Phaser.Scene, x: number, y: number, amount = 1, lifetimeMs?: number): Puddle {
    for (const p of Puddle.all) {
      if (!p.active || p.scene !== scene) continue;
      if (Phaser.Math.Distance.Between(x, y, p.x, p.y) <= PUDDLE_MERGE_RADIUS) {
        p.addWater(amount, lifetimeMs ?? PUDDLE_DEFAULT_LIFETIME_MS);
        return p;
      }
    }
    return new Puddle(scene, x, y, amount, lifetimeMs);
  }

  /**
   * Spawn a cluster of N puddles distributed uniformly within `spread` pixels of
   * (cx, cy). Each puddle gets `amountEach` water — many small puddles will tend to
   * merge into a few larger ones thanks to spawnOrMerge, giving a natural "splash"
   * coverage rather than a single perfect circle.
   *
   * `staggerMs` (optional): if > 0, puddles spawn one every `staggerMs` ms instead of
   * all at the same frame. Use this for slow spells like WaterTornado where puddles
   * popping into existence all at once looks unnatural — gradual accumulation reads
   * like water actually being thrown around by the tornado.
   */
  static spawnCluster(
    scene: Phaser.Scene,
    cx: number,
    cy: number,
    count: number,
    spread: number,
    amountEach: number,
    lifetimeMs?: number,
    staggerMs: number = 0,
  ): void {
    for (let i = 0; i < count; i++) {
      const drop = (): void => {
        if (!scene.scene.isActive()) return;
        // sqrt(random) for uniform area distribution — without it puddles clump at the center.
        const r = Math.sqrt(Math.random()) * spread;
        const a = Math.random() * Math.PI * 2;
        Puddle.spawnOrMerge(scene, cx + Math.cos(a) * r, cy + Math.sin(a) * r, amountEach, lifetimeMs);
      };
      if (staggerMs > 0 && i > 0) {
        scene.time.delayedCall(i * staggerMs, drop);
      } else {
        drop();
      }
    }
  }

  amount: number;
  radius: number;
  declare body: Phaser.Physics.Arcade.Body;
  #destroyTimer: Phaser.Time.TimerEvent | undefined;
  #fadeTween: Phaser.Tweens.Tween | undefined;

  constructor(scene: Phaser.Scene, x: number, y: number, amount = 1, lifetimeMs = PUDDLE_DEFAULT_LIFETIME_MS) {
    super(scene, { x, y });
    scene.add.existing(this);
    this.amount = amount;
    this.radius = this.#computeRadius();
    // Just above the floor tiles, well under characters (which depth-sort by Y), so
    // the puddle never appears on top of a mage standing in it.
    this.setDepth(1.5);

    // Phaser Graphics has no inherent width/height, so we attach a physics body and
    // size it explicitly via setCircle. The body is sensor-only (immovable) — combo
    // handlers call scene.physics.overlap(spell, puddle) to detect interactions.
    scene.physics.add.existing(this);
    this.#syncBody();

    this.#draw();
    this.#scheduleFade(lifetimeMs);
    Puddle.all.add(this);
  }

  /** Pour more water in. Grows the body + visual, resets destroy timer. */
  addWater(delta: number, lifetimeMs: number = PUDDLE_DEFAULT_LIFETIME_MS): void {
    this.amount = Math.min(PUDDLE_MAX_AMOUNT, this.amount + delta);
    this.radius = this.#computeRadius();
    this.#syncBody();
    this.#draw();
    this.#destroyTimer?.destroy();
    this.#fadeTween?.stop();
    this.setAlpha(1);
    this.#scheduleFade(lifetimeMs);
  }

  /** Remove water (future fire+water combo would call this). Destroys at 0. */
  evaporate(delta: number): void {
    this.amount -= delta;
    if (this.amount <= 0) {
      this.destroy();
      return;
    }
    this.radius = this.#computeRadius();
    this.#syncBody();
    this.#draw();
  }

  #computeRadius(): number {
    return PUDDLE_BASE_RADIUS_PX + PUDDLE_AMOUNT_RADIUS_PX * Math.min(this.amount, PUDDLE_MAX_AMOUNT);
  }

  /** Resize the Arcade body to match the current visual radius. */
  #syncBody(): void {
    const r = this.radius;
    // Phaser Graphics has no displayOrigin → body.x = graphics.x + offsetX. To center
    // the body at (graphics.x, graphics.y) we use offset (-r, -r).
    this.body.setCircle(r, -r, -r);
    this.body.setImmovable(true);
    this.body.setAllowGravity(false);
  }

  #draw(): void {
    this.clear();
    const r = this.radius;

    // 6 jittered overlapping blobs — organic, no two puddles identical.
    const blobs = 6;
    for (let i = 0; i < blobs; i++) {
      const angle = (i / blobs) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const dist = r * 0.35 * Math.random();
      const rx = r * (0.65 + Math.random() * 0.45);
      const ry = r * (0.45 + Math.random() * 0.4);
      this.fillStyle(PUDDLE_TINT, 0.45);
      this.fillEllipse(Math.cos(angle) * dist, Math.sin(angle) * dist, rx * 2, ry * 2);
    }

    // Wet-shine highlight.
    this.fillStyle(PUDDLE_HIGHLIGHT_TINT, 0.55);
    this.fillEllipse(-r * 0.18, -r * 0.22, r * 0.55, r * 0.22);
  }

  #scheduleFade(lifetimeMs: number): void {
    const fadeMs = Math.min(1500, Math.floor(lifetimeMs * 0.15));
    this.#destroyTimer = this.scene.time.delayedCall(lifetimeMs - fadeMs, () => {
      if (!this.active) return;
      this.#fadeTween = this.scene.tweens.add({
        targets: this,
        alpha: 0,
        duration: fadeMs,
        onComplete: () => this.destroy(),
      });
    });
  }

  destroy(fromScene?: boolean): void {
    this.#destroyTimer?.destroy();
    this.#fadeTween?.stop();
    Puddle.all.delete(this);
    super.destroy(fromScene);
  }
}
