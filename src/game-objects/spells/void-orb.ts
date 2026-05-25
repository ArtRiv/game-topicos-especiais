import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE, DIRECTION } from '../../common/common';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import {
  VOID_ORB_BM_BODY_RADIUS,
  VOID_ORB_BM_DISPLAY_SCALE,
  VOID_ORB_CAMERA_DISTORTION_X,
  VOID_ORB_CAMERA_DISTORTION_Y,
  VOID_ORB_DISTORTION_X,
  VOID_ORB_DISTORTION_Y,
  VOID_ORB_GLOW_COLOR_A,
  VOID_ORB_GLOW_COLOR_B,
  VOID_ORB_GLOW_COLOR_CYCLE_MS,
  VOID_ORB_GLOW_INNER_STRENGTH,
  VOID_ORB_GLOW_OUTER_STRENGTH,
  VOID_ORB_PARTICLES_ENABLED,
  VOID_ORB_PARTICLE_DIRECTION,
  VOID_ORB_PARTICLE_FREQUENCY_MS,
  VOID_ORB_PARTICLE_LENGTH_PX,
  VOID_ORB_PARTICLE_LIFETIME_MS,
  VOID_ORB_PARTICLE_QUANTITY,
  VOID_ORB_PARTICLE_SPAWN_RADIUS,
  VOID_ORB_PARTICLE_SPEED_PX_PER_SEC,
  VOID_ORB_PARTICLE_THICKNESS_PX,
  VOID_ORB_PARTICLE_TINT_A,
  VOID_ORB_PARTICLE_TINT_B,
  VOID_ORB_PARTICLE_TRAVEL_PX,
  VOID_ORB_VFX1_START_DELAY_MS,
  VOID_ORB_VFX2_DISPLAY_SCALE,
  VOID_ORB_VFX2_FADE_MS,
  VOID_ORB_VFX2_START_DELAY_MS,
  VOID_ORB_VFX2_TINT,
} from '../../common/config';
import { registerSpell } from './spell-registry';
import type { CharacterGameObject } from '../common/character-game-object';

/** Any spell that lets the VoidOrb punch a portal hole in its visuals. Both
 *  WaterTornado and WaterSpike implement this — the orb tracks every active
 *  target so it can clear masks symmetrically if either side dies first. */
export interface VoidPortalMaskable {
  active: boolean;
  scene: Phaser.Scene;
  clearVoidPortalMask(): void;
}

/**
 * VoidOrb — pickup-granted blood-mage orb. Multi-layer visual:
 *   - VFX2 backdrop (12-frame burst, plays once, then fades).
 *   - VFX1 main orb (start → loop → end), self-displaced for warping pixels.
 *   - "Radiation ray" particles — stretched line sprites that fly in straight
 *     tracks (INWARD / RANDOM / OUTWARD per config).
 *   - Pre-FX glow on both VFX sprites, color cycling between two blood reds.
 *   - Main-camera post-FX displacement while alive — true screen-space warp
 *     that distorts everything visible (the "things around it get sucked" feel).
 *
 * Phaser 3 (not 4): uses the Pre/Post-FX API: `sprite.preFX.addGlow(...)`,
 * `camera.postFX.addDisplacement(...)`. Pre-FX is enabled per-game-object via
 * scene.add.image/sprite — automatic on this project's pixel-art pipeline.
 */
type Phase = 'start' | 'loop' | 'end';

// ── Procedural textures (idempotent, generated once per scene) ────────────────

function ensureRayTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(ASSET_KEYS.VOID_ORB_PARTICLE)) return;
  // 1×Length white rectangle — tinted per-ray to the blood palette. Origin (0.5, 1)
  // when used so each ray pivots around its TIP, growing/shrinking from the leading
  // edge — reads as a streak of moving energy rather than a static line.
  const W = Math.max(1, VOID_ORB_PARTICLE_THICKNESS_PX);
  const H = Math.max(1, VOID_ORB_PARTICLE_LENGTH_PX);
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, W, H);
  g.generateTexture(ASSET_KEYS.VOID_ORB_PARTICLE, W, H);
  g.destroy();
}

function ensureDisplacementTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(ASSET_KEYS.VOID_ORB_DISPLACEMENT)) return;
  // 64×64 radial-noise displacement map. R = X offset, G = Y offset (Phaser convention,
  // 0.5 = neutral, < 0.5 pulls negative, > 0.5 pushes positive). Combines a radial
  // pull-toward-center with random noise so the warp is organic.
  const size = 64;
  const canvasTex = scene.textures.createCanvas(ASSET_KEYS.VOID_ORB_DISPLACEMENT, size, size);
  if (!canvasTex) return;
  const ctx = canvasTex.getContext();
  const img = ctx.createImageData(size, size);
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = cx - x;
      const dy = cy - y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const t = Math.max(0, 1 - dist / cx);
      const noiseX = (Math.random() - 0.5) * 0.4;
      const noiseY = (Math.random() - 0.5) * 0.4;
      const rChan = 0.5 + ((dx / dist) * t * 0.5 + noiseX);
      const gChan = 0.5 + ((dy / dist) * t * 0.5 + noiseY);
      const i = (y * size + x) * 4;
      img.data[i + 0] = Math.max(0, Math.min(255, Math.floor(rChan * 255)));
      img.data[i + 1] = Math.max(0, Math.min(255, Math.floor(gChan * 255)));
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  canvasTex.refresh();
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

// Phaser 3 pre-FX glow controller — only `color` is mutated at runtime.
type GlowFX = { color: number };

/** Attach pre-FX glow + (optional) self-displacement to a sprite. */
function applyOrbFX(sprite: Phaser.GameObjects.Sprite, withDisplacement: boolean): GlowFX | null {
  // Phaser 3 typing for preFX may be missing in some bundles; access defensively.
  type PreFXCapable = Phaser.GameObjects.Sprite & {
    preFX?: {
      addGlow: (color?: number, outerStrength?: number, innerStrength?: number, knockout?: boolean, quality?: number, distance?: number) => GlowFX;
      addDisplacement: (texture: string, x: number, y: number) => unknown;
    };
  };
  const s = sprite as PreFXCapable;
  if (!s.preFX) return null;
  const glow = s.preFX.addGlow(
    VOID_ORB_GLOW_COLOR_A,
    VOID_ORB_GLOW_OUTER_STRENGTH,
    VOID_ORB_GLOW_INNER_STRENGTH,
    false,
  );
  const dx = VOID_ORB_DISTORTION_X as number;
  const dy = VOID_ORB_DISTORTION_Y as number;
  if (withDisplacement && (dx !== 0 || dy !== 0)) {
    s.preFX.addDisplacement(ASSET_KEYS.VOID_ORB_DISPLACEMENT, dx, dy);
  }
  return glow;
}

// Camera-level displacement controller for the "things around it" warp. Created at
// the start of a cast and torn down on destroy. Multiple concurrent VoidOrbs each
// add their own — we tear down ONLY the one we added.
type DisplacementFX = unknown & { destroy?: () => void };
function addCameraScreenWarp(scene: Phaser.Scene): DisplacementFX | null {
  const cx = VOID_ORB_CAMERA_DISTORTION_X as number;
  const cy = VOID_ORB_CAMERA_DISTORTION_Y as number;
  if (cx === 0 && cy === 0) return null;
  type FXCam = Phaser.Cameras.Scene2D.Camera & {
    postFX?: { addDisplacement: (texture: string, x: number, y: number) => DisplacementFX };
  };
  const cam = scene.cameras.main as FXCam;
  if (!cam.postFX) return null;
  return cam.postFX.addDisplacement(ASSET_KEYS.VOID_ORB_DISPLACEMENT, cx, cy);
}

// ── VoidOrb + WaterTornado combo: portal absorption FX ──────────────────────
// How many cyan "water shred" dots spiral around the orb while a tornado is
// being absorbed. More = denser, busier swirl. Each tick costs one position
// update + alpha/scale set per fragment, so this scales fine into the tens.
const VOID_ABSORPTION_FRAGMENT_COUNT = 12;
// Padding (px) added to the portal-hole radius for the spiral spawn radius —
// fragments appear JUST outside the hole and travel inward. Bigger = wider
// absorption ring visible around the cutout.
const VOID_ABSORPTION_SPAWN_PADDING = 8;
// "Infection" overlay on the orb's own pixels while a tornado is being
// absorbed. Instead of spawning new sprites, we layer a cyan-tint-fill copy of
// the orb's vfx1 sprite on top of it, masked by a procedural noise texture so
// only some pixels of the orb appear cyan — the rest stay red. Rotating the
// noise mask makes the infected pixels shift over time, like contamination
// flowing through the vortex.
const VOID_INFECTION_TINT = 0x6fb8ff;
// Alpha of the cyan overlay (0..1). Higher = more pixels read as fully blue;
// lower = the cyan dots are subtler. 0.9 keeps the recoloured pixels crisp.
const VOID_INFECTION_ALPHA = 0.5;
// What fraction of the noise texture is opaque. Lower = sparser cyan pixels
// (more red showing through), higher = more cyan. 0.45 ≈ "infected but not
// taken over".
const VOID_INFECTION_NOISE_DENSITY = 0.1;
// Radians/sec the noise mask rotates by. Higher = pixels flicker faster.
const VOID_INFECTION_NOISE_SPIN = 1.2;

