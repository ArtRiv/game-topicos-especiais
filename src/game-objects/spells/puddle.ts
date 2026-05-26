import * as Phaser from 'phaser';
import {
  PUDDLE_BASE_RADIUS_PX,
  PUDDLE_AMOUNT_RADIUS_PX,
  PUDDLE_DEFAULT_LIFETIME_MS,
  PUDDLE_MAX_AMOUNT,
  PUDDLE_MERGE_RADIUS,
  PUDDLE_TINT,
  PUDDLE_HIGHLIGHT_TINT,
  PUDDLE_MUD_TINT,
  PUDDLE_MUD_HIGHLIGHT_TINT,
  PUDDLE_MUD_LIFETIME_MS,
  // The PUDDLE_LAVA_* values that are read at draw / tick time are read from
  // RUNTIME_CONFIG instead so the debug panel can edit them live. Two values
  // stay as compile-time constants here: NOISE tints (no slider) and the
  // EMBER_TINTS array (no slider). Everything else flows through
  // RUNTIME_CONFIG and updates next bubble redraw.
  PUDDLE_LAVA_NOISE_TINT_LIGHT,
  PUDDLE_LAVA_NOISE_TINT_DARK,
  PUDDLE_LAVA_EMBER_TINTS,
  ELEC_PUDDLE_MUD_DAMAGE_MULTIPLIER,
  ELEC_PUDDLE_MUD_CHARGE_MULTIPLIER,
  ELEC_PUDDLE_MUD_SPARK_QTY_MULTIPLIER,
  VOID_ORB_PUDDLE_CONSUME_CHUNK_COUNT,
  VOID_ORB_PUDDLE_CONSUME_CHUNK_SIZE_MIN_PX,
  VOID_ORB_PUDDLE_CONSUME_CHUNK_SIZE_MAX_PX,
  VOID_ORB_PUDDLE_CONSUME_CHUNK_DURATION_MS,
  VOID_ORB_PUDDLE_CONSUME_ARRIVAL_JITTER_PX,
  VOID_ORB_PUDDLE_CONSUME_TINT_WATER_LIGHT,
  VOID_ORB_PUDDLE_CONSUME_TINT_WATER_DARK,
  VOID_ORB_PUDDLE_CONSUME_TINT_MUD_LIGHT,
  VOID_ORB_PUDDLE_CONSUME_TINT_MUD_DARK,
  VOID_ORB_PUDDLE_CONSUME_TINT_LAVA_LIGHT,
  VOID_ORB_PUDDLE_CONSUME_TINT_LAVA_DARK,
} from '../../common/config';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { DIRECTION } from '../../common/common';
import type { CharacterGameObject } from '../common/character-game-object';
import { LavaLayer } from './lava-layer';

/** A single ellipse blob in a lava puddle's rim or core layer. Positions are
 *  in the puddle's local space (centered at 0,0). Cached on the Puddle and
 *  stamped by LavaLayer each frame so the silhouette stays stable between
 *  bubble-timer re-jitters. */
type LavaBlob = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Local rotation in radians. 0 means "axis-aligned" — skip the
   *  save/translate/rotate dance and just fillEllipse. */
  rot: number;
};

type LavaSpeck = {
  sx: number;
  sy: number;
  size: number;
  isBright: boolean;
};

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
export type PuddleKind = 'water' | 'mud' | 'lava';

export class Puddle extends Phaser.GameObjects.Graphics {
  /** All currently-active puddles in the scene. */
  static readonly all: Set<Puddle> = new Set();

  /** Re-apply RUNTIME_CONFIG to every active lava puddle: re-syncs body
   *  (picks up radius / body-frac changes), regenerates the cached blob
   *  layout (picks up jitter / size-frac / blob-count changes), and restarts
   *  the ember timer (picks up interval changes). The shared LavaLayer's
   *  bubble timer is also restarted in case its interval changed. Pure read
   *  of RUNTIME_CONFIG — call this from the debug panel whenever a
   *  lava-related slider moves. */
  static refreshAllLava(): void {
    for (const p of Puddle.all) {
      if (!p.active || p.kind !== 'lava') continue;
      p.refreshLavaBodyAndDraw();
      p.refreshLavaTimers();
    }
    LavaLayer.get()?.refreshTimers();
  }

