import * as Phaser from 'phaser';

/**
 * Extract a small palette of unique RGB colors from a sprite's current
 * texture frame. Cached per (textureKey, frameName) — first call costs a
 * one-time canvas readback; subsequent calls are free. Designed for the
 * VoidOrb pixel-pull VFX: spawn a particle at the sprite's position,
 * tinted with one of its actual pixel colors, so the orb visibly shreds
 * matter off the things around it.
 */

// Module-level cache. Keyed by `${textureKey}:${frameName}`. Cleared lazily
// by Phaser's normal texture lifecycle — once a texture is in here we
// don't bother evicting on its destruction (palettes are tiny).
const PALETTE_CACHE = new Map<string, number[]>();

// Read every Nth pixel in both axes. 4 → samples ~6% of the frame, which
// catches the main colors for typical 32×32 pixel-art sprites in well under
// a millisecond.
const SAMPLE_STRIDE = 4;
// Hard cap on unique colors stored per frame — pixel-art palettes are
// small, real-world frames hit this only if they're photo-realistic.
const MAX_PALETTE_SIZE = 24;
// Below this alpha the pixel is treated as transparent and skipped (so we
// don't sample the empty padding around an irregular sprite).
const ALPHA_THRESHOLD = 128;

type Sampleable = Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;

export function getSpriteFramePalette(sprite: Sampleable): readonly number[] {
  const frame = sprite.frame;
  if (!frame || frame.width <= 0 || frame.height <= 0) return EMPTY;
  const cacheKey = `${sprite.texture.key}:${frame.name}`;
  const cached = PALETTE_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;

  const palette: number[] = [];
  const seen = new Set<number>();

  try {
    // getSourceImage returns the HTMLImageElement (for loaded image assets)
    // or HTMLCanvasElement (for canvas-backed textures). Both are drawable
    // via canvas.drawImage. Skip the rare cases where it returns something
    // we can't draw (DynamicTexture, missing source) — caller falls back.
    const source = sprite.texture.getSourceImage();
    if (!source || !isDrawable(source)) {
      PALETTE_CACHE.set(cacheKey, palette);
      return palette;
    }
    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      PALETTE_CACHE.set(cacheKey, palette);
      return palette;
    }
    // Blit just this frame's slice of the source spritesheet to (0,0) so
    // we can readback a tight rectangle (much smaller than the full sheet).
    ctx.drawImage(
      source as CanvasImageSource,
      frame.cutX, frame.cutY, frame.width, frame.height,
      0, 0, frame.width, frame.height,
    );
    const data = ctx.getImageData(0, 0, frame.width, frame.height).data;
    const w = frame.width;
    const h = frame.height;
    for (let y = 0; y < h; y += SAMPLE_STRIDE) {
      const rowBase = y * w * 4;
      for (let x = 0; x < w; x += SAMPLE_STRIDE) {
        const i = rowBase + x * 4;
        if (data[i + 3] < ALPHA_THRESHOLD) continue;
        const rgb = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
        if (seen.has(rgb)) continue;
        seen.add(rgb);
        palette.push(rgb);
        if (palette.length >= MAX_PALETTE_SIZE) {
          PALETTE_CACHE.set(cacheKey, palette);
          return palette;
        }
      }
    }
  } catch {
    // Cross-origin canvas reads can throw a SecurityError. Falls back to
    // empty palette → caller uses the environmental palette.
  }

  PALETTE_CACHE.set(cacheKey, palette);
  return palette;
}

const EMPTY: readonly number[] = [];

function isDrawable(src: unknown): src is CanvasImageSource {
  return (
    typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement
  ) || (
    typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement
  );
}
