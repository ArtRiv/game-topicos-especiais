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
import { ASSET_KEYS } from '../../common/assets';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { DIRECTION } from '../../common/common';
import type { CharacterGameObject } from '../common/character-game-object';

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

  // Electrified state (ThunderStrike + Puddle combo). All inactive by default — the
  // puddle is a plain wet-floor unless electrify() flips it on.
  #charge: number = 0;
  #electrified: boolean = false;
  #electrifiedSpellId: string | undefined;
  #sparkTimer: Phaser.Time.TimerEvent | undefined;
  #damageTimer: Phaser.Time.TimerEvent | undefined;
  #lastSparkUpdateMs: number = 0;
  #spellGroup: Phaser.GameObjects.Group | undefined;
  #enemiesInArea: Set<CharacterGameObject> = new Set();

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

  /**
   * Bump the puddle to "electrified" state with `initialCharge` charge. Re-calling on
   * an already-electrified puddle ratchets the charge up (never down) and rotates the
   * spellId so PvP cross-player damage (deduped by spellId in GameScene) can hit again.
   *
   * The puddle is added to `spellGroup` (if provided) so it participates in:
   *   - spellGroup vs enemy overlap → enemies tracked in #enemiesInArea → tick damage.
   *   - spellGroup vs remote players (cross-player overlap B in game-scene.ts) →
   *     sendSpellHit fires with spellId/casterId/baseDamage from setData.
   */
  electrify(
    initialCharge: number = RUNTIME_CONFIG.ELEC_PUDDLE_CHARGE_MAX,
    spellGroup?: Phaser.GameObjects.Group,
    casterId?: string,
  ): void {
    const cap = RUNTIME_CONFIG.ELEC_PUDDLE_CHARGE_MAX;
    const charge = Math.max(0, Math.min(cap, initialCharge));
    this.#charge = Math.max(this.#charge, charge);

    // New spellId every strike → PvP damage dedupe (game-scene.ts:1497) doesn't lock
    // the remote player out forever; they can be re-zapped on a fresh strike.
    this.#electrifiedSpellId = `elec-puddle-${Math.random().toString(36).slice(2, 10)}-${this.scene.time.now}`;
    this.setData('spellId', this.#electrifiedSpellId);
    if (casterId !== undefined) this.setData('casterId', casterId);
    this.setData('spellType', 'ElectrifiedPuddle');
    this.setData('baseDamage', RUNTIME_CONFIG.ELEC_PUDDLE_DAMAGE_PER_TICK);
    this.setData('electrified', true);

    if (this.#electrified) return; // already running — just refreshed charge + id
    this.#electrified = true;
    this.#lastSparkUpdateMs = this.scene.time.now;

    if (spellGroup && !spellGroup.contains(this)) {
      this.#spellGroup = spellGroup;
      spellGroup.add(this);
    }

    this.#sparkTimer = this.scene.time.addEvent({
      delay: RUNTIME_CONFIG.ELEC_PUDDLE_SPARK_TICK_MS,
      callback: this.#tickSparks,
      callbackScope: this,
      loop: true,
    });
    this.#damageTimer = this.scene.time.addEvent({
      delay: RUNTIME_CONFIG.ELEC_PUDDLE_TICK_INTERVAL_MS,
      callback: this.#tickDamage,
      callbackScope: this,
      loop: true,
    });
  }

  get charge(): number {
    return this.#charge;
  }

  get isElectrified(): boolean {
    return this.#electrified;
  }

  /** Read by `baseDamage` consumers in game-scene cross-player overlap. */
  get baseDamage(): number {
    return RUNTIME_CONFIG.ELEC_PUDDLE_DAMAGE_PER_TICK;
  }

  /** Called by the spellGroup-vs-enemy overlap dispatcher in GameScene. */
  addEnemyInArea(enemy: CharacterGameObject): void {
    this.#enemiesInArea.add(enemy);
  }

  removeEnemyFromArea(enemy: CharacterGameObject): void {
    this.#enemiesInArea.delete(enemy);
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

  #tickDamage(): void {
    if (!this.#electrified) return;
    const dmg = RUNTIME_CONFIG.ELEC_PUDDLE_DAMAGE_PER_TICK;
    for (const enemy of this.#enemiesInArea) {
      // LavaPool pattern (lava-pool.ts:91) — guard against stale references.
      if (enemy.active && !enemy.isDefeated) {
        enemy.hit(DIRECTION.DOWN, dmg);
      }
    }
  }

  #tickSparks(): void {
    if (!this.#electrified) return;
    const now = this.scene.time.now;
    const dtSec = Math.max(0, (now - this.#lastSparkUpdateMs) / 1000);
    this.#lastSparkUpdateMs = now;

    this.#charge -= RUNTIME_CONFIG.ELEC_PUDDLE_DECAY_PER_SEC * dtSec;
    if (this.#charge <= 0) {
      this.#charge = 0;
      this.#endElectrification();
      return;
    }

    const cap = RUNTIME_CONFIG.ELEC_PUDDLE_CHARGE_MAX;
    const t = Math.max(0, Math.min(1, this.#charge / cap));

    const lerp = (a: number, b: number): number => a + (b - a) * t;
    const qtyExpected = lerp(
      RUNTIME_CONFIG.ELEC_PUDDLE_SPARK_QTY_AT_LOW,
      RUNTIME_CONFIG.ELEC_PUDDLE_SPARK_QTY_AT_FULL,
    );
    const wHi = lerp(
      RUNTIME_CONFIG.ELEC_PUDDLE_SPARK_WEIGHT_HI_AT_LOW,
      RUNTIME_CONFIG.ELEC_PUDDLE_SPARK_WEIGHT_HI_AT_FULL,
    );
    const wMid = lerp(
      RUNTIME_CONFIG.ELEC_PUDDLE_SPARK_WEIGHT_MID_AT_LOW,
      RUNTIME_CONFIG.ELEC_PUDDLE_SPARK_WEIGHT_MID_AT_FULL,
    );
    const wLo = lerp(
      RUNTIME_CONFIG.ELEC_PUDDLE_SPARK_WEIGHT_LO_AT_LOW,
      RUNTIME_CONFIG.ELEC_PUDDLE_SPARK_WEIGHT_LO_AT_FULL,
    );

    // qtyExpected is fractional — floor + Bernoulli for the remainder gives the
    // right average without "always rounded up" bias.
    const whole = Math.floor(qtyExpected);
    const frac = qtyExpected - whole;
    const count = whole + (Math.random() < frac ? 1 : 0);

    for (let i = 0; i < count; i++) this.#spawnSpark(wHi, wMid, wLo);
  }

  #spawnSpark(wHi: number, wMid: number, wLo: number): void {
    const totalW = wHi + wMid + wLo;
    if (totalW <= 0) return;
    const roll = Math.random() * totalW;
    let frameIdx: number;
    if (roll < wHi) frameIdx = RUNTIME_CONFIG.ELEC_PUDDLE_SPARK_FRAME_HI;
    else if (roll < wHi + wMid) frameIdx = RUNTIME_CONFIG.ELEC_PUDDLE_SPARK_FRAME_MID;
    else frameIdx = RUNTIME_CONFIG.ELEC_PUDDLE_SPARK_FRAME_LO;

    // Uniform random point inside the puddle disc (sqrt for area-uniform — without
    // it sparks would clump at the centre).
    const r = Math.sqrt(Math.random()) * this.radius;
    const a = Math.random() * Math.PI * 2;
    const sx = this.x + Math.cos(a) * r;
    const sy = this.y + Math.sin(a) * r;

    const spark = this.scene.add.sprite(sx, sy, ASSET_KEYS.THUNDER_SPLASH, frameIdx);
    spark.setScale(RUNTIME_CONFIG.ELEC_PUDDLE_SPARK_SCALE);
    spark.setDepth(this.depth + 0.5);
    this.scene.time.delayedCall(RUNTIME_CONFIG.ELEC_PUDDLE_SPARK_LIFETIME_MS, () => {
      if (spark.active) spark.destroy();
    });
  }

  #endElectrification(): void {
    this.#electrified = false;
    this.#charge = 0;
    this.#sparkTimer?.destroy();
    this.#sparkTimer = undefined;
    this.#damageTimer?.destroy();
    this.#damageTimer = undefined;
    this.#enemiesInArea.clear();
    this.setData('electrified', false);
    if (this.#spellGroup && this.#spellGroup.contains(this)) {
      this.#spellGroup.remove(this);
    }
    this.#spellGroup = undefined;
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
    this.#sparkTimer?.destroy();
    this.#damageTimer?.destroy();
    this.#enemiesInArea.clear();
    if (this.#spellGroup && this.#spellGroup.contains(this)) {
      this.#spellGroup.remove(this);
    }
    Puddle.all.delete(this);
    super.destroy(fromScene);
  }
}