  /**
   * Drop a single puddle at (x, y). Merges into a nearby existing puddle if one is
   * within PUDDLE_MERGE_RADIUS, otherwise creates a fresh one. Returns the puddle that
   * "owns" the water at this location.
   *
   * Mud-vs-water merging: mud always wins. A water drop landing in an existing
   * mud puddle stays mud; a mud drop landing in an existing water puddle
   * "muddies" it (the existing puddle is converted to mud). Rationale: mud is
   * the contaminated state — once dirty, more clean water doesn't clean it.
   *
   * Cross-kind merging rules:
   *   - same kind: merge (water+water, mud+mud, lava+lava).
   *   - mud onto water: water is muddified, then merges as mud.
   *   - all other cross-kind combinations: NO merge — spawn a new puddle and
   *     let the per-frame combo handlers react (e.g. WaterTornado /
   *     water-puddle vs lava extinguish in GameScene).
   *
   *   Why: before this rule, a water drop landing within a lava puddle's
   *   merge radius was absorbed by the lava (treated as more "water" via
   *   addWater), so casting WaterSpike inside lava would grow the lava
   *   puddle. The extinguish combo expects the water drop to exist as its
   *   own Puddle so it can consume it and add progress.
   */
  static spawnOrMerge(
    scene: Phaser.Scene,
    x: number,
    y: number,
    amount = 1,
    lifetimeMs?: number,
    kind: PuddleKind = 'water',
  ): Puddle {
    for (const p of Puddle.all) {
      if (!p.active || p.scene !== scene) continue;
      if (Phaser.Math.Distance.Between(x, y, p.x, p.y) > PUDDLE_MERGE_RADIUS) continue;
      // mud-onto-water is the one allowed cross-kind merge: water gets
      // dirty, then the same puddle accepts the mud "water" via addWater.
      const mudOntoWater = kind === 'mud' && p.kind === 'water';
      if (!mudOntoWater && p.kind !== kind) continue;
      if (mudOntoWater) p.muddify();
      const effLifetime = lifetimeMs ?? p.#defaultLifetimeMs();
      p.addWater(amount, effLifetime);
      return p;
    }
    return new Puddle(scene, x, y, amount, lifetimeMs, kind);
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
    kind: PuddleKind = 'water',
    /** Optional deterministic seed. Pass a stable number (e.g. derived from the
     *  caster's cast position) so every client computes the SAME puddle
     *  positions for the same spell instance — fixes the WaterTornado
     *  per-client divergence (each client previously ran Math.random()
     *  independently → different positions on every browser). */
    seed?: number,
  ): void {
    // Tiny LCG: stable across browsers, no external dependency. Only used when
    // a seed is provided — undefined falls back to Math.random for legacy callers.
    let s = seed ?? 0;
    const rand = (): number => {
      if (seed === undefined) return Math.random();
      // Numerical Recipes LCG constants — good enough for visual jitter.
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
    for (let i = 0; i < count; i++) {
      // Pre-compute the random values synchronously so the staggered drops
      // don't re-pull from rand() in a different order than another client
      // (delayedCall might fire after another cast's drops on a busy frame).
      const r = Math.sqrt(rand()) * spread;
      const a = rand() * Math.PI * 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      const drop = (): void => {
        if (!scene.scene.isActive()) return;
        Puddle.spawnOrMerge(scene, px, py, amountEach, lifetimeMs, kind);
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
  /** 'water' = clean (electrifies strongly), 'mud' = water+earth mix (slows
   *  walkers, weaker conductivity, future snare on lightning). Public so combo
   *  handlers can read state without a getter. Mutated only via muddify(). */
  kind: PuddleKind;
  declare body: Phaser.Physics.Arcade.Body;
  #destroyTimer: Phaser.Time.TimerEvent | undefined;
  #fadeTween: Phaser.Tweens.Tween | undefined;
  #pushTween: Phaser.Tweens.Tween | undefined;
  // Lava-only: ember emission timer (pure visual — dots that rise up + fade).
  // The "bubble" re-jitter timer that used to live here moved to LavaLayer
  // so every puddle's noise re-randomises in lockstep.
  #lavaEmberTimer: Phaser.Time.TimerEvent | undefined;
  // Lava-only: extinguish progress (0 → 1). Filled by overlapping water
  // sources (WaterTornado per-frame, water-puddle one-shot on consumption).
  // When >= 1 the puddle destroys itself. Pure state — emission of steam
  // puffs is driven by GameScene, which also reads/writes #lavaLastSteamMs.
  #lavaExtinguish: number = 0;
  #lavaLastSteamMs: number = 0;
  // Water/mud-only: evaporate progress (0 → 1) under an overlapping FireArea.
  // Driven by GameScene's fire-area + puddle combo. When >= 1 the puddle
  // destroys itself. Independent meter from #lavaExtinguish above.
  #fireEvaporate: number = 0;
  #lastFireSteamMs: number = 0;
  // Lava-only: cached blob layout. Stamped each frame by LavaLayer.
  // Regenerated on construct / addWater / refresh / bubble-timer tick — never
  // per-frame, so the silhouette is stable between bubble ticks instead of
  // shimmering with fresh random positions every frame.
  #lavaRim: LavaBlob[] = [];
  #lavaCore: LavaBlob[] = [];
  #lavaNoise: LavaSpeck[] = [];

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

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    amount = 1,
    lifetimeMs?: number,
    kind: PuddleKind = 'water',
  ) {
    super(scene, { x, y });
    scene.add.existing(this);
    this.amount = amount;
    this.kind = kind;
    this.radius = this.#computeRadius();
    // Just above the floor tiles, well under characters (which depth-sort by Y), so
    // the puddle never appears on top of a mage standing in it.
    this.setDepth(1.5);

    // Phaser Graphics has no inherent width/height, so we attach a physics body and
    // size it explicitly via setCircle. The body is sensor-only (immovable) — combo
    // handlers call scene.physics.overlap(spell, puddle) to detect interactions.
    scene.physics.add.existing(this);
    this.#syncBody();

    if (this.kind === 'lava') {
      // Lava puddles render through the shared LavaLayer (so overlapping
      // puddles composite into one silhouette). Hide the per-puddle Graphics
      // entirely — its only job from here is to anchor the physics body.
      this.setVisible(false);
      this.regenerateLavaLayout();
      LavaLayer.ensure(scene);
      this.#startLavaFX();
    } else {
      this.#draw();
    }
    this.#scheduleFade(lifetimeMs ?? this.#defaultLifetimeMs());
    Puddle.all.add(this);
  }

  /** Boot the lava-only ember emission loop. Idempotent. */
  #startLavaFX(): void {
    if (this.#lavaEmberTimer) return;
    this.#lavaEmberTimer = this.scene.time.addEvent({
      delay: RUNTIME_CONFIG.PUDDLE_LAVA_EMBER_EMIT_INTERVAL_MS,
      loop: true,
      callback: () => this.#emitLavaEmbers(),
    });
  }

  /** Tear down + restart the lava ember timer so a new
   *  RUNTIME_CONFIG.PUDDLE_LAVA_EMBER_EMIT_INTERVAL_MS takes effect. */
  refreshLavaTimers(): void {
    if (this.kind !== 'lava') return;
    this.#lavaEmberTimer?.destroy();
    this.#lavaEmberTimer = undefined;
    this.#startLavaFX();
  }

  /** Re-sync the body radius (picks up live changes to the radius multiplier
   *  or body fraction) and regenerate the cached blob layout (picks up
   *  blob-count / jitter / size-frac changes). LavaLayer auto-rebuilds on the
   *  next POST_UPDATE, so no explicit dirty flag is needed. */
  refreshLavaBodyAndDraw(): void {
    if (this.kind !== 'lava') return;
    this.radius = this.#computeRadius();
    this.#syncBody();
    this.regenerateLavaLayout();
  }

  /** Pop 1-N tiny graphics dots up from the puddle surface, tween them
   *  upward + fade, destroy on complete. No physics, no damage — feedback
   *  only. The tween's `targets` array is destroyed when the tween ends. */
  #emitLavaEmbers(): void {
    if (!this.active || !this.scene) return;
    const r = this.radius;
    const minN = RUNTIME_CONFIG.PUDDLE_LAVA_EMBER_PER_EMIT_MIN;
    const maxN = RUNTIME_CONFIG.PUDDLE_LAVA_EMBER_PER_EMIT_MAX;
    const count = Math.floor(minN + Math.random() * (maxN - minN + 1));
    for (let i = 0; i < count; i++) {
      // sqrt(random) keeps spawn position area-uniform within the puddle.
      const dist = Math.sqrt(Math.random()) * r * 0.85;
      const angle = Math.random() * Math.PI * 2;
      const sx = this.x + Math.cos(angle) * dist;
      const sy = this.y + Math.sin(angle) * dist;
      const size = RUNTIME_CONFIG.PUDDLE_LAVA_EMBER_SIZE_PX_MIN +
        Math.floor(Math.random() * (RUNTIME_CONFIG.PUDDLE_LAVA_EMBER_SIZE_PX_MAX - RUNTIME_CONFIG.PUDDLE_LAVA_EMBER_SIZE_PX_MIN + 1));
      const tint = PUDDLE_LAVA_EMBER_TINTS[i % PUDDLE_LAVA_EMBER_TINTS.length];

      const ember = this.scene.add.graphics({ x: sx, y: sy });
      ember.fillStyle(tint, 1);
      ember.fillRect(-size / 2, -size / 2, size, size);
      // Above the puddle (depth 1.5) but below characters so they don't
      // float on top of a mage standing in the lava.
      ember.setDepth(2);

      const riseMin = RUNTIME_CONFIG.PUDDLE_LAVA_EMBER_RISE_PX_MIN;
      const riseMax = RUNTIME_CONFIG.PUDDLE_LAVA_EMBER_RISE_PX_MAX;
      const rise = riseMin + Math.random() * (riseMax - riseMin);
      this.scene.tweens.add({
        targets: ember,
        y: sy - rise,
        alpha: 0,
        duration: RUNTIME_CONFIG.PUDDLE_LAVA_EMBER_LIFETIME_MS,
        ease: 'Quad.easeOut',
        onComplete: () => ember.destroy(),
      });
    }
  }

