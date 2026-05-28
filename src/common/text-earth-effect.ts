import * as Phaser from 'phaser';

// ---------------------------------------------------------------------------
// TextEarthEffect — turns a BitmapText into crumbling stone on hover.
// Reuses the chunk-spawn pattern from earth-wall-pillar.ts (#spawnDarkChunks,
// lines 165-208) with the canonical in-game palette (EARTH_WALL_PULVERIZE
// TINT_LIGHT 0x8b6332 + TINT_DARK 0x4a3520 from src/common/config/spells/
// earth.ts) so the menu dust matches the game's pulverize bursts.
//
// Visuals:
//   1. A single static stone tint replaces the host text's color while
//      hovered — earth doesn't pulse, shimmer, or flow, so the letters
//      stay rock-solid and the motion lives entirely in the particles.
//   2. Dust chunks spray outward in random directions from the letter
//      body, shrinking and fading. Clone of #spawnDarkChunks, retargeted
//      from "fly toward orb" to "drift outward + slight gravity."
//
// Usage:
//   const fx = new TextEarthEffect(scene, bitmapText);
//   fx.start();
//   fx.stop();
//   fx.destroy();
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TUNING — all dials grouped at the top. Same convention as the other
// elemental effects.
// ---------------------------------------------------------------------------

// --- Text color ----------------------------------------------------------
// Single static stone tint applied to the whole text while hovered. Default
// is EARTH_WALL_PULVERIZE_TINT_LIGHT (0x8b6332) — the canonical mid-stone
// from the in-game pulverize palette. Swap for any flat color you like:
//   0x4a3520 = darker stone (PULVERIZE_TINT_DARK)
//   0xc7a47a = pale weathered sandstone
//   0xa07440 = warmer brown
const STONE_COLOR = 0x8b6332;

// --- Chunk cadence -------------------------------------------------------
const CHUNK_EMIT_INTERVAL_MS = 60; // how often a chunk batch spawns
const CHUNK_PER_EMIT_MIN = 2; // smallest batch size per tick
const CHUNK_PER_EMIT_MAX = 4; // largest batch size per tick

// --- Chunk motion --------------------------------------------------------
const CHUNK_LIFETIME_MS = 520; // total time on screen before destroyed
const CHUNK_DRIFT_PX_MIN = 8; // smallest outward travel distance
const CHUNK_DRIFT_PX_MAX = 22; // largest outward travel distance
const CHUNK_GRAVITY_PX = 4; // extra downward Y offset applied to all chunks (sells "falling debris")
// How chunks shrink during their flight. 0 = no shrink, 1 = full shrink-to-zero.
// 0.7 looks like crumbled material disintegrating mid-air.
const CHUNK_SHRINK = 0.85;

// --- Chunk shape ---------------------------------------------------------
// Sizes are tiny — same range as the in-game pulverize (1-3px). At this
// scale they read as rubble/dust, not "chunks of wall."
const CHUNK_SIZE_PX_MIN = 1;
const CHUNK_SIZE_PX_MAX = 2;

// --- Chunk spawn region --------------------------------------------------
// Where chunks emerge from. Stone "crumbles" off all faces, so spawn
// uniformly across the full letter body — unlike fire (top) and water
// (bottom), earth has no preferred direction.
const CHUNK_SPAWN_Y_MIN = 0.05;
const CHUNK_SPAWN_Y_MAX = 0.95;

// --- Render depth --------------------------------------------------------
const CHUNK_DEPTH_OFFSET = 1; // render above the host text

// --- Chunk palette -------------------------------------------------------
// Same tints as in-game pulverize (EARTH_WALL_PULVERIZE_TINT_LIGHT and
// _DARK from src/common/config/spells/earth.ts) so menu dust reads as the
// same crumbling material. Extra mid-stone added for variety.
const CHUNK_TINTS: readonly number[] = [0x8b6332, 0x4a3520, 0x6a4a26, 0x8b6332];

