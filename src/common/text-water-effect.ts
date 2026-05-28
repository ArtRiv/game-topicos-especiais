import * as Phaser from 'phaser';

// ---------------------------------------------------------------------------
// TextWaterEffect — makes a BitmapText look wet on hover. Reuses the
// procedural droplet pattern from puddle.ts (#emitLavaEmbers, lines
// 313-348) — same spawn/tween skeleton as the lava embers, but inverted to
// fall downward with gravity-like ease, and re-tinted with the in-game
// water palette (PUDDLE_TINT 0x3a6fd6 + PUDDLE_HIGHLIGHT_TINT 0xaaddff)
// from src/common/config/spells/water.ts so the menu droplets match the
// game's water spells.
//
// Visuals:
//   1. Vertical "wet" gradient on each letter: light cyan / near-white at
//      the top (light reflecting off the wet surface), darkening into the
//      saturated puddle blue at the bottom (where water pools deepest).
//      A slow horizontal sine wave drifts the highlights sideways — like
//      light playing across a wet surface.
//   2. Water droplets bead at the bottom edge of the text and fall
//      downward with gravity-like easing, stretching as they drop
//      (surface-tension cue), then fade out. A small fraction "cling"
//      briefly before releasing, mimicking the moment of drop formation.
//
// Usage:
//   const fx = new TextWaterEffect(scene, bitmapText);
//   fx.start();
//   fx.stop();
//   fx.destroy();
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TUNING — all dials grouped at the top. Same convention as the lightning
// and fire effects: change a number, save, see the result.
// ---------------------------------------------------------------------------

// --- Droplet cadence -----------------------------------------------------
const DROPLET_EMIT_INTERVAL_MS = 110; // how often a droplet batch spawns
const DROPLET_PER_EMIT_MIN = 1; // smallest batch size per tick
const DROPLET_PER_EMIT_MAX = 2; // largest batch size per tick

// --- Droplet motion ------------------------------------------------------
const DROPLET_LIFETIME_MS = 620; // total time on screen (cling + fall + fade)
const DROPLET_FALL_PX_MIN = 14; // smallest downward travel distance
const DROPLET_FALL_PX_MAX = 28; // largest downward travel distance
const DROPLET_HORIZONTAL_DRIFT_PX = 1.5; // ± horizontal wander while falling

// --- Droplet shape -------------------------------------------------------
// Droplets are tiny rounded rectangles (drawn as fillRect at this size, the
// pixel-art renderer naturally reads them as round at 1-2px). Larger sizes
// look like beads of water; smaller sizes look like mist.
const DROPLET_SIZE_PX_MIN = 1;
const DROPLET_SIZE_PX_MAX = 2;
// Mid-fall stretch factor on the Y axis — sells "surface tension elongating
// the drop." 1.0 = no stretch; 2.5 = noticeable teardrop shape mid-fall.
const DROPLET_STRETCH_Y = 2.2;

// --- Droplet cling -------------------------------------------------------
// Fraction of droplets that "cling" at the bottom edge briefly before
// releasing. Looks like a drop forming under surface tension before it
// finally falls. 0 = all droplets release immediately.
const DROPLET_CLING_CHANCE = 0.35;
const DROPLET_CLING_DURATION_MS_MIN = 80;
const DROPLET_CLING_DURATION_MS_MAX = 220;

// --- Droplet spawn region ------------------------------------------------
// Where along the text height droplets emerge from. 0 = top, 1 = bottom.
// 0.92-1.08 = a thin band straddling the bottom edge of the text, so drops
// look like they're forming on the underside of each glyph.
const DROPLET_SPAWN_Y_MIN = 0.92;
const DROPLET_SPAWN_Y_MAX = 1.08;

// --- Render depth --------------------------------------------------------
const DROPLET_DEPTH_OFFSET = 1; // render above the host text

// --- Droplet palette -----------------------------------------------------
// Same tints as in-game water puddles (PUDDLE_TINT + PUDDLE_HIGHLIGHT_TINT
// from src/common/config/spells/water.ts) so on-wet text reads as the
// same water. The bright cyan stop covers droplets caught in the
// highlight zone; the rest land on the darker blues for body.
const DROPLET_TINTS: readonly number[] = [0x3a6fd6, 0x4d8de8, 0xaaddff, 0x3a6fd6];

