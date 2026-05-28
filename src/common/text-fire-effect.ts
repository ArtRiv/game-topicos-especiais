import * as Phaser from 'phaser';

// ---------------------------------------------------------------------------
// TextFireEffect — sets a BitmapText "on fire" on hover. Reuses the
// procedural lava-ember pattern from puddle.ts (#emitLavaEmbers, lines
// 311-348) so the visual language matches the in-game lava puddles. The
// same yellow/orange tints used by `PUDDLE_LAVA_EMBER_TINTS` show up as the
// rising embers' colors here.
//
// Visuals:
//   1. Vertical heat ramp painted on each letter: white / very-light-yellow
//      / light-orange-yellow at the base, transitioning to orange and dark
//      red at the top. A slow horizontal sine wave shifts the bright base
//      sideways across the word so the fire reads as fluid, not static.
//   2. Pixel embers escape mostly from the top of the letters (as if
//      burning from within), tinted in the cool orange/dark-red end of
//      the palette. A minority spawn from the letter body for variety.
//      Both tweens clone the lava-puddle ember rise + fade.
//
// Usage:
//   const fx = new TextFireEffect(scene, bitmapText);
//   fx.start();
//   fx.stop();
//   fx.destroy();
// ---------------------------------------------------------------------------

// --- Ember cadence -------------------------------------------------------
const EMBER_EMIT_INTERVAL_MS = 28;
const EMBER_PER_EMIT_MIN = 4;
const EMBER_PER_EMIT_MAX = 7;

// --- Ember motion --------------------------------------------------------
const EMBER_LIFETIME_MS = 850;
const EMBER_SIZE_PX_MIN = 1;
const EMBER_SIZE_PX_MAX = 2;
const EMBER_RISE_PX_MIN = 26;
const EMBER_RISE_PX_MAX = 36;
const EMBER_HORIZONTAL_DRIFT_PX = 8;

// --- Ember spawn region --------------------------------------------------
const EMBER_SPAWN_Y_MIN = -0.22;
const EMBER_SPAWN_Y_MAX = 0.05;

const EMBER_BODY_SPAWN_CHANCE = 0.025;
const EMBER_BODY_SPAWN_Y_MIN = 0.25;
const EMBER_BODY_SPAWN_Y_MAX = 0.55;

// --- Render depth --------------------------------------------------------
const EMBER_DEPTH_OFFSET = 3;

// --- Ember palette -------------------------------------------------------
const EMBER_TINTS: readonly number[] = [0xda863e, 0xcf573c, 0xcf573c, 0xcf573c];

// --- Text gradient -------------------------------------------------------
const COLOR_STOP_0 = 0xebede9;
const COLOR_STOP_1 = 0xe7d5b3;
const COLOR_STOP_2 = 0xe8c170;
const COLOR_STOP_3 = 0xda863e;
const COLOR_STOP_4 = 0xcf573c;

// White stays at the bottom longer,
// orange comes earlier,
// red owns more of the top.
const COLOR_STOP_POSITIONS: readonly number[] = [0.0, 0.11, 0.24, 0.38, 1.0];

const TINT_SHIMMER_INTERVAL_MS = 44;
const TINT_NOISE_AMOUNT = 0.065;
const TINT_HORIZONTAL_WAVE_AMOUNT = 0.04;
const TINT_WAVE_SPEED = 0.0036;

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

const COLOR_STOPS: readonly number[] = [COLOR_STOP_0, COLOR_STOP_1, COLOR_STOP_2, COLOR_STOP_3, COLOR_STOP_4];

// Five-stop piecewise lerp along the 0..1 ramp. t < 0 clamps to bottom
// color, t > 1 clamps to top color. Finds the segment t lands in and
// interpolates between its two endpoints.
function rampColor(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < COLOR_STOP_POSITIONS.length - 1; i++) {
    const lo = COLOR_STOP_POSITIONS[i];
    const hi = COLOR_STOP_POSITIONS[i + 1];
    if (clamped <= hi) {
      const local = (clamped - lo) / (hi - lo || 1);
      return lerpColor(COLOR_STOPS[i], COLOR_STOPS[i + 1], local);
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1];
}

export class TextFireEffect {
  readonly #scene: Phaser.Scene;
  readonly #text: Phaser.GameObjects.BitmapText;

  #emberTimer: Phaser.Time.TimerEvent | undefined;
  #tintTimer: Phaser.Time.TimerEvent | undefined;
  #liveGraphics = new Set<Phaser.GameObjects.Graphics>();
  #running = false;
  #destroyed = false;
  #savedTint: number | undefined;

  constructor(scene: Phaser.Scene, text: Phaser.GameObjects.BitmapText) {
    this.#scene = scene;
    this.#text = text;
  }