const ABSORPTION_DOT_TEXTURE_KEY = '__void_absorption_dot__';
function ensureAbsorptionDotTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(ABSORPTION_DOT_TEXTURE_KEY)) return;
  // 6×6 soft-edged white disc — tinted blue at runtime. Anti-aliased via two
  // overlapping circles so it doesn't look like an obvious pixel square.
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 0.55);
  g.fillCircle(3, 3, 3);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(3, 3, 2);
  g.generateTexture(ABSORPTION_DOT_TEXTURE_KEY, 6, 6);
  g.destroy();
}

const INFECTION_NOISE_TEXTURE_KEY = '__void_infection_noise__';
/** Generate (once per scene) a procedural noise texture used as the BitmapMask
 *  source for the infection overlay. Each pixel is either fully opaque or fully
 *  transparent, with `VOID_INFECTION_NOISE_DENSITY` controlling the on/off ratio.
 *  Binary alpha (not gradients) gives a crisp pixel-replacement look. */
function ensureInfectionNoiseTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(INFECTION_NOISE_TEXTURE_KEY)) return;
  const size = 64;
  const tex = scene.textures.createCanvas(INFECTION_NOISE_TEXTURE_KEY, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const opaque = Math.random() < VOID_INFECTION_NOISE_DENSITY;
    const idx = i * 4;
    img.data[idx + 0] = 255;
    img.data[idx + 1] = 255;
    img.data[idx + 2] = 255;
    img.data[idx + 3] = opaque ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}

/** Generate (once per scene + radius) a Canvas-backed radial-gradient texture
 *  used as a SOFT BitmapMask source. Center is fully opaque (hard hide), the
 *  edge fades to fully transparent (no hide). Cached per radius so reusing
 *  the same mask size across orbs is free. */
function ensureSoftPortalMaskTexture(scene: Phaser.Scene, radius: number): string {
  const key = `__void_portal_soft_mask_r${Math.round(radius)}__`;
  if (scene.textures.exists(key)) return key;
  const size = Math.max(8, Math.round(radius * 2));
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return key;
  const ctx = tex.getContext();
  // Radial gradient: solid-white core, smoothly fading to transparent rim.
  // The mid stops compress the falloff so the absorption ring is wide but the
  // very center still fully hides the tornado.
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0.00, 'rgba(255,255,255,1.00)');
  grad.addColorStop(0.40, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.70, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.90, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
  return key;
}

function removeCameraScreenWarp(scene: Phaser.Scene, fx: DisplacementFX | null): void {
  if (!fx) return;
  type FXCam = Phaser.Cameras.Scene2D.Camera & {
    postFX?: { remove: (fx: unknown) => void };
  };
  const cam = scene.cameras.main as FXCam;
  cam.postFX?.remove(fx);
}

