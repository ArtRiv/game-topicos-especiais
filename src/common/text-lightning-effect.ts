import * as Phaser from 'phaser';

// ---------------------------------------------------------------------------
// TextLightningEffect — electrifies a BitmapText on hover, treating each
// character as a "puddle node" the electricity hops between. Reuses the
// procedural zigzag spark technique from puddle.ts (electrified puddle combo)
// so the on-hover effect feels like the in-game lightning, not a separate
// system.
//
// Visuals:
//   1. Small jagged sparks pop in random positions across the text bounds,
//      identical algorithm to puddle.ts #spawnSpark (yellow-white zigzag +
//      bright core, fade out over ~160ms).
//   2. Periodic arcs jump between two random character "nodes" — a jittery
//      polyline drawn between letter centers, mimicking lightning skipping
//      between conductors.
//
// Usage:
//   const fx = new TextLightningEffect(scene, bitmapText);
//   fx.start();   // begins emitting on the next frame
//   fx.stop();    // cleanly halts emission, lets in-flight sparks fade
//   fx.destroy(); // tears down everything; safe to call multiple times
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TUNING — tweak these freely; they're the dials for how the lightning feels.
// All knobs grouped here so iteration is one-file, no archaeology.
// ---------------------------------------------------------------------------

// --- Spark cadence (the small zigzag bolts) -------------------------------
const SPARK_INTERVAL_MS = 15; // how often a single spark spawns
const SPARK_LIFETIME_MS = 160; // matches RUNTIME_CONFIG.ELEC_PUDDLE_SPARK_LIFETIME_MS

// --- Arc cadence (lightning hopping between letters) ---------------------
const ARC_INTERVAL_MS = 220;
const ARC_LIFETIME_MS = 90;

// --- Render depth --------------------------------------------------------
const SPARK_DEPTH_OFFSET = 1; // render above the host text

// --- Spark/arc colors (same yellow-white core as in-game puddle sparks) --
const COLOR_SPARK_OUTER = 0xffffaa;
const COLOR_SPARK_CORE = 0xffffff;
const COLOR_ARC = 0xffffaa;

// --- Text gradient — layered hover tint ----------------------------------
// Three-stop palette painted across the letters: extremes use COLOR_EDGE,
// midway COLOR_MID, and the "hot core" of each character uses COLOR_CORE.
// User-requested palette (parchment-amber, sells the "charged metal" look).
const COLOR_EDGE = 0xde9e41; // outer extremes / cold corners
const COLOR_MID = 0xe8c170; // mid band
const COLOR_CORE = 0xe7d5b3; // hot core
// How often per-character tints re-roll — drives the organic shimmer.
// Lower = faster shimmer; too low (<40ms) looks like static rather than flow.
const TINT_SHIMMER_INTERVAL_MS = 80;
// Per-character noise amplitude added to the base gradient position. 0 = a
// clean centered gradient (will look mathematical); 0.35 = noticeably organic
// without losing the overall "bright middle" shape.
const TINT_NOISE_AMOUNT = 0.35;
// Top corners are slightly hotter than bottom corners — sells "lit from
// above by the lightning". 0 = flat, 0.2 = clear vertical bias.
const TINT_TOP_BIAS = 0.15;

// Linearly interpolate between two 0xRRGGBB integers in RGB space. Cheap and
// good enough at these palette distances; perceptual color space would be
// overkill for menu text shimmer.
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

// Piecewise lerp across the three palette stops: t in [0, 0.5] interpolates
// EDGE→MID, t in [0.5, 1] interpolates MID→CORE. Returns a packed 0xRRGGBB.
function rampColor(t: number): number {
  if (t <= 0.5) return lerpColor(COLOR_EDGE, COLOR_MID, t * 2);
  return lerpColor(COLOR_MID, COLOR_CORE, (t - 0.5) * 2);
}

export class TextLightningEffect {
  readonly #scene: Phaser.Scene;
  readonly #text: Phaser.GameObjects.BitmapText;

  #sparkTimer: Phaser.Time.TimerEvent | undefined;
  #arcTimer: Phaser.Time.TimerEvent | undefined;
  #tintTimer: Phaser.Time.TimerEvent | undefined;
  #liveGraphics = new Set<Phaser.GameObjects.Graphics>();
  #running = false;
  #destroyed = false;
  // Saved tint state so stop() can restore exactly what was there before the
  // effect took over (the menu still does its own setTint on hover/out — we
  // play nicely with it by snapshotting and replaying).
  #savedTint: number | undefined;