  #defaultLifetimeMs(): number {
    if (this.kind === 'lava') return RUNTIME_CONFIG.PUDDLE_LAVA_LIFETIME_MS;
    if (this.kind === 'mud') return PUDDLE_MUD_LIFETIME_MS;
    return PUDDLE_DEFAULT_LIFETIME_MS;
  }

  /** Convert a water puddle to mud in place. Re-draws with the muddy palette
   *  and stretches the fade timer to mud's default lifetime. Idempotent for
   *  puddles already in mud kind. */
  muddify(): void {
    if (this.kind === 'mud') return;
    this.kind = 'mud';
    this.#draw();
    // Refresh the destroy/fade timer with mud's longer lifetime so a water
    // puddle that was about to expire gets a bit more time once it's dirty.
    this.#destroyTimer?.destroy();
    this.#fadeTween?.stop();
    this.setAlpha(1);
    this.#scheduleFade(PUDDLE_MUD_LIFETIME_MS);
  }

  /** Pour more water in. Grows the body + visual, resets destroy timer.
   *  Lifetime defaults to the puddle's kind-specific default (water vs mud). */
  addWater(delta: number, lifetimeMs?: number): void {
    const effLifetime = lifetimeMs ?? this.#defaultLifetimeMs();
    this.amount = Math.min(PUDDLE_MAX_AMOUNT, this.amount + delta);
    this.radius = this.#computeRadius();
    this.#syncBody();
    if (this.kind === 'lava') {
      // Radius changed → cached blob layout needs to regen at the new scale.
      // LavaLayer picks it up on the next POST_UPDATE.
      this.regenerateLavaLayout();
    } else {
      this.#draw();
    }
    this.#destroyTimer?.destroy();
    this.#fadeTween?.stop();
    this.setAlpha(1);
    this.#scheduleFade(effLifetime);
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
    // Mud is a worse conductor — scale the incoming charge so an electrified
    // mud puddle fades faster (smaller, briefer effect) than electrified water.
    const kindChargeMul = this.kind === 'mud' ? ELEC_PUDDLE_MUD_CHARGE_MULTIPLIER : 1;
    const charge = Math.max(0, Math.min(cap, initialCharge * kindChargeMul));
    this.#charge = Math.max(this.#charge, charge);

    // New spellId every strike → PvP damage dedupe (game-scene.ts:1497) doesn't lock
    // the remote player out forever; they can be re-zapped on a fresh strike.
    this.#electrifiedSpellId = `elec-puddle-${Math.random().toString(36).slice(2, 10)}-${this.scene.time.now}`;
    this.setData('spellId', this.#electrifiedSpellId);
    if (casterId !== undefined) this.setData('casterId', casterId);
    this.setData('spellType', 'ElectrifiedPuddle');
    this.setData('baseDamage', this.#electrifiedDamagePerTick());
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

  /** Glide the puddle by (dx, dy) over `durationMs`. Used by the
   *  WindBolt+Puddle push combo. Each frame the tween advances we re-sync
   *  the body (so the hitbox follows the visual) and, for non-lava puddles,
   *  re-draw the blob layout at the new position. Lava puddles re-stamp
   *  into the shared LavaLayer automatically on its next POST_UPDATE.
   *  A pre-existing push tween on the same puddle is cancelled and replaced
   *  so successive bolts can chain pushes cleanly. */
  public nudgeBy(dx: number, dy: number, durationMs: number = 0): void {
    if (!this.active) return;
    // Snap path (durationMs <= 0) — kept so callers can opt out of the tween.
    if (durationMs <= 0) {
      this.x += dx;
      this.y += dy;
      this.#syncBody();
      if (this.kind === 'lava') this.regenerateLavaLayout();
      else this.#draw();
      return;
    }
    this.#pushTween?.stop();
    const targetX = this.x + dx;
    const targetY = this.y + dy;
    this.#pushTween = this.scene.tweens.add({
      targets: this,
      x: targetX,
      y: targetY,
      duration: durationMs,
      ease: 'Sine.easeOut',
      onUpdate: () => {
        this.#syncBody();
        if (this.kind === 'lava') this.regenerateLavaLayout();
        else this.#draw();
      },
      onComplete: () => {
        this.#syncBody();
        if (this.kind === 'lava') this.regenerateLavaLayout();
        else this.#draw();
        this.#pushTween = undefined;
      },
    });
  }

  get charge(): number {
    return this.#charge;
  }

  get isElectrified(): boolean {
    return this.#electrified;
  }

  /** Read by `baseDamage` consumers in game-scene cross-player overlap. Mud
   *  conducts worse than water — same tick interval, scaled-down per-tick. */
  get baseDamage(): number {
    return this.#electrifiedDamagePerTick();
  }

  #electrifiedDamagePerTick(): number {
    const base = RUNTIME_CONFIG.ELEC_PUDDLE_DAMAGE_PER_TICK;
    return this.kind === 'mud' ? base * ELEC_PUDDLE_MUD_DAMAGE_MULTIPLIER : base;
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
    const base = PUDDLE_BASE_RADIUS_PX + PUDDLE_AMOUNT_RADIUS_PX * Math.min(this.amount, PUDDLE_MAX_AMOUNT);
    // Lava puddles can be uniformly scaled relative to other kinds via the
    // configured multiplier — affects both the visual radius and the body
    // (since #syncBody uses this same value).
    return this.kind === 'lava' ? base * RUNTIME_CONFIG.PUDDLE_LAVA_RADIUS_MULTIPLIER : base;
  }

  /** Resize the Arcade body to match the current visual radius. Lava puddles
   *  use a tighter body (PUDDLE_LAVA_BODY_RADIUS_FRAC × visual radius) so the
   *  damage hitbox can feel fair even when the visual splash extends further
   *  for readability. */
  #syncBody(): void {
    const visualR = this.radius;
    const bodyR = this.kind === 'lava'
      ? visualR * RUNTIME_CONFIG.PUDDLE_LAVA_BODY_RADIUS_FRAC
      : visualR;
    // Phaser Graphics has no displayOrigin → body.x = graphics.x + offsetX. To center
    // the body at (graphics.x, graphics.y) we use offset (-bodyR, -bodyR).
    this.body.setCircle(bodyR, -bodyR, -bodyR);
    this.body.setImmovable(true);
    this.body.setAllowGravity(false);
  }

  #draw(): void {
    // Lava puddles never draw on their own Graphics — LavaLayer composites
    // every lava puddle into one shared RenderTexture. Calling #draw for a
    // lava puddle is a no-op (kept defensive so any future call site doesn't
    // accidentally re-show the per-puddle stack).
    if (this.kind === 'lava') return;
    this.clear();
    const r = this.radius;

    // Deterministic per-puddle blob layout: seed an LCG from the puddle's
    // world position so every client computes the SAME inner-jitter for the
    // same puddle. Without this, hitboxes matched but the visual blob
    // positions diverged frame-to-frame across clients.
    let seedState = (((this.x | 0) * 73856093) ^ ((this.y | 0) * 19349663) ^ (this.kind === 'mud' ? 0x4d756400 : 0)) >>> 0;
    const seededRand = (): number => {
      seedState = (seedState * 1664525 + 1013904223) >>> 0;
      return seedState / 0x100000000;
    };

    // Per-kind palette and base alpha. Mud reads "thicker" via higher
    // per-blob alpha than water's translucent wet look.
    let baseTint: number;
    let baseAlpha: number;
    let highlightTint: number;
    let highlightAlpha: number;
    let highlightW: number;
    let highlightH: number;
    if (this.kind === 'mud') {
      baseTint = PUDDLE_MUD_TINT;
      baseAlpha = 0.7;
      highlightTint = PUDDLE_MUD_HIGHLIGHT_TINT;
      highlightAlpha = 0.5;
      highlightW = r * 0.45;
      highlightH = r * 0.18;
    } else {
      baseTint = PUDDLE_TINT;
      baseAlpha = 0.45;
      highlightTint = PUDDLE_HIGHLIGHT_TINT;
      highlightAlpha = 0.55;
      highlightW = r * 0.55;
      highlightH = r * 0.22;
    }

    // 6 jittered overlapping blobs — organic, no two puddles identical.
    const blobs = 6;
    for (let i = 0; i < blobs; i++) {
      const angle = (i / blobs) * Math.PI * 2 + (seededRand() - 0.5) * 0.6;
      const dist = r * 0.35 * seededRand();
      const rx = r * (0.65 + seededRand() * 0.45);
      const ry = r * (0.45 + seededRand() * 0.4);
      this.fillStyle(baseTint, baseAlpha);
      this.fillEllipse(Math.cos(angle) * dist, Math.sin(angle) * dist, rx * 2, ry * 2);
    }

    // Highlight ellipse — gives water a wet-shine, mud a duller patch.
    this.fillStyle(highlightTint, highlightAlpha);
    this.fillEllipse(-r * 0.18, -r * 0.22, highlightW, highlightH);
  }

  // ─── Lava blob layout cache + stamp helpers ─────────────────────────────
  // The cached layout decouples "randomize blob positions" (timer-driven, at
  // bubble interval) from "paint blobs into the RT" (per-frame, in LavaLayer).
  // Without the cache, LavaLayer's per-frame rebuild would re-randomize
  // positions every frame and the puddle would shimmer instead of bubble.

  /** Re-roll the random positions/sizes/rotations for the rim, core, and
   *  noise blobs based on the puddle's current radius and the live
   *  RUNTIME_CONFIG values. Call after the radius changes (addWater /
   *  refresh) and on every bubble-timer tick (via LavaLayer.rejitterAll). */
  regenerateLavaLayout(): void {
    if (this.kind !== 'lava') return;
    const r = this.radius;
    this.#lavaRim = Puddle.#generateLavaBlobs(
      r,
      RUNTIME_CONFIG.PUDDLE_LAVA_RIM_BLOB_COUNT,
      RUNTIME_CONFIG.PUDDLE_LAVA_RIM_RX_FRAC,
      RUNTIME_CONFIG.PUDDLE_LAVA_RIM_RY_FRAC,
      RUNTIME_CONFIG.PUDDLE_LAVA_RIM_SIZE_JITTER,
      RUNTIME_CONFIG.PUDDLE_LAVA_RIM_OFFSET_FRAC,
      RUNTIME_CONFIG.PUDDLE_LAVA_RIM_ANGLE_JITTER,
      RUNTIME_CONFIG.PUDDLE_LAVA_RIM_ELLIPSE_ROTATION_RANGE,
    );
    this.#lavaCore = Puddle.#generateLavaBlobs(
      r,
      RUNTIME_CONFIG.PUDDLE_LAVA_CORE_BLOB_COUNT,
      RUNTIME_CONFIG.PUDDLE_LAVA_CORE_RX_FRAC,
      RUNTIME_CONFIG.PUDDLE_LAVA_CORE_RY_FRAC,
      RUNTIME_CONFIG.PUDDLE_LAVA_CORE_SIZE_JITTER,
      RUNTIME_CONFIG.PUDDLE_LAVA_CORE_OFFSET_FRAC,
      RUNTIME_CONFIG.PUDDLE_LAVA_CORE_ANGLE_JITTER,
      RUNTIME_CONFIG.PUDDLE_LAVA_CORE_ELLIPSE_ROTATION_RANGE,
    );
    this.#lavaNoise = Puddle.#generateLavaNoise(r);
  }

  /** Add `amount` (0–1) to the lava puddle's extinguish meter. Returns true
   *  if the puddle finished extinguishing on this call (caller decides what
   *  to do with that — typically spawn one last steam burst then let destroy
   *  run on the puddle naturally). No-op for non-lava puddles. */
  addLavaExtinguish(amount: number): boolean {
    if (this.kind !== 'lava') return false;
    if (this.#lavaExtinguish >= 1) return false;
    this.#lavaExtinguish = Math.min(1, this.#lavaExtinguish + amount);
    if (this.#lavaExtinguish >= 1) {
      this.destroy();
      return true;
    }
    return false;
  }

  /** VoidOrb + Puddle: spawn a burst of pixel chunks at this puddle's
   *  position that tween INTO (toX, toY) — the orb's body center. Matches
   *  the EarthWall pulverize-on-shatter chunk burst shape (random source
   *  positions within the puddle's visual disc, random arrival jitter on
   *  the orb, fade + shrink during flight). Tints are kind-appropriate so
   *  water reads cyan, mud earthy, lava ember-orange — the same visual
   *  language as the existing tornado-absorption fragments. Call right
   *  before destroy() so the puddle vanishes as the chunks fly off.
   *
   *  Chunks are scene-owned (not parented to the puddle) so they outlive
   *  the puddle's destruction. */
  spawnDarkConsumeBurst(toX: number, toY: number): void {
    if (!this.scene) return;
    let lightTint: number;
    let darkTint: number;
    if (this.kind === 'water') {
      lightTint = VOID_ORB_PUDDLE_CONSUME_TINT_WATER_LIGHT;
      darkTint = VOID_ORB_PUDDLE_CONSUME_TINT_WATER_DARK;
    } else if (this.kind === 'mud') {
      lightTint = VOID_ORB_PUDDLE_CONSUME_TINT_MUD_LIGHT;
      darkTint = VOID_ORB_PUDDLE_CONSUME_TINT_MUD_DARK;
    } else {
      lightTint = VOID_ORB_PUDDLE_CONSUME_TINT_LAVA_LIGHT;
      darkTint = VOID_ORB_PUDDLE_CONSUME_TINT_LAVA_DARK;
    }
    const sizeRange =
      VOID_ORB_PUDDLE_CONSUME_CHUNK_SIZE_MAX_PX - VOID_ORB_PUDDLE_CONSUME_CHUNK_SIZE_MIN_PX;
    for (let i = 0; i < VOID_ORB_PUDDLE_CONSUME_CHUNK_COUNT; i++) {
      // Area-uniform random offset within the puddle's visual disc.
      const dist = Math.sqrt(Math.random()) * this.radius;
      const angle = Math.random() * Math.PI * 2;
      const sx = this.x + Math.cos(angle) * dist;
      const sy = this.y + Math.sin(angle) * dist;
      const size =
        VOID_ORB_PUDDLE_CONSUME_CHUNK_SIZE_MIN_PX +
        Math.floor(Math.random() * (sizeRange + 1));
      const tint = i % 2 === 0 ? lightTint : darkTint;

      const chunk = this.scene.add.graphics({ x: sx, y: sy });
      chunk.fillStyle(tint, 1);
      chunk.fillRect(-size / 2, -size / 2, size, size);
      // Above puddle depth (1.5) but below characters — same layering rule
      // as the lava embers and earth-wall pulverize chunks.
      chunk.setDepth(5);

      const jx =
        (Math.random() - 0.5) * 2 * VOID_ORB_PUDDLE_CONSUME_ARRIVAL_JITTER_PX;
      const jy =
        (Math.random() - 0.5) * 2 * VOID_ORB_PUDDLE_CONSUME_ARRIVAL_JITTER_PX;
      this.scene.tweens.add({
        targets: chunk,
        x: toX + jx,
        y: toY + jy,
        alpha: 0,
        scale: 0,
        duration: VOID_ORB_PUDDLE_CONSUME_CHUNK_DURATION_MS,
        ease: 'Quad.easeIn',
        onComplete: () => chunk.destroy(),
      });
    }
  }

  /** Read by GameScene to decide whether to emit steam this frame. Returns
   *  true (and stamps the new timestamp) if `intervalMs` has passed since the
   *  last steam emission for this puddle. */
  consumeLavaSteamTick(nowMs: number, intervalMs: number): boolean {
    if (this.kind !== 'lava') return false;
    if (nowMs - this.#lavaLastSteamMs < intervalMs) return false;
    this.#lavaLastSteamMs = nowMs;
    return true;
  }

  /** FireArea + (water|mud) puddle: accumulate evaporate progress. Returns
   *  true when the puddle finished evaporating this call (the puddle is
   *  destroyed before returning). Lava puddles ignore this entirely. */
  addFireEvaporate(amount: number): boolean {
    if (this.kind !== 'water' && this.kind !== 'mud') return false;
    if (this.#fireEvaporate >= 1) return false;
    this.#fireEvaporate = Math.min(1, this.#fireEvaporate + amount);
    if (this.#fireEvaporate >= 1) {
      this.destroy();
      return true;
    }
    return false;
  }

  /** Steam-tick throttle for the fire-evaporate combo (independent of the
   *  lava-extinguish steam-tick on the same puddle). Returns true if it's
   *  time to emit steam this frame. */
  consumeFireSteamTick(nowMs: number, intervalMs: number): boolean {
    if (this.kind !== 'water' && this.kind !== 'mud') return false;
    if (nowMs - this.#lastFireSteamMs < intervalMs) return false;
    this.#lastFireSteamMs = nowMs;
    return true;
  }

  getLavaRim(): readonly LavaBlob[] {
    return this.#lavaRim;
  }
  getLavaCore(): readonly LavaBlob[] {
    return this.#lavaCore;
  }
  getLavaNoise(): readonly LavaSpeck[] {
    return this.#lavaNoise;
  }

  /** Build a blob ring around (0,0). Mirrors the original #drawLavaBlobs
   *  randomization but stores the result instead of drawing immediately. */
  static #generateLavaBlobs(
    r: number,
    blobCount: number,
    rxFrac: number,
    ryFrac: number,
    sizeJitter: number,
    offsetFrac: number,
    angleJitter: number,
    ellipseRotationRange: number,
  ): LavaBlob[] {
    const out: LavaBlob[] = [];
    for (let i = 0; i < blobCount; i++) {
      // Angular position around the center: evenly spaced + random nudge
      // (angleJitter controls the ± range in radians; higher = more clumpy/
      // gappy distribution).
      const angle =
        (i / blobCount) * Math.PI * 2 +
        (Math.random() - 0.5) * angleJitter;
      const dist = r * offsetFrac * Math.random();
      const rx = r * (rxFrac + sizeJitter * Math.random());
      const ry = r * (ryFrac + sizeJitter * Math.random());
      out.push({
        cx: Math.cos(angle) * dist,
        cy: Math.sin(angle) * dist,
        rx,
        ry,
        rot: (Math.random() - 0.5) * ellipseRotationRange,
      });
    }
    return out;
  }

  static #generateLavaNoise(r: number): LavaSpeck[] {
    const out: LavaSpeck[] = [];
    const count = RUNTIME_CONFIG.PUDDLE_LAVA_NOISE_COUNT;
    const minPx = RUNTIME_CONFIG.PUDDLE_LAVA_NOISE_SIZE_MIN_PX;
    const maxPx = RUNTIME_CONFIG.PUDDLE_LAVA_NOISE_SIZE_MAX_PX;
    for (let i = 0; i < count; i++) {
      const dist = Math.sqrt(Math.random()) * r * 0.85;
      const angle = Math.random() * Math.PI * 2;
      out.push({
        sx: Math.cos(angle) * dist,
        sy: Math.sin(angle) * dist,
        size: minPx + Math.random() * (maxPx - minPx),
        isBright: i % 2 === 0,
      });
    }
    return out;
  }

  /** Stamp a cached blob array onto `g` at (0,0). Used by LavaLayer for both
   *  rim and core passes. Phaser's fillEllipse is axis-aligned, so per-blob
   *  rotation goes through save/translate/rotate/restore. */
  static stampLavaBlobsInto(
    g: Phaser.GameObjects.Graphics,
    blobs: readonly LavaBlob[],
    tint: number,
    alpha: number,
  ): void {
    g.fillStyle(tint, alpha);
    for (const b of blobs) {
      if (b.rot === 0) {
        g.fillEllipse(b.cx, b.cy, b.rx * 2, b.ry * 2);
      } else {
        g.save();
        g.translateCanvas(b.cx, b.cy);
        g.rotateCanvas(b.rot);
        g.fillEllipse(0, 0, b.rx * 2, b.ry * 2);
        g.restore();
      }
    }
  }

  /** Stamp the noise specks (alternating bright/dark) onto `g` at (0,0). */
  static stampLavaNoiseInto(
    g: Phaser.GameObjects.Graphics,
    noise: readonly LavaSpeck[],
  ): void {
    for (const n of noise) {
      const tint = n.isBright ? PUDDLE_LAVA_NOISE_TINT_LIGHT : PUDDLE_LAVA_NOISE_TINT_DARK;
      const alpha = n.isBright ? 0.95 : 0.85;
      g.fillStyle(tint, alpha);
      g.fillEllipse(n.sx, n.sy, n.size * 2, n.size * 1.4);
    }
  }

  #tickDamage(): void {
    if (!this.#electrified) return;
    const dmg = this.#electrifiedDamagePerTick();
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

    // Mud is a worse conductor — fewer sparks per tick. Applied on the
    // EXPECTED count (before the floor+Bernoulli) so the fractional remainder
    // still rounds fairly. A 0.5 multiplier ≈ half the sparks of clean water.
    const kindQtyMul = this.kind === 'mud' ? ELEC_PUDDLE_MUD_SPARK_QTY_MULTIPLIER : 1;
    const qtyScaled = qtyExpected * kindQtyMul;

    // qtyExpected is fractional — floor + Bernoulli for the remainder gives the
    // right average without "always rounded up" bias.
    const whole = Math.floor(qtyScaled);
    const frac = qtyScaled - whole;
    const count = whole + (Math.random() < frac ? 1 : 0);

    for (let i = 0; i < count; i++) this.#spawnSpark(wHi, wMid, wLo);
  }

  #spawnSpark(wHi: number, wMid: number, wLo: number): void {
    const totalW = wHi + wMid + wLo;
    if (totalW <= 0) return;
    // Pick a size tier (HI = big & bright, LO = small & faint) by weighted roll.
    const roll = Math.random() * totalW;
    let sizeTier: 'HI' | 'MID' | 'LO';
    if (roll < wHi) sizeTier = 'HI';
    else if (roll < wHi + wMid) sizeTier = 'MID';
    else sizeTier = 'LO';
    const lengthPx = sizeTier === 'HI' ? 7 : sizeTier === 'MID' ? 5 : 3;

    // Uniform random point inside the puddle disc (sqrt for area-uniform — without it
    // sparks would clump at the centre).
    const r = Math.sqrt(Math.random()) * this.radius;
    const a = Math.random() * Math.PI * 2;
    const sx = this.x + Math.cos(a) * r;
    const sy = this.y + Math.sin(a) * r;

    // Procedural zigzag bolt drawn with Graphics — no asset dependency, guaranteed
    // visible. Origin at (sx, sy); each segment alternates 90° from the previous so
    // the result reads as a jagged spark, not a straight line.
    const spark = this.scene.add.graphics({ x: sx, y: sy });
    spark.setDepth(3.5); // above level foreground (depth 2), below characters
    const segCount = sizeTier === 'HI' ? 4 : sizeTier === 'MID' ? 3 : 2;
    const segLen = lengthPx;
    const baseAngle = Math.random() * Math.PI * 2;
    spark.lineStyle(1, 0xffffaa, 1);
    spark.beginPath();
    spark.moveTo(0, 0);
    let px = 0;
    let py = 0;
    for (let i = 0; i < segCount; i++) {
      const jitter = (Math.random() - 0.5) * Math.PI; // ±90°
      const ang = baseAngle + i * (Math.PI / 2) + jitter;
      px += Math.cos(ang) * segLen;
      py += Math.sin(ang) * segLen;
      spark.lineTo(px, py);
    }
    spark.strokePath();
    // Bright core (a brighter overdraw on the same path) for a hot-spark look.
    spark.lineStyle(1, 0xffffff, 0.9);
    spark.fillStyle(0xffffff, 0.9);
    spark.fillCircle(0, 0, sizeTier === 'HI' ? 1.5 : 1);

    // Fade out over the lifetime so it reads as a zap rather than a hard pop-off.
    this.scene.tweens.add({
      targets: spark,
      alpha: 0,
      duration: RUNTIME_CONFIG.ELEC_PUDDLE_SPARK_LIFETIME_MS,
      ease: 'Quad.easeOut',
      onComplete: () => spark.destroy(),
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
    // Lava puddles render through LavaLayer, not through this Graphics, so
    // tweening this.alpha has no visual effect. Just hard-destroy at end of
    // life — the layer's next rebuild drops the puddle from its stamp pass.
    if (this.kind === 'lava') {
      this.#destroyTimer = this.scene.time.delayedCall(lifetimeMs, () => {
        if (this.active) this.destroy();
      });
      return;
    }
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
    this.#pushTween?.stop();
    this.#pushTween = undefined;
    this.#sparkTimer?.destroy();
    this.#damageTimer?.destroy();
    this.#lavaEmberTimer?.destroy();
    this.#lavaEmberTimer = undefined;
    this.#enemiesInArea.clear();
    if (this.#spellGroup && this.#spellGroup.contains(this)) {
      this.#spellGroup.remove(this);
    }
    Puddle.all.delete(this);
    super.destroy(fromScene);
  }
}