  start(): void {
    if (this.#running || this.#destroyed) return;
    this.#running = true;
    this.#savedTint = this.#text.tint;

    this.#emberTimer = this.#scene.time.addEvent({
      delay: EMBER_EMIT_INTERVAL_MS,
      loop: true,
      callback: () => this.#emitEmbers(),
    });
    this.#tintTimer = this.#scene.time.addEvent({
      delay: TINT_SHIMMER_INTERVAL_MS,
      loop: true,
      callback: () => this.#paintGradient(),
    });

    // Fire one batch + tint pass immediately so hover feels instant.
    this.#emitEmbers();
    this.#paintGradient();
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    this.#emberTimer?.destroy();
    this.#tintTimer?.destroy();
    this.#emberTimer = undefined;
    this.#tintTimer = undefined;
    if (this.#text && this.#text.active) {
      this.#text.setCharacterTint(0, -1); // clear all char tints
      if (this.#savedTint !== undefined) {
        this.#text.setTint(this.#savedTint);
      }
    }
    this.#savedTint = undefined;
    // In-flight embers keep their rise + fade tween; they'll self-destroy.
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

  // Vertical heat ramp: each letter's top corners sample from the cool end
  // of the palette (orange → dark red) and bottom corners sample from the
  // hot end (white → light yellow). A slow horizontal sine wave shifts where
  // along the word the "hottest" zone lives, so the bright base appears to
  // breathe sideways. Per-corner noise re-rolled every shimmer tick keeps
  // adjacent letters out-of-phase, which kills the static-band look.
  #paintGradient(): void {
    if (!this.#running) return;
    if (!this.#text || !this.#text.active) return;
    const len = this.#text.text?.length ?? 0;
    if (len === 0) return;

    // Wall-clock-driven phase: drives the slow horizontal "lick" of the
    // hot zone independently of the shimmer tick rate, so changing
    // TINT_SHIMMER_INTERVAL_MS doesn't speed up the wave.
    const now = this.#scene.time.now;
    const wavePhase = now * TINT_WAVE_SPEED;

    for (let i = 0; i < len; i++) {
      // 0 at the left of the word, 1 at the right.
      const xPos = len === 1 ? 0.5 : i / (len - 1);
      // Sine wave shifts the cool/hot baseline horizontally. The result is
      // added to each corner's t, so letters near the wave's hot phase end
      // up uniformly hotter than letters near the wave's cool phase. Range
      // ± TINT_HORIZONTAL_WAVE_AMOUNT.
      const waveOffset = Math.sin(wavePhase + xPos * Math.PI * 1.7) * TINT_HORIZONTAL_WAVE_AMOUNT;

      // Top corners → cool end of the palette (t closer to 1 = dark red).
      // Bottom corners → hot end of the palette (t closer to 0 = white).
      // Bias each by the wave offset so the whole letter slides along the
      // ramp in lockstep with the snake.
      const baseTopT = 0.85; // top corner default position on the ramp
      const baseBotT = 0.05; // bottom corner default position on the ramp

      const sampleTop = (): number => {
        const noise = (Math.random() - 0.5) * 2 * TINT_NOISE_AMOUNT;
        return rampColor(baseTopT + waveOffset + noise);
      };
      const sampleBot = (): number => {
        const noise = (Math.random() - 0.5) * 2 * TINT_NOISE_AMOUNT;
        // Subtract the wave so the hot zone of the snake reads as
        // "this letter's base is currently the brightest" rather than
        // top + bottom both shifting toward the same color.
        return rampColor(baseBotT - waveOffset * 0.5 + noise);
      };

      // Each corner samples independently — top-left ≠ top-right etc. —
      // so adjacent letters bleed at their seams instead of looking like
      // tiles with hard edges.
      this.#text.setCharacterTint(i, 1, true, sampleTop(), sampleTop(), sampleBot(), sampleBot());
    }
  }

  #worldBounds(): { x: number; y: number; w: number; h: number } | null {
    if (!this.#text || !this.#text.active || !this.#text.scene) return null;
    const b = this.#text.getTextBounds(false).global;
    if (!b || b.width <= 0 || b.height <= 0) return null;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  // Spawn a batch of upward-rising pixel embers. Most embers spawn just
  // above the top edge of the text ("burning from within" → sparks
  // escaping upward); a smaller fraction spawn from the letter body to
  // keep the top edge from looking like a hard emission line.
  // Algorithm cloned from puddle.ts #emitLavaEmbers — same pattern, scaled
  // for menu text and re-tinted to the cooler ember palette.
  #emitEmbers(): void {
    if (!this.#running) return;
    const b = this.#worldBounds();
    if (!b) return;

    const count = Math.floor(EMBER_PER_EMIT_MIN + Math.random() * (EMBER_PER_EMIT_MAX - EMBER_PER_EMIT_MIN + 1));
    for (let i = 0; i < count; i++) {
      // Body roll: a small fraction of embers spawn in the letter interior
      // for variety; the rest spawn above the top edge as the design asks.
      const fromBody = Math.random() < EMBER_BODY_SPAWN_CHANCE;
      const yMin = fromBody ? EMBER_BODY_SPAWN_Y_MIN : EMBER_SPAWN_Y_MIN;
      const yMax = fromBody ? EMBER_BODY_SPAWN_Y_MAX : EMBER_SPAWN_Y_MAX;

      const sx = b.x + Math.random() * b.w;
      const sy = b.y + (yMin + Math.random() * (yMax - yMin)) * b.h;
      const size = EMBER_SIZE_PX_MIN + Math.floor(Math.random() * (EMBER_SIZE_PX_MAX - EMBER_SIZE_PX_MIN + 1));
      const tint = EMBER_TINTS[Math.floor(Math.random() * EMBER_TINTS.length)];

      const ember = this.#scene.add.graphics({ x: sx, y: sy });
      ember.fillStyle(tint, 1);
      ember.fillRect(-size / 2, -size / 2, size, size);
      ember.setDepth((this.#text.depth ?? 0) + EMBER_DEPTH_OFFSET);

      const rise = EMBER_RISE_PX_MIN + Math.random() * (EMBER_RISE_PX_MAX - EMBER_RISE_PX_MIN);
      const drift = (Math.random() - 0.5) * 2 * EMBER_HORIZONTAL_DRIFT_PX;

      this.#liveGraphics.add(ember);
      this.#scene.tweens.add({
        targets: ember,
        x: sx + drift,
        y: sy - rise,
        alpha: 0,
        duration: EMBER_LIFETIME_MS,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.#liveGraphics.delete(ember);
          ember.destroy();
        },
      });
    }
  }
}