  constructor(scene: Phaser.Scene, text: Phaser.GameObjects.BitmapText) {
    this.#scene = scene;
    this.#text = text;
  }

  start(): void {
    if (this.#running || this.#destroyed) return;
    this.#running = true;

    // Snapshot the current uniform tint so stop() can restore it. BitmapText
    // exposes `.tint` as the combined value when all corners agree.
    this.#savedTint = this.#text.tint;

    this.#sparkTimer = this.#scene.time.addEvent({
      delay: SPARK_INTERVAL_MS,
      loop: true,
      callback: () => this.#spawnSpark(),
    });
    this.#arcTimer = this.#scene.time.addEvent({
      delay: ARC_INTERVAL_MS,
      loop: true,
      callback: () => this.#spawnArc(),
    });
    this.#tintTimer = this.#scene.time.addEvent({
      delay: TINT_SHIMMER_INTERVAL_MS,
      loop: true,
      callback: () => this.#paintGradient(),
    });

    // Fire one spark + tint pass immediately so hover feels instant.
    this.#spawnSpark();
    this.#paintGradient();
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    this.#sparkTimer?.destroy();
    this.#arcTimer?.destroy();
    this.#tintTimer?.destroy();
    this.#sparkTimer = undefined;
    this.#arcTimer = undefined;
    this.#tintTimer = undefined;
    // Clear per-character tints and restore the uniform tint the host had
    // before we started. The menu's own pointerout handler will then set its
    // idle tint on top of this — order doesn't matter because both run on
    // the same event.
    if (this.#text && this.#text.active) {
      this.#text.setCharacterTint(0, -1); // -1 length clears all char tints
      if (this.#savedTint !== undefined) {
        this.#text.setTint(this.#savedTint);
      }
    }
    this.#savedTint = undefined;
    // In-flight graphics keep their fade tween; they'll self-destroy.
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.stop();
    for (const g of this.#liveGraphics) {
      g.destroy();
    }
    this.#liveGraphics.clear();
  }

  // ---- internals ----------------------------------------------------------

  // Layered gradient pass — paints every character with a 4-corner tint
  // sampled from the COLOR_EDGE → COLOR_MID → COLOR_CORE palette, with
  // per-character + per-corner noise so the bands feel organic, not striped.
  // Re-run periodically by #tintTimer to give the text a subtle "live charge"
  // shimmer.
  #paintGradient(): void {
    if (!this.#running) return;
    if (!this.#text || !this.#text.active) return;
    const len = this.#text.text?.length ?? 0;
    if (len === 0) return;

    // "Center" of the word in [0,1] space — letters near here lean toward
    // the COLOR_CORE; letters at the ends lean toward COLOR_EDGE. We jitter
    // the center slightly each pass so the hot zone drifts a bit, selling
    // the "current flowing through" feel.
    const centerDrift = (Math.random() - 0.5) * 0.15;
    const center = 0.5 + centerDrift;

    for (let i = 0; i < len; i++) {
      // Position of this char along the word, mapped to "distance from
      // center" in [0,1]. Edge letters → 1, center letters → 0.
      const pos = len === 1 ? 0 : i / (len - 1);
      const distFromCenter = Math.min(1, Math.abs(pos - center) * 2);

      // Each corner gets its own jittered sample so adjacent corners pick up
      // slightly different colors → soft, painterly transitions rather than
      // a hard left/right gradient. Top corners biased hotter than bottom →
      // letters look "lit from above" by the lightning.
      const sampleTop = (): number => {
        const noise = (Math.random() - 0.5) * 2 * TINT_NOISE_AMOUNT;
        // t=0 means edge color, t=1 means core color.
        const t = Math.max(0, Math.min(1, 1 - distFromCenter + TINT_TOP_BIAS + noise));
        return rampColor(t);
      };
      const sampleBot = (): number => {
        const noise = (Math.random() - 0.5) * 2 * TINT_NOISE_AMOUNT;
        const t = Math.max(0, Math.min(1, 1 - distFromCenter - TINT_TOP_BIAS + noise));
        return rampColor(t);
      };

      // tintFill=true so white pixels in the bitmap font become exactly these
      // colors (rather than being multiplied with the existing tint, which
      // would dim the result).
      this.#text.setCharacterTint(i, 1, true, sampleTop(), sampleTop(), sampleBot(), sampleBot());
    }
  }

  // Returns world-space bounds (x/y is top-left, includes origin + scale).
  // Returns null if the text was destroyed underneath us.
  #worldBounds(): { x: number; y: number; w: number; h: number } | null {
    if (!this.#text || !this.#text.active || !this.#text.scene) return null;
    const b = this.#text.getTextBounds(false).global;
    if (!b || b.width <= 0 || b.height <= 0) return null;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  // World-space center for a slot along the text. Treats the text as evenly
  // divided into N "letter nodes" — fine for press_start_2p (monospace) and
  // gives a good enough hop pattern for variable-width fonts.
  #nodeCenter(slot: number, nodeCount: number): { x: number; y: number } | null {
    const b = this.#worldBounds();
    if (!b) return null;
    const t = (slot + 0.5) / nodeCount;
    return { x: b.x + b.w * t, y: b.y + b.h * 0.5 };
  }

  #spawnSpark(): void {
    if (!this.#running) return;
    const b = this.#worldBounds();
    if (!b) return;

    // Sample uniformly across the text bounds with slight vertical bias toward
    // the middle of the line — that's where letter mass is densest and where
    // sparks read most clearly against the background.
    const sx = b.x + Math.random() * b.w;
    const sy = b.y + (0.15 + Math.random() * 0.7) * b.h;

    // Procedural zigzag — segments alternate 90° from the previous so the
    // result reads as a jagged bolt, not a straight line. Algorithm cloned
    // verbatim from puddle.ts #spawnSpark.
    const spark = this.#scene.add.graphics({ x: sx, y: sy });
    spark.setDepth((this.#text.depth ?? 0) + SPARK_DEPTH_OFFSET);

    // Three size tiers mirror the in-game puddle spark variety.
    const roll = Math.random();
    const sizeTier: 'HI' | 'MID' | 'LO' = roll < 0.2 ? 'HI' : roll < 0.6 ? 'MID' : 'LO';
    const segLen = sizeTier === 'HI' ? 5 : sizeTier === 'MID' ? 4 : 3;
    const segCount = sizeTier === 'HI' ? 4 : sizeTier === 'MID' ? 3 : 2;

    const baseAngle = Math.random() * Math.PI * 2;
    spark.lineStyle(1, COLOR_SPARK_OUTER, 1);
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
    spark.fillStyle(COLOR_SPARK_CORE, 0.9);
    spark.fillCircle(0, 0, sizeTier === 'HI' ? 1.5 : 1);

    this.#trackAndFade(spark, SPARK_LIFETIME_MS);
  }

  #spawnArc(): void {
    if (!this.#running) return;
    const b = this.#worldBounds();
    if (!b) return;

    // Estimate letter count from text length. For arcs we want at least two
    // nodes; cap node count so very long strings don't produce arcs that hop
    // across nearly-adjacent positions and look like noise.
    const textLen = this.#text.text?.length ?? 0;
    const nodeCount = Math.max(2, Math.min(textLen, 16));
    const i = Math.floor(Math.random() * nodeCount);
    let j = Math.floor(Math.random() * nodeCount);
    if (i === j) j = (j + 1) % nodeCount;

    const a = this.#nodeCenter(i, nodeCount);
    const c = this.#nodeCenter(j, nodeCount);
    if (!a || !c) return;

    // Build a jagged polyline from a to c, with perpendicular jitter scaled
    // by distance. ~4 segments is enough to read as electricity at this size.
    const arc = this.#scene.add.graphics();
    arc.setDepth((this.#text.depth ?? 0) + SPARK_DEPTH_OFFSET);
    arc.lineStyle(1, COLOR_ARC, 1);
    arc.beginPath();
    arc.moveTo(a.x, a.y);

    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / (dist || 1); // perpendicular unit vector
    const ny = dx / (dist || 1);
    const segs = 4;
    const jitterMag = Math.min(3, dist * 0.18);
    for (let s = 1; s < segs; s++) {
      const t = s / segs;
      const baseX = a.x + dx * t;
      const baseY = a.y + dy * t;
      const j2 = (Math.random() - 0.5) * 2 * jitterMag;
      arc.lineTo(baseX + nx * j2, baseY + ny * j2);
    }
    arc.lineTo(c.x, c.y);
    arc.strokePath();

    // Bright endpoints — sells the arc as connecting two charged nodes.
    arc.fillStyle(COLOR_SPARK_CORE, 0.9);
    arc.fillCircle(a.x, a.y, 1);
    arc.fillCircle(c.x, c.y, 1);

    this.#trackAndFade(arc, ARC_LIFETIME_MS);
  }

  #trackAndFade(g: Phaser.GameObjects.Graphics, lifetimeMs: number): void {
    this.#liveGraphics.add(g);
    this.#scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: lifetimeMs,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.#liveGraphics.delete(g);
        g.destroy();
      },
    });
  }
}