// --- Text gradient — vertical wet ramp ----------------------------------
// Light at the top (specular highlight on the wet surface), saturated blue
// at the bottom (where water collects deepest inside the glyph). Stops:
//   t = 0   → top reflection: near-white cyan
//   t = 0.3 → bright cyan highlight
//   t = 0.65→ mid blue
//   t = 1   → deepest pool: PUDDLE_TINT
const COLOR_STOP_0 = 0xeaf6ff; // near-white cyan — top-most
const COLOR_STOP_1 = 0xaaddff; // PUDDLE_HIGHLIGHT_TINT (in-game)
const COLOR_STOP_2 = 0x4d8de8; // mid blue
const COLOR_STOP_3 = 0x3a6fd6; // PUDDLE_TINT (in-game) — bottom-most

// Positions of each stop along the 0..1 ramp. Must be sorted ascending.
// Tweak to shift the bands — e.g. push STOP_1 from 0.3 to 0.5 to enlarge
// the bright highlight band.
const COLOR_STOP_POSITIONS: readonly number[] = [0.0, 0.3, 0.65, 1.0];

const TINT_SHIMMER_INTERVAL_MS = 90; // higher than fire — water moves slower
const TINT_NOISE_AMOUNT = 0.08; // lower than fire — wet surfaces are calmer
const TINT_HORIZONTAL_WAVE_AMOUNT = 0.07; // ± offset for the "light on water" snake
const TINT_WAVE_SPEED = 0.0018; // radians/ms — slow ripple, not chop

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

const COLOR_STOPS: readonly number[] = [COLOR_STOP_0, COLOR_STOP_1, COLOR_STOP_2, COLOR_STOP_3];

// Four-stop piecewise lerp along the 0..1 ramp. t < 0 clamps to top color,
// t > 1 clamps to bottom color.
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

export class TextWaterEffect {
  readonly #scene: Phaser.Scene;
  readonly #text: Phaser.GameObjects.BitmapText;

  #dropletTimer: Phaser.Time.TimerEvent | undefined;
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

