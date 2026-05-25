import * as Phaser from 'phaser';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { Puddle } from './puddle';

/**
 * Shared RenderTexture that composites every lava puddle's rim, core and noise
 * into one continuous silhouette per pass — eliminating the visible double-ring
 * seam that appears when two `Puddle` instances each render their own stack.
 *
 * Each lava `Puddle` keeps its own physics body, lifetime, ember timer and
 * cached blob layout. This layer is purely visual: each frame (during
 * POST_UPDATE) it clears the RT and re-stamps every active lava puddle's
 * cached layout in three passes (rim → core → noise). Overlapping fills
 * composite naturally so two adjacent puddles read as one merged blob.
 *
 * The blob layout is cached on the puddle (not re-randomised every frame) so
 * the stamp is stable between bubble-timer ticks. The bubble timer lives on
 * the layer (not per-puddle) and re-jitters every puddle's cached layout at
 * once for a synchronised "bubbling" feel.
 */
export class LavaLayer {
  static #current: LavaLayer | undefined;

  /** Get the layer for the given scene, creating it on first call. */
  static ensure(scene: Phaser.Scene): LavaLayer {
    const cur = LavaLayer.#current;
    if (cur && cur.#scene === scene && cur.#alive) return cur;
    cur?.destroy();
    LavaLayer.#current = new LavaLayer(scene);
    return LavaLayer.#current;
  }

  static get(): LavaLayer | undefined {
    const cur = LavaLayer.#current;
    if (cur === undefined) return undefined;
    if (!cur.#alive) return undefined;
    return cur;
  }

  /** Force every active lava puddle to regenerate its cached blob layout —
   *  used by the bubble timer to re-randomise the "bubbling" texture for all
   *  puddles in lockstep. */
  static rejitterAll(): void {
    if (!LavaLayer.get()) return;
    for (const p of Puddle.all) {
      if (p.active && p.kind === 'lava') p.regenerateLavaLayout();
    }
  }

  #scene: Phaser.Scene;
  #rt: Phaser.GameObjects.RenderTexture;
  #scratch: Phaser.GameObjects.Graphics;
  #bubbleTimer: Phaser.Time.TimerEvent | undefined;
  #alive: boolean = true;

  private constructor(scene: Phaser.Scene) {
    this.#scene = scene;
    const bounds = scene.physics.world.bounds;
    const w = Math.max(1, Math.ceil(bounds.width || scene.scale.width));
    const h = Math.max(1, Math.ceil(bounds.height || scene.scale.height));
    const ox = bounds.x || 0;
    const oy = bounds.y || 0;
    // World-space RT sized to the physics world. Depth 1.5 matches the depth
    // each Puddle used to occupy individually — sits on top of the floor and
    // below characters (which depth-sort by Y).
    this.#rt = scene.add.renderTexture(ox, oy, w, h).setOrigin(0, 0).setDepth(1.5);
    // Off-display scratch Graphics used as the stamp source for rt.draw().
    // make.graphics(config, addToScene=false) keeps it off the display list.
    this.#scratch = scene.make.graphics({ x: 0, y: 0 }, false);

    this.#startBubbleTimer();

    // POST_UPDATE runs after the scene's update loop and before the render
    // step. Phaser 3 RT.draw is immediate, so by repopulating the RT here
    // every frame the texture is always in sync with each lava puddle's
    // current position + cached blob layout when the render phase paints it.
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.#rebuild, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  #startBubbleTimer(): void {
    const delay = RUNTIME_CONFIG.PUDDLE_LAVA_BUBBLE_REDRAW_MS;
    if (delay <= 0) return;
    this.#bubbleTimer = this.#scene.time.addEvent({
      delay,
      loop: true,
      callback: () => LavaLayer.rejitterAll(),
    });
  }

  /** Restart the bubble timer to pick up any new
   *  RUNTIME_CONFIG.PUDDLE_LAVA_BUBBLE_REDRAW_MS — called by the debug panel
   *  when the slider moves. */
  refreshTimers(): void {
    this.#bubbleTimer?.destroy();
    this.#bubbleTimer = undefined;
    this.#startBubbleTimer();
  }

  #rebuild(): void {
    if (!this.#alive) return;
    this.#rt.clear();
    const ox = -this.#rt.x;
    const oy = -this.#rt.y;
    // Three passes so the overall layering matches the original per-puddle
    // draw order (rim below, core above rim, noise on top of both) while
    // each pass produces a single merged silhouette across all puddles.
    for (const p of Puddle.all) {
      if (!p.active || p.kind !== 'lava') continue;
      this.#scratch.clear();
      Puddle.stampLavaBlobsInto(
        this.#scratch,
        p.getLavaRim(),
        RUNTIME_CONFIG.PUDDLE_LAVA_RIM_TINT,
        RUNTIME_CONFIG.PUDDLE_LAVA_RIM_ALPHA,
      );
      this.#rt.draw(this.#scratch, p.x + ox, p.y + oy);
    }
    for (const p of Puddle.all) {
      if (!p.active || p.kind !== 'lava') continue;
      this.#scratch.clear();
      Puddle.stampLavaBlobsInto(
        this.#scratch,
        p.getLavaCore(),
        RUNTIME_CONFIG.PUDDLE_LAVA_CORE_TINT,
        RUNTIME_CONFIG.PUDDLE_LAVA_CORE_ALPHA,
      );
      this.#rt.draw(this.#scratch, p.x + ox, p.y + oy);
    }
    for (const p of Puddle.all) {
      if (!p.active || p.kind !== 'lava') continue;
      this.#scratch.clear();
      Puddle.stampLavaNoiseInto(this.#scratch, p.getLavaNoise());
      this.#rt.draw(this.#scratch, p.x + ox, p.y + oy);
    }
    // Phaser 3 RT.draw() is immediate — no command-buffer flush needed.
  }

  destroy(): void {
    if (!this.#alive) return;
    this.#alive = false;
    this.#scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.#rebuild, this);
    this.#bubbleTimer?.destroy();
    this.#scratch.destroy();
    this.#rt.destroy();
    if (LavaLayer.#current === this) LavaLayer.#current = undefined;
  }
}