export class TextEarthEffect {
  readonly #scene: Phaser.Scene;
  readonly #text: Phaser.GameObjects.BitmapText;

  #chunkTimer: Phaser.Time.TimerEvent | undefined;
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
    // One flat tint — no gradient, no shimmer, no animation on the text.
    this.#text.setTint(STONE_COLOR);

    this.#chunkTimer = this.#scene.time.addEvent({
      delay: CHUNK_EMIT_INTERVAL_MS,
      loop: true,
      callback: () => this.#emitChunks(),
    });

    // Fire one batch immediately so hover feels instant.
    this.#emitChunks();
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    this.#chunkTimer?.destroy();
    this.#chunkTimer = undefined;

    if (this.#text && this.#text.active) {
      if (this.#savedTint !== undefined) {
        this.#text.setTint(this.#savedTint);
      }
    }
    this.#savedTint = undefined;
    // In-flight chunks keep their tween; they'll self-destroy.
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

  #worldBounds(): { x: number; y: number; w: number; h: number } | null {
    if (!this.#text || !this.#text.active || !this.#text.scene) return null;
    const b = this.#text.getTextBounds(false).global;
    if (!b || b.width <= 0 || b.height <= 0) return null;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  // Spawn a batch of dust chunks at random spots in the letter body and
  // tween them outward in random directions, shrinking + fading. Algorithm
  // derived from earth-wall-pillar.ts #spawnDarkChunks but retargeted from
  // "fly to a fixed orb position" to "drift outward in a random direction"
  // — appropriate for a stationary hover effect rather than a directed
  // pull.
  #emitChunks(): void {
    if (!this.#running) return;
    const b = this.#worldBounds();
    if (!b) return;

    const count = Math.floor(CHUNK_PER_EMIT_MIN + Math.random() * (CHUNK_PER_EMIT_MAX - CHUNK_PER_EMIT_MIN + 1));
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    for (let i = 0; i < count; i++) {
      const sx = b.x + Math.random() * b.w;
      const sy = b.y + (CHUNK_SPAWN_Y_MIN + Math.random() * (CHUNK_SPAWN_Y_MAX - CHUNK_SPAWN_Y_MIN)) * b.h;
      const size = CHUNK_SIZE_PX_MIN + Math.floor(Math.random() * (CHUNK_SIZE_PX_MAX - CHUNK_SIZE_PX_MIN + 1));
      const tint = CHUNK_TINTS[Math.floor(Math.random() * CHUNK_TINTS.length)];

      const chunk = this.#scene.add.graphics({ x: sx, y: sy });
      chunk.fillStyle(tint, 1);
      chunk.fillRect(-size / 2, -size / 2, size, size);
      chunk.setDepth((this.#text.depth ?? 0) + CHUNK_DEPTH_OFFSET);

      // Direction: outward from the letter's body center, with broad random
      // jitter so chunks don't all radiate in clean lines. The center-out
      // bias keeps chunks from hovering in place; the jitter keeps them
      // from looking like an explosion.
      const dirX = sx - cx;
      const dirY = sy - cy;
      const baseAngle = Math.atan2(dirY, dirX);
      const angle = baseAngle + (Math.random() - 0.5) * Math.PI; // ±90° spread around the outward direction
      const dist = CHUNK_DRIFT_PX_MIN + Math.random() * (CHUNK_DRIFT_PX_MAX - CHUNK_DRIFT_PX_MIN);

      const tx = sx + Math.cos(angle) * dist;
      const ty = sy + Math.sin(angle) * dist + CHUNK_GRAVITY_PX;

      this.#liveGraphics.add(chunk);
      this.#scene.tweens.add({
        targets: chunk,
        x: tx,
        y: ty,
        alpha: 0,
        scale: 1 - CHUNK_SHRINK,
        duration: CHUNK_LIFETIME_MS,
        ease: 'Quad.easeIn', // same ease as in-game pulverize chunks
        onComplete: () => {
          this.#liveGraphics.delete(chunk);
          chunk.destroy();
        },
      });
    }
  }
}