export class VoidOrb extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.DARKNESS;
  readonly spellId: SpellId = SPELL_ID.VOID_ORB;
  readonly spellType: SpellType = SPELL_TYPE.AREA;
  readonly manaCost: number = 0;
  readonly cooldown: number = 0;

  #phase: Phase = 'start';
  #holdTimer: Phaser.Time.TimerEvent | undefined;
  #tickTimer: Phaser.Time.TimerEvent | undefined;
  #rayTimer: Phaser.Time.TimerEvent | undefined;
  #enemiesInArea: Set<CharacterGameObject> = new Set();

  #vfx1Sprite: Phaser.GameObjects.Sprite;
  #vfx2Sprite: Phaser.GameObjects.Sprite;
  #vfx1Glow: GlowFX | null = null;
  #vfx2Glow: GlowFX | null = null;
  #cameraFX: DisplacementFX | null = null;
  #startTime: number;

  get baseDamage(): number {
    return RUNTIME_CONFIG.VOID_ORB_DAMAGE_PER_TICK;
  }

  get isDamageActive(): boolean {
    return this.#phase !== 'end';
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  /** Soft radial-gradient Image used as a BitmapMask source: feeds a partner spell
   *  (e.g. WaterTornado) into the orb's center via `invertAlpha`. The mask alpha
   *  ramps from 1 (hard hide) at center to 0 (no hide) at the rim, so the
   *  tornado pixels FADE into the portal instead of being cookie-cut by a hard
   *  circle. Created lazily; followed to the orb each frame by callers via
   *  `updatePortalMaskPosition`. */
  #portalMaskSource: Phaser.GameObjects.Image | undefined;
  #portalMaskWobble: Phaser.Tweens.Tween | undefined;
  // Spiraling "water being absorbed" fragments. Spawned when a tornado starts
  // overlapping the orb; despawned when it leaves. Each fragment has its own
  // angle/radius and is repositioned every scene update.
  #absorptionFragments: {
    sprite: Phaser.GameObjects.Image;
    angle: number;
    radius: number;
    radialSpeed: number;
    angularSpeed: number;
    scale: number;
  }[] = [];
  #absorptionActive: boolean = false;
  #absorptionSpawnRadius: number = 0;
  #absorptionInnerRadius: number = 0;
  // Pixel-recolour overlay on the orb's own sprite during a tornado combo.
  // Mirrors vfx1Sprite each frame (same texture / frame / position / scale),
  // tint-filled cyan, and masked by a rotating noise texture so only some
  // pixels appear blue — looks like the orb's pixels are being CONTAMINATED
  // rather than new sprites being layered on top.
  #infectionOverlay: Phaser.GameObjects.Sprite | undefined;
  #infectionNoiseSource: Phaser.GameObjects.Image | undefined;
  #infectionNoiseMask: Phaser.Display.Masks.BitmapMask | undefined;
  // Tornadoes currently masked by this orb. Used so that when THIS orb dies
  // (destroy / expire / counter-combo), it can call back into each tornado and
  // strip the mask — otherwise the funnel would render a phantom hole until
  // its own preUpdate safety-net catches up.
  #maskedSpells: Set<VoidPortalMaskable> = new Set();

  /** Returns the GameObject to feed into `new Phaser.Display.Masks.BitmapMask(scene, src)`.
   *  Uses a Canvas-backed radial-gradient texture so the mask has a SOFT edge — the
   *  tornado fades into the portal rather than being chopped by a hard circle. */
  public getPortalMaskSource(radius: number = 28): Phaser.GameObjects.GameObject {
    if (!this.#portalMaskSource) {
      const texKey = ensureSoftPortalMaskTexture(this.scene, radius);
      this.#portalMaskSource = this.scene.add.image(this.x, this.y, texKey);
      this.#portalMaskSource.setOrigin(0.5, 0.5);
      // The mask source is rendered to an offscreen buffer by BitmapMask, so hide
      // it from the main display list to avoid a stray white blob in the world.
      this.#portalMaskSource.setVisible(false);
      // Irregular-edge wobble: gently desync scaleX/Y so the cutout isn't a
      // perfect circle — sells the "swirling portal" feel without a shader.
      this.#portalMaskWobble = this.scene.tweens.add({
        targets: this.#portalMaskSource,
        scaleX: { from: 1.0, to: 1.12 },
        scaleY: { from: 1.0, to: 0.9 },
        angle: 360,
        duration: 1400,
        repeat: -1,
        yoyo: false,
        ease: 'Sine.easeInOut',
      });
    }
    return this.#portalMaskSource;
  }

  /** Reposition the portal hole mask source to track the orb's body center. Call
   *  every frame while a mask is in effect — the orb itself wobbles slightly, and
   *  if the hole drifts you'll see the tornado clip through the orb's edge. */
  public updatePortalMaskPosition(): void {
    if (!this.#portalMaskSource) return;
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    this.#portalMaskSource.setPosition(body.center.x, body.center.y);
  }

  /** Begin (or refresh) the spiraling-water absorption FX. Spawns VOID_ABSORPTION_FRAGMENT_COUNT
   *  small cyan dots at the rim of the portal that spiral inward each frame and respawn at
   *  the rim when they reach the core. Idempotent — re-calling each overlap frame just
   *  keeps the spawn/inner radii in sync if the hole radius changes.
   *  `aboveDepth` should be the tornado's current depth so the fragments render ON TOP of
   *  the funnel (the masked-out core is invisible there, so the fragments read as water
   *  being torn off the tornado and pulled in). */
  public startVoidAbsorptionFX(holeRadius: number, aboveDepth: number): void {
    this.#absorptionSpawnRadius = holeRadius + VOID_ABSORPTION_SPAWN_PADDING;
    this.#absorptionInnerRadius = Math.max(2, holeRadius * 0.15);
    if (!this.#absorptionActive) {
      this.#absorptionActive = true;
      ensureAbsorptionDotTexture(this.scene);
      ensureInfectionNoiseTexture(this.scene);
      for (let i = 0; i < VOID_ABSORPTION_FRAGMENT_COUNT; i++) {
        const angle = (Math.PI * 2 * i) / VOID_ABSORPTION_FRAGMENT_COUNT + Math.random() * 0.6;
        const radius = this.#absorptionInnerRadius +
          Math.random() * (this.#absorptionSpawnRadius - this.#absorptionInnerRadius);
        const scale = 0.5 + Math.random() * 0.6;
        const sprite = this.scene.add.image(this.x, this.y, ABSORPTION_DOT_TEXTURE_KEY);
        sprite.setTint(0x9ad6ff);
        sprite.setBlendMode(Phaser.BlendModes.ADD);
        sprite.setScale(scale);
        sprite.setDepth(aboveDepth + 1);
        this.#absorptionFragments.push({
          sprite,
          angle,
          radius,
          radialSpeed: 22 + Math.random() * 18, // px/s inward
          angularSpeed: 5 + Math.random() * 3, // rad/s spiral
          scale,
        });
      }
      // Infection overlay — a cyan-tint-fill duplicate of the orb's vfx1
      // sprite that we sync to vfx1's frame/transform every scene update.
      // Masked by a rotating noise texture so only some of the orb's pixels
      // appear blue (the rest stay red), giving the "pixels are being
      // contaminated" feel rather than "extra sprites on top".
      const v1 = this.#vfx1Sprite;
      const overlay = this.scene.add.sprite(v1.x, v1.y, v1.texture.key, v1.frame.name);
      overlay.setOrigin(v1.originX, v1.originY);
      overlay.setScale(v1.scaleX, v1.scaleY);
      overlay.setRotation(v1.rotation);
      // tint-FILL replaces the orb's red pixels with the cyan colour (vs.
      // setTint, which just multiplies). With the noise mask + alpha this
      // reads as a scatter of solid-blue pixels mixed into the orb.
      overlay.setTint(VOID_INFECTION_TINT);
      overlay.setTintFill(VOID_INFECTION_TINT);
      overlay.setAlpha(VOID_INFECTION_ALPHA);
      // Just above vfx1 (depth 3) but below the tornado (high y-based depth),
      // so the cyan pixels live INSIDE the orb. Where the tornado isn't
      // masked, it covers them — meaning the infection is only visible
      // through the portal hole, which is exactly where the contact happens.
      overlay.setDepth(v1.depth + 0.05);
      this.#infectionOverlay = overlay;

      // Noise mask — a 64×64 random binary-alpha texture. Hidden from the
      // display list (rendered only into the BitmapMask buffer). Scaled to
      // comfortably cover the orb and rotated each frame so the cyan
      // pixel pattern shifts over time.
      const noiseImg = this.scene.add.image(v1.x, v1.y, INFECTION_NOISE_TEXTURE_KEY);
      noiseImg.setVisible(false);
      // Scale up so the noise pixels are visible — 64×64 mapped over a sprite
      // ~64px wide is 1:1. Use the vfx1 scale and add some padding.
      noiseImg.setScale(v1.scaleX * 1.3, v1.scaleY * 1.3);
      const noiseMask = new Phaser.Display.Masks.BitmapMask(this.scene, noiseImg);
      overlay.setMask(noiseMask);
      this.#infectionNoiseSource = noiseImg;
      this.#infectionNoiseMask = noiseMask;
    } else {
      // Already running — just keep depth in sync (tornado.y can change as it gets pulled).
      for (const f of this.#absorptionFragments) f.sprite.setDepth(aboveDepth + 1);
    }
  }

  public stopVoidAbsorptionFX(): void {
    if (!this.#absorptionActive) return;
    this.#absorptionActive = false;
    for (const f of this.#absorptionFragments) f.sprite.destroy();
    this.#absorptionFragments.length = 0;
    // Tear down the infection overlay + its noise mask. clearMask() removes
    // the mask reference from the overlay sprite before we destroy the mask
    // itself; destroying the noise source last so the BitmapMask doesn't
    // dereference a dead GameObject during teardown.
    this.#infectionOverlay?.clearMask();
    this.#infectionNoiseMask?.destroy();
    this.#infectionNoiseMask = undefined;
    this.#infectionOverlay?.destroy();
    this.#infectionOverlay = undefined;
    this.#infectionNoiseSource?.destroy();
    this.#infectionNoiseSource = undefined;
  }

  #updateAbsorptionFX(delta: number): void {
    if (!this.#absorptionActive) return;
    const dt = delta / 1000;
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    const cx = body.center.x;
    const cy = body.center.y;
    const span = Math.max(1, this.#absorptionSpawnRadius - this.#absorptionInnerRadius);
    for (const f of this.#absorptionFragments) {
      f.angle += f.angularSpeed * dt;
      f.radius -= f.radialSpeed * dt;
      if (f.radius <= this.#absorptionInnerRadius) {
        // Re-spawn at the rim with a fresh angle so the spiral never empties out.
        f.radius = this.#absorptionSpawnRadius;
        f.angle = Math.random() * Math.PI * 2;
      }
      f.sprite.x = cx + Math.cos(f.angle) * f.radius;
      f.sprite.y = cy + Math.sin(f.angle) * f.radius;
      // Fade & shrink toward the core so the fragment dissolves into the portal
      // instead of popping out the moment it respawns at the rim.
      const t = (f.radius - this.#absorptionInnerRadius) / span; // 1 at rim, 0 at core
      f.sprite.setAlpha(0.25 + 0.75 * t);
      f.sprite.setScale(f.scale * (0.4 + 0.6 * t));
    }
    // Infection overlay sync: keep the cyan duplicate aligned with vfx1's
    // current frame/transform, and spin the noise mask source so the
    // recoloured pixels shift over time. Without rotating the mask, the same
    // pixels would stay cyan forever and the effect would look like a static
    // decal painted on the orb.
    if (this.#infectionOverlay && this.#vfx1Sprite.active) {
      const v1 = this.#vfx1Sprite;
      const o = this.#infectionOverlay;
      o.setTexture(v1.texture.key, v1.frame.name);
      o.setPosition(v1.x, v1.y);
      o.setRotation(v1.rotation);
      o.setScale(v1.scaleX, v1.scaleY);
    }
    if (this.#infectionNoiseSource && this.#vfx1Sprite.active) {
      const v1 = this.#vfx1Sprite;
      this.#infectionNoiseSource.setPosition(v1.x, v1.y);
      this.#infectionNoiseSource.rotation += VOID_INFECTION_NOISE_SPIN * dt;
    }
  }

  /** Called by a partner spell (WaterTornado / WaterSpike) when it installs a
   *  BitmapMask sourced from this orb. Lets us mutually clean up when either
   *  side ends first. */
  public registerMaskedSpell(s: VoidPortalMaskable): void {
    this.#maskedSpells.add(s);
  }

  public unregisterMaskedSpell(s: VoidPortalMaskable): void {
    this.#maskedSpells.delete(s);
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, ASSET_KEYS.VOID_ORB_BM_START, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setVisible(false); // physics-only — visible layers added below
    this.setOrigin(0.5, 0.5);
    this.setScale(VOID_ORB_BM_DISPLAY_SCALE);

    const r = VOID_ORB_BM_BODY_RADIUS;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(r);
    body.setOffset(64 - r, 64 - r);
    body.setImmovable(true);
    body.setAllowGravity(false);
    body.enable = true;

    ensureRayTexture(scene);
    ensureDisplacementTexture(scene);

    // ── VFX2 backdrop ──────────────────────────────────────────────────────
    this.#vfx2Sprite = scene.add.sprite(x, y, ASSET_KEYS.VOID_ORB_BM_VFX2, 0);
    this.#vfx2Sprite.setOrigin(0.5, 0.5);
    this.#vfx2Sprite.setScale(VOID_ORB_VFX2_DISPLAY_SCALE);
    this.#vfx2Sprite.setDepth(2.9);
    this.#vfx2Sprite.setTint(VOID_ORB_VFX2_TINT);
    this.#vfx2Sprite.setVisible(false);
    this.#vfx2Glow = applyOrbFX(this.#vfx2Sprite, false);

    // ── VFX1 main orb ──────────────────────────────────────────────────────
    this.#vfx1Sprite = scene.add.sprite(x, y, ASSET_KEYS.VOID_ORB_BM_START, 0);
    this.#vfx1Sprite.setOrigin(0.5, 0.5);
    this.#vfx1Sprite.setScale(VOID_ORB_BM_DISPLAY_SCALE);
    this.#vfx1Sprite.setDepth(3);
    this.#vfx1Sprite.setVisible(false);
    this.#vfx1Glow = applyOrbFX(this.#vfx1Sprite, true);

    // ── Camera screen-space warp ───────────────────────────────────────────
    this.#cameraFX = addCameraScreenWarp(scene);

    // ── Sync — schedule both visual layers ─────────────────────────────────
    this.#startTime = scene.time.now;
    scene.time.delayedCall(VOID_ORB_VFX1_START_DELAY_MS, () => {
      if (!this.active) return;
      this.#vfx1Sprite.setVisible(true);
      this.#vfx1Sprite.play(ASSET_KEYS.VOID_ORB_BM_START);
      this.#vfx1Sprite.once(`animationcomplete-${ASSET_KEYS.VOID_ORB_BM_START}`, () => this.#enterLoop());
    });
    scene.time.delayedCall(VOID_ORB_VFX2_START_DELAY_MS, () => {
      if (!this.active) return;
      this.#vfx2Sprite.setVisible(true);
      this.#vfx2Sprite.play(ASSET_KEYS.VOID_ORB_BM_VFX2);
      this.#vfx2Sprite.once(`animationcomplete-${ASSET_KEYS.VOID_ORB_BM_VFX2}`, () => {
        if (!this.#vfx2Sprite.active) return;
        if (VOID_ORB_VFX2_FADE_MS <= 0) {
          this.#vfx2Sprite.setVisible(false);
        } else {
          scene.tweens.add({
            targets: this.#vfx2Sprite,
            alpha: 0,
            duration: VOID_ORB_VFX2_FADE_MS,
            ease: 'Quad.easeOut',
            onComplete: () => { if (this.#vfx2Sprite.active) this.#vfx2Sprite.setVisible(false); },
          });
        }
      });
    });

    // ── Radiation rays (manual; not Phaser particles) ──────────────────────
    if (VOID_ORB_PARTICLES_ENABLED) {
      this.#rayTimer = scene.time.addEvent({
        delay: VOID_ORB_PARTICLE_FREQUENCY_MS,
        loop: true,
        callback: this.#emitRays,
        callbackScope: this,
      });
    }

    // ── Damage tick ────────────────────────────────────────────────────────
    this.#tickTimer = scene.time.addEvent({
      delay: RUNTIME_CONFIG.VOID_ORB_TICK_INTERVAL,
      callback: this.#applyTickDamage,
      callbackScope: this,
      loop: true,
    });

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.#onSceneUpdate, this);
  }

  public addEnemyInArea(enemy: CharacterGameObject): void {
    this.#enemiesInArea.add(enemy);
  }

  public explode(): void { /* no-op: orb does not react to walls */ }

  #onSceneUpdate(_time: number, delta: number): void {
    if (!this.active) return;
    this.#vfx1Sprite.setPosition(this.x, this.y);
    this.#vfx2Sprite.setPosition(this.x, this.y);

    // Color-cycle the glow on a sin wave so it pulses between the two blood colors.
    const elapsed = this.scene.time.now - this.#startTime;
    const t = (Math.sin((elapsed / VOID_ORB_GLOW_COLOR_CYCLE_MS) * Math.PI * 2) + 1) * 0.5;
    const color = lerpColor(VOID_ORB_GLOW_COLOR_A, VOID_ORB_GLOW_COLOR_B, t);
    if (this.#vfx1Glow) this.#vfx1Glow.color = color;
    if (this.#vfx2Glow) this.#vfx2Glow.color = color;

    // Spiraling-water absorption (no-op when not active).
    this.#updateAbsorptionFX(delta);
  }

  /**
   * Spawn `VOID_ORB_PARTICLE_QUANTITY` ray streaks. Each ray:
   *   1. Picks a direction angle based on VOID_ORB_PARTICLE_DIRECTION
   *   2. Spawns at SPAWN_RADIUS distance from the orb on that angle (or the opposite
   *      angle for INWARD, so it can travel toward the center)
   *   3. Tweens position by TRAVEL_PX along the direction over LIFETIME_MS
   *   4. Rotates to face its direction of travel; fades alpha to 0 at end
   */
  #emitRays(): void {
    if (!this.active || this.#phase === 'end') return;
    const scene = this.scene;
    if (!scene) return;

    for (let i = 0; i < VOID_ORB_PARTICLE_QUANTITY; i++) {
      // Pick travel angle.
      let travelAngle: number;
      switch (VOID_ORB_PARTICLE_DIRECTION) {
        case 'INWARD':  travelAngle = Math.random() * Math.PI * 2; break;
        case 'OUTWARD': travelAngle = Math.random() * Math.PI * 2; break;
        case 'RANDOM':  travelAngle = Math.random() * Math.PI * 2; break;
      }

      // Spawn position depends on mode — INWARD spawns at outer ring & travels in;
      // OUTWARD spawns at center & travels out; RANDOM spawns mid-radius & travels
      // in the chosen direction.
      let spawnX: number, spawnY: number, endX: number, endY: number;
      const cos = Math.cos(travelAngle), sin = Math.sin(travelAngle);
      const travel = VOID_ORB_PARTICLE_TRAVEL_PX;
      if (VOID_ORB_PARTICLE_DIRECTION === 'INWARD') {
        // Spawn on the outer ring, travel toward the center along -direction.
        spawnX = this.x + cos * VOID_ORB_PARTICLE_SPAWN_RADIUS;
        spawnY = this.y + sin * VOID_ORB_PARTICLE_SPAWN_RADIUS;
        endX   = spawnX - cos * travel;
        endY   = spawnY - sin * travel;
      } else if (VOID_ORB_PARTICLE_DIRECTION === 'OUTWARD') {
        // Spawn at the inner edge, travel outward along +direction.
        spawnX = this.x + cos * (VOID_ORB_PARTICLE_SPAWN_RADIUS * 0.2);
        spawnY = this.y + sin * (VOID_ORB_PARTICLE_SPAWN_RADIUS * 0.2);
        endX   = spawnX + cos * travel;
        endY   = spawnY + sin * travel;
      } else {
        // RANDOM — spawn mid-radius, travel in chosen direction.
        const startR = Math.random() * VOID_ORB_PARTICLE_SPAWN_RADIUS;
        spawnX = this.x + Math.cos(Math.random() * Math.PI * 2) * startR;
        spawnY = this.y + Math.sin(Math.random() * Math.PI * 2) * startR;
        endX   = spawnX + cos * travel;
        endY   = spawnY + sin * travel;
      }

      // Tint random between the two palette colors.
      const tint = Math.random() < 0.5 ? VOID_ORB_PARTICLE_TINT_A : VOID_ORB_PARTICLE_TINT_B;

      // Build the ray sprite. Origin (0.5, 1) so it pivots around its TIP — when we
      // rotate the sprite, its leading edge is at (spawnX, spawnY) and it trails behind.
      // motionAngle is what we want the ray to FACE — the sprite was generated as a
      // vertical bar pointing UP, so rotation needed = motionAngle + Ï€/2.
      const motionAngle = Math.atan2(endY - spawnY, endX - spawnX);
      const ray = scene.add.sprite(spawnX, spawnY, ASSET_KEYS.VOID_ORB_PARTICLE);
      ray.setOrigin(0.5, 1);
      ray.setDepth(3.1);
      ray.setTint(tint);
      ray.setBlendMode(Phaser.BlendModes.ADD);
      ray.setRotation(motionAngle + Math.PI / 2);

      // Duration is bounded by both LIFETIME_MS AND TRAVEL_PX/SPEED — whichever ends
      // first. That way speed and travel-distance act independently from lifespan.
      const speedDuration = (VOID_ORB_PARTICLE_TRAVEL_PX / VOID_ORB_PARTICLE_SPEED_PX_PER_SEC) * 1000;
      const duration = Math.min(VOID_ORB_PARTICLE_LIFETIME_MS, speedDuration);

      scene.tweens.add({
        targets: ray,
        x: endX,
        y: endY,
        alpha: { from: 1, to: 0 },
        duration,
        ease: 'Linear',
        onComplete: () => { if (ray.active) ray.destroy(); },
      });
    }
  }

  #enterLoop(): void {
    if (!this.active) return;
    this.#phase = 'loop';
    this.#vfx1Sprite.play(ASSET_KEYS.VOID_ORB_BM_LOOP);
    this.#holdTimer = this.scene.time.delayedCall(RUNTIME_CONFIG.VOID_ORB_ORB_HOLD_MS, () => {
      this.#enterEnd();
    });
  }

  #enterEnd(): void {
    if (!this.active) return;
    this.#phase = 'end';

    this.#tickTimer?.destroy();
    this.#tickTimer = undefined;
    this.#rayTimer?.destroy();
    this.#rayTimer = undefined;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;

    // Remove the screen-space warp the moment the orb starts dissipating.
    removeCameraScreenWarp(this.scene, this.#cameraFX);
    this.#cameraFX = null;

    this.#vfx1Sprite.play(ASSET_KEYS.VOID_ORB_BM_END);
    this.#vfx1Sprite.once(`animationcomplete-${ASSET_KEYS.VOID_ORB_BM_END}`, () => {
      if (this.active) this.destroy();
    });
  }

  #applyTickDamage(): void {
    if (this.#phase === 'end') return;
    for (const enemy of this.#enemiesInArea) {
      if (!enemy.active || enemy.isDefeated) continue;
      if (this.scene.physics.overlap(this, enemy)) {
        enemy.hit(DIRECTION.DOWN, this.baseDamage);
      }
    }
  }

  public destroy(fromScene?: boolean): void {
    this.scene?.events.off(Phaser.Scenes.Events.UPDATE, this.#onSceneUpdate, this);
    this.#holdTimer?.destroy();
    this.#tickTimer?.destroy();
    this.#rayTimer?.destroy();
    this.#enemiesInArea.clear();
    // Defensive: also remove the camera FX in case destroy() runs before #enterEnd().
    if (this.scene) removeCameraScreenWarp(this.scene, this.#cameraFX);
    this.#cameraFX = null;
    this.#vfx1Sprite?.destroy();
    this.#vfx2Sprite?.destroy();
    // CRITICAL: clear masks on any tornadoes pointing at our mask source BEFORE
    // we destroy that source. Otherwise the tornado renders a phantom hole
    // until its own preUpdate safety-net catches up (one frame of broken
    // visuals). Iterate a copy because clearVoidPortalMask mutates the set
    // via unregisterMaskedTornado.
    for (const s of [...this.#maskedSpells]) {
      if (s.active) s.clearVoidPortalMask();
    }
    this.#maskedSpells.clear();
    this.#portalMaskWobble?.stop();
    this.#portalMaskWobble = undefined;
    this.#portalMaskSource?.destroy();
    this.#portalMaskSource = undefined;
    this.stopVoidAbsorptionFX();
    super.destroy(fromScene);
  }
}

registerSpell(SPELL_ID.VOID_ORB, (scene, _cx, _cy, tx, ty) => new VoidOrb(scene, tx, ty));