    this.#dropletTimer = this.#scene.time.addEvent({
      delay: DROPLET_EMIT_INTERVAL_MS,
      loop: true,
      callback: () => this.#emitDroplets(),
    });
    this.#tintTimer = this.#scene.time.addEvent({
      delay: TINT_SHIMMER_INTERVAL_MS,
      loop: true,
      callback: () => this.#paintGradient(),
    });

    // Fire one batch + tint pass immediately so hover feels instant.
    this.#emitDroplets();
    this.#paintGradient();
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    this.#dropletTimer?.destroy();
    this.#tintTimer?.destroy();
    this.#dropletTimer = undefined;
    this.#tintTimer = undefined;
    if (this.#text && this.#text.active) {
      this.#text.setCharacterTint(0, -1); // clear all char tints
      if (this.#savedTint !== undefined) {
        this.#text.setTint(this.#savedTint);
      }
    }
    this.#savedTint = undefined;
    // In-flight droplets keep their fall + fade tween; they'll self-destroy.
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

  // Vertical wet ramp: top corners sample from the highlight end (near-white
  // cyan), bottom corners sample from the deep-pool end (PUDDLE_TINT). A
  // very slow horizontal sine wave drifts the highlight sideways so the
  // wet surface looks subtly alive rather than static-printed.
  #paintGradient(): void {
    if (!this.#running) return;
    if (!this.#text || !this.#text.active) return;
    const len = this.#text.text?.length ?? 0;
    if (len === 0) return;

    const now = this.#scene.time.now;
    const wavePhase = now * TINT_WAVE_SPEED;

    for (let i = 0; i < len; i++) {
      const xPos = len === 1 ? 0.5 : i / (len - 1);
      // Two phase offsets at different frequencies → the highlight band
      // doesn't move in a clean repeating pattern, which sells "water"
      // better than a single sine. Magnitude clamped by
      // TINT_HORIZONTAL_WAVE_AMOUNT so the gradient shape stays readable.
      const waveOffset =
        (Math.sin(wavePhase + xPos * Math.PI * 1.3) + Math.sin(wavePhase * 0.7 + xPos * Math.PI * 2.1) * 0.5) *
        TINT_HORIZONTAL_WAVE_AMOUNT *
        0.66;

      // Top corners → highlight end (t near 0 = near-white cyan).
      // Bottom corners → deep end (t near 1 = PUDDLE_TINT).
      const baseTopT = 0.08;
      const baseBotT = 0.92;

      const sampleTop = (): number => {
        const noise = (Math.random() - 0.5) * 2 * TINT_NOISE_AMOUNT;
        return rampColor(baseTopT - waveOffset + noise);
      };
      const sampleBot = (): number => {
        const noise = (Math.random() - 0.5) * 2 * TINT_NOISE_AMOUNT;
        return rampColor(baseBotT + waveOffset * 0.5 + noise);
      };

      this.#text.setCharacterTint(i, 1, true, sampleTop(), sampleTop(), sampleBot(), sampleBot());
    }
  }

  #worldBounds(): { x: number; y: number; w: number; h: number } | null {
    if (!this.#text || !this.#text.active || !this.#text.scene) return null;
    const b = this.#text.getTextBounds(false).global;
    if (!b || b.width <= 0 || b.height <= 0) return null;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  // Spawn a batch of droplets at the bottom edge of the text and tween them
  // downward with gravity-like ease + vertical stretch + fade. Some droplets
  // briefly "cling" before releasing. Algorithm derived from puddle.ts
  // #emitLavaEmbers but inverted (downward, not upward) and given a
  // teardrop-shaping scaleY tween mid-fall.
  #emitDroplets(): void {
    if (!this.#running) return;
    const b = this.#worldBounds();
    if (!b) return;

    const count = Math.floor(
      DROPLET_PER_EMIT_MIN + Math.random() * (DROPLET_PER_EMIT_MAX - DROPLET_PER_EMIT_MIN + 1),
    );
    for (let i = 0; i < count; i++) {
      const sx = b.x + Math.random() * b.w;
      const sy =
        b.y +
        (DROPLET_SPAWN_Y_MIN + Math.random() * (DROPLET_SPAWN_Y_MAX - DROPLET_SPAWN_Y_MIN)) * b.h;
      const size =
        DROPLET_SIZE_PX_MIN + Math.floor(Math.random() * (DROPLET_SIZE_PX_MAX - DROPLET_SIZE_PX_MIN + 1));
      const tint = DROPLET_TINTS[Math.floor(Math.random() * DROPLET_TINTS.length)];

      const droplet = this.#scene.add.graphics({ x: sx, y: sy });
      droplet.fillStyle(tint, 1);
      droplet.fillRect(-size / 2, -size / 2, size, size);
      droplet.setDepth((this.#text.depth ?? 0) + DROPLET_DEPTH_OFFSET);

      const fall = DROPLET_FALL_PX_MIN + Math.random() * (DROPLET_FALL_PX_MAX - DROPLET_FALL_PX_MIN);
      const drift = (Math.random() - 0.5) * 2 * DROPLET_HORIZONTAL_DRIFT_PX;

      const wantsCling = Math.random() < DROPLET_CLING_CHANCE;
      const clingMs = wantsCling
        ? DROPLET_CLING_DURATION_MS_MIN +
          Math.random() * (DROPLET_CLING_DURATION_MS_MAX - DROPLET_CLING_DURATION_MS_MIN)
        : 0;
      // Fall duration uses what's left of the total lifetime after the
      // cling phase, so a long cling means a quick fall and vice versa —
      // total on-screen time stays predictable for cleanup timing.
      const fallMs = Math.max(120, DROPLET_LIFETIME_MS - clingMs);

      this.#liveGraphics.add(droplet);

      const startFall = (): void => {
        if (this.#destroyed || !droplet.active) return;
        // Cubic.In is the "accelerating downward" ease — slow at first then
        // fast, which mimics gravity better than the easeOut used by the
        // fire embers (those rise + decelerate to mimic buoyancy).
        this.#scene.tweens.add({
          targets: droplet,
          x: sx + drift,
          y: sy + fall,
          alpha: 0,
          scaleY: DROPLET_STRETCH_Y,
          duration: fallMs,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            this.#liveGraphics.delete(droplet);
            droplet.destroy();
          },
        });
      };

      if (wantsCling) {
        // While clinging, give the droplet a subtle "swelling" tween — it
        // grows in scaleX a hair before releasing, like a real drop pulling
        // mass off the surface tension.
        this.#scene.tweens.add({
          targets: droplet,
          scaleX: 1.25,
          duration: clingMs,
          ease: 'Sine.easeInOut',
          onComplete: startFall,
        });
      } else {
        startFall();
      }
    }
  }
}
