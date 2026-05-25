import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE, DIRECTION } from '../../common/common';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import {
  DARK_BOLT_BODY_RADIUS,
  DARK_BOLT_DISPLAY_SCALE,
  DARK_BOLT_GLOW_COLOR_A,
  DARK_BOLT_GLOW_COLOR_B,
  DARK_BOLT_GLOW_COLOR_CYCLE_MS,
  DARK_BOLT_GLOW_INNER_STRENGTH,
  DARK_BOLT_GLOW_OUTER_STRENGTH,
  DARK_BOLT_CAMERA_DISTORTION_X,
  DARK_BOLT_CAMERA_DISTORTION_Y,
  DARK_BOLT_TRAIL_DRIFT_SPEED,
  DARK_BOLT_TRAIL_EMIT_INTERVAL_MS,
  DARK_BOLT_TRAIL_ENABLED,
  DARK_BOLT_TRAIL_PARTICLES_PER_EMIT,
  DARK_BOLT_TRAIL_PARTICLE_LIFETIME_MS,
  DARK_BOLT_TRAIL_SPAWN_JITTER_PX,
  DARK_BOLT_TRAIL_TINT_A,
  DARK_BOLT_TRAIL_TINT_B,
  DARK_BOLT_ENV_LIGHT_ENABLED,
  DARK_BOLT_ENV_LIGHT_RADIUS_PX,
  DARK_BOLT_ENV_LIGHT_TINT,
  DARK_BOLT_ENV_LIGHT_ALPHA,
  DARK_BOLT_ENV_LIGHT_PULSE_AMPLITUDE,
  DARK_BOLT_WOBBLE_ENABLED,
  DARK_BOLT_WOBBLE_SCALE_AMPLITUDE,
  DARK_BOLT_WOBBLE_PERIOD_MS,
  DARK_BOLT_WOBBLE_ROT_AMPLITUDE_DEG,
  DARK_BOLT_WOBBLE_ROT_PERIOD_MS,
  DARK_BOLT_WINDUP_ENABLED,
  DARK_BOLT_WINDUP_DURATION_MS,
  DARK_BOLT_WINDUP_START_SCALE,
  DARK_BOLT_WINDUP_END_SCALE,
  DARK_BOLT_WINDUP_START_ALPHA,
  DARK_BOLT_WINDUP_TINT,
  DARK_BOLT_SHAKE_ENABLED,
  DARK_BOLT_SHAKE_INTENSITY,
  DARK_BOLT_SHAKE_DURATION_MS,
  DARK_BOLT_HEAT_HAZE_ENABLED,
  DARK_BOLT_HEAT_HAZE_X,
  DARK_BOLT_HEAT_HAZE_Y,
  DARK_BOLT_SCAR_ENABLED,
  DARK_BOLT_SCAR_EMIT_INTERVAL_MS,
  DARK_BOLT_SCAR_SEGMENT_LENGTH_PX,
  DARK_BOLT_SCAR_SEGMENT_THICKNESS_PX,
  DARK_BOLT_SCAR_LIFETIME_MS,
  DARK_BOLT_SCAR_START_ALPHA,
  DARK_BOLT_SCAR_TINT,
  DARK_BOLT_SCORCH_ENABLED,
  DARK_BOLT_SCORCH_EMIT_INTERVAL_MS,
  DARK_BOLT_SCORCH_DIAMETER_PX,
  DARK_BOLT_SCORCH_DIAMETER_JITTER_PX,
  DARK_BOLT_SCORCH_STAMP_ALPHA,
  DARK_BOLT_SCORCH_LINGER_MS,
  DARK_BOLT_SCORCH_FADE_MS,
  DARK_BOLT_SCORCH_CORE_COLOR,
  DARK_BOLT_SCORCH_MID_COLOR,
  DARK_BOLT_SCORCH_EDGE_COLOR,
  DARK_BOLT_SCORCH_NOISE_DENSITY,
  DARK_BOLT_SCORCH_EDGE_NOISE_AMPLITUDE,
  DARK_BOLT_SCORCH_EDGE_NOISE_SLICES,
  DARK_BOLT_SCORCH_LENGTH_MULTIPLIER,
  DARK_BOLT_SCORCH_WIDTH_MULTIPLIER,
  DARK_BOLT_SCORCH_ROTATION_JITTER_RAD,
  DARK_BOLT_SHADOW_ENABLED,
  DARK_BOLT_SHADOW_SCALE_MULTIPLIER,
  DARK_BOLT_SHADOW_ALPHA,
  DARK_BOLT_SHADOW_TINT,
  DARK_BOLT_DEPTH,
} from '../../common/config';
import { registerSpell } from './spell-registry';
import type { CharacterGameObject } from '../common/character-game-object';

/**
 * DarkBolt — Hollow-Purple-inspired erasure projectile. Pickup-granted, cast
 * with R. Pierces through everything it touches and one-shots each target
 * exactly once (no rehits). Only ends on wall collision or lifetime expiry.
 *
 * Visual stack:
 *   - Blood Mage VFX3 sprite, color-cycle glow (purple ↔ indigo).
 *   - Camera screen-space displacement while alive (subtle — the bolt moves,
 *     so heavy warp would smear). Uses the VoidOrb displacement texture.
 *   - Trail of fading purple radiation streaks behind the bolt.
 *
 * Damage path: this class exposes `tryHitEnemy(enemy)` which the spellGroup
 * vs enemyGroup overlap in GameScene calls. Each enemy is deduped in
 * `#hitEnemies` so a pierce never double-taps the same target as it passes
 * through the body.
 */
type GlowFX = { color: number };

const TRAIL_DOT_TEXTURE_KEY = '__dark_bolt_trail_dot__';
function ensureTrailDotTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TRAIL_DOT_TEXTURE_KEY)) return;
  // 6×6 soft-edged white disc — tinted purple at runtime. Anti-aliased via two
  // overlapping circles so it doesn't look like an obvious pixel square.
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 0.55);
  g.fillCircle(3, 3, 3);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(3, 3, 2);
  g.generateTexture(TRAIL_DOT_TEXTURE_KEY, 6, 6);
  g.destroy();
}

/** Procedural radial-noise displacement texture used as a UV-offset map for
 *  the bolt's heat-haze preFX. Mirrors VoidOrb's `ensureDisplacementTexture`
 *  exactly so they share the same texture key — only one canvas gets
 *  generated whether VoidOrb fires first, DarkBolt fires first, or both. */
function ensureDisplacementTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(ASSET_KEYS.VOID_ORB_DISPLACEMENT)) return;
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

/** Procedural scorch-patch texture — radial colour bands (red core → black
 *  mid → gray edge → transparent rim) with per-pixel noise swaps in the
 *  transition zones so the bands look granular and "burnt" instead of smoothly
 *  graduated. Generated once per scene, cached by texture key. */
const SCORCH_TEXTURE_KEY = '__dark_bolt_scorch__';
function ensureScorchTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(SCORCH_TEXTURE_KEY)) return;
  const size = 64;
  const tex = scene.textures.createCanvas(SCORCH_TEXTURE_KEY, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  const img = ctx.createImageData(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2;
  // Radial-band boundaries as fractions of maxR. Transitions between bands
  // get noise-stippled so the change isn't a clean ring.
  const coreEnd = 0.30;
  const midEnd = 0.65;
  const edgeEnd = 1.00;

  // Helper to extract RGB channels from a 0xRRGGBB literal.
  const ch = (c: number) => ({ r: (c >> 16) & 0xff, g: (c >> 8) & 0xff, b: c & 0xff });
  const core = ch(DARK_BOLT_SCORCH_CORE_COLOR);
  const mid = ch(DARK_BOLT_SCORCH_MID_COLOR);
  const edge = ch(DARK_BOLT_SCORCH_EDGE_COLOR);

  // Per-angle radial perturbation — turns the disc into a lumpy irregular
  // blob. Precompute one random offset per angular slice; pixels interpolate
  // between the two slices their angle falls between so neighbouring lumps
  // are smooth (cosine blend), not staircased. Subtract from the band
  // boundaries so "positive" noise = wider band (lumps push outward), and
  // "negative" = thinner band (lumps pull inward). Without this the texture
  // is a clean circle and stacked patches read as a row of round blobs.
  const slices = DARK_BOLT_SCORCH_EDGE_NOISE_SLICES;
  const noise: number[] = new Array(slices);
  for (let s = 0; s < slices; s++) {
    noise[s] = (Math.random() - 0.5) * 2 * DARK_BOLT_SCORCH_EDGE_NOISE_AMPLITUDE;
  }
  const angleOffset = (angleRad: number): number => {
    // Map angle ∈ [-π, π] → continuous slice index ∈ [0, slices).
    const sliceFloat = ((angleRad + Math.PI) / (Math.PI * 2)) * slices;
    const sLow = Math.floor(sliceFloat) % slices;
    const sHigh = (sLow + 1) % slices;
    const frac = sliceFloat - Math.floor(sliceFloat);
    // Cosine ease so lump edges are rounded rather than triangular.
    const eased = 0.5 - 0.5 * Math.cos(frac * Math.PI);
    return noise[sLow] * (1 - eased) + noise[sHigh] * eased;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const baseT = dist / maxR;
      // Shift the effective radial position by the per-angle lump offset, so
      // some angles "extend" further (smaller effective t at the same dist)
      // and others "retract". Equivalent to perturbing every band boundary
      // by the same offset, in unison.
      const angle = Math.atan2(dy, dx);
      const t = baseT - angleOffset(angle);
      if (t >= edgeEnd) {
        // Outside the perturbed disc — fully transparent.
        const i = (y * size + x) * 4;
        img.data[i + 3] = 0;
        continue;
      }
      // Pick the band this pixel belongs to.
      let bandColor: { r: number; g: number; b: number };
      let alpha = 255;
      if (t < coreEnd) {
        bandColor = core;
      } else if (t < midEnd) {
        bandColor = mid;
      } else {
        bandColor = edge;
        // Fade alpha across the gray ring so the patch dissolves into the
        // surrounding ground instead of stamping a hard circle.
        const local = Math.max(0, (t - midEnd) / (edgeEnd - midEnd));
        alpha = Math.round(255 * (1 - local));
      }
      // Noise stipple: in the transition zones, swap with a neighbouring
      // band's colour with probability NOISE_DENSITY. Wider zones (±10% of
      // maxR around each boundary) keep the granular look organic.
      const nearBoundary =
        Math.abs(t - coreEnd) < 0.10 || Math.abs(t - midEnd) < 0.10;
      if (nearBoundary && Math.random() < DARK_BOLT_SCORCH_NOISE_DENSITY) {
        // Pick the OPPOSITE neighbouring band to maximize contrast.
        if (t < coreEnd + 0.10) bandColor = mid;
        else if (t < midEnd + 0.10) bandColor = (Math.random() < 0.5 ? core : edge);
        else bandColor = mid;
      }
      const i = (y * size + x) * 4;
      img.data[i + 0] = bandColor.r;
      img.data[i + 1] = bandColor.g;
      img.data[i + 2] = bandColor.b;
      img.data[i + 3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}

/** Tiny flat white rectangle used as the scar-trail segment sprite. Origin (0.5,
 *  0.5) — the segment is placed at the bolt's centre and rotated to heading so
 *  its length runs ALONG the flight path. */
const SCAR_SEGMENT_TEXTURE_KEY = '__dark_bolt_scar_segment__';
function ensureScarSegmentTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(SCAR_SEGMENT_TEXTURE_KEY)) return;
  const W = Math.max(1, DARK_BOLT_SCAR_SEGMENT_LENGTH_PX);
  const H = Math.max(1, DARK_BOLT_SCAR_SEGMENT_THICKNESS_PX);
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, W, H);
  g.generateTexture(SCAR_SEGMENT_TEXTURE_KEY, W, H);
  g.destroy();
}

/** Canvas-backed radial-gradient disc used as the environment glow sprite —
 *  ADD-blended onto the world so it lights up the ground/walls around the bolt.
 *  Generated once per scene, cached by texture key. White center → fully
 *  transparent rim so when tinted red the falloff is smooth. */
export const DARK_BOLT_ENV_LIGHT_TEXTURE_KEY = '__dark_bolt_env_light__';
// Backwards-compat local alias — only refactored callers in this file changed.
const ENV_LIGHT_TEXTURE_KEY = DARK_BOLT_ENV_LIGHT_TEXTURE_KEY;
export function ensureDarkBoltEnvLightTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(ENV_LIGHT_TEXTURE_KEY)) return;
  const size = 128; // texture resolution — gets scaled to RADIUS at use time
  const tex = scene.textures.createCanvas(ENV_LIGHT_TEXTURE_KEY, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  const r = size / 2;
  // Two-stop gradient with an early plateau so the bolt's core is fully lit
  // and the falloff happens in the outer half. Without the plateau the light
  // looks anaemic — the bolt sits in a barely-lit spot.
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0.00, 'rgba(255,255,255,1.00)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.60, 'rgba(255,255,255,0.30)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

// Camera-level displacement controller. Created on construct, torn down on
// destroy. Multiple concurrent DarkBolts each add their own — we tear down
// ONLY the one we added.
type DisplacementFX = unknown & { destroy?: () => void };
function addCameraScreenWarp(scene: Phaser.Scene): DisplacementFX | null {
  const cx = DARK_BOLT_CAMERA_DISTORTION_X as number;
  const cy = DARK_BOLT_CAMERA_DISTORTION_Y as number;
  if (cx === 0 && cy === 0) return null;
  type FXCam = Phaser.Cameras.Scene2D.Camera & {
    postFX?: { addDisplacement: (texture: string, x: number, y: number) => DisplacementFX };
  };
  const cam = scene.cameras.main as FXCam;
  if (!cam.postFX) return null;
  // Reuse VoidOrb's displacement texture if available; otherwise the orb's
  // module will ensure it on its first cast. If neither has fired yet we
  // silently skip the warp instead of blocking on texture creation here.
  if (!scene.textures.exists(ASSET_KEYS.VOID_ORB_DISPLACEMENT)) return null;
  return cam.postFX.addDisplacement(ASSET_KEYS.VOID_ORB_DISPLACEMENT, cx, cy);
}

function removeCameraScreenWarp(scene: Phaser.Scene, fx: DisplacementFX | null): void {
  if (!fx) return;
  type FXCam = Phaser.Cameras.Scene2D.Camera & {
    postFX?: { remove: (fx: unknown) => void };
  };
  const cam = scene.cameras.main as FXCam;
  cam.postFX?.remove(fx);
}

/** Attach pre-FX glow to the bolt sprite. Returns the FX handle so we can
 *  mutate `color` each frame for the color-cycle pulse. */
function applyBoltGlow(sprite: Phaser.GameObjects.Sprite): GlowFX | null {
  type PreFXCapable = Phaser.GameObjects.Sprite & {
    preFX?: {
      addGlow: (color?: number, outerStrength?: number, innerStrength?: number, knockout?: boolean) => GlowFX;
    };
  };
  const s = sprite as PreFXCapable;
  if (!s.preFX) return null;
  return s.preFX.addGlow(
    DARK_BOLT_GLOW_COLOR_A,
    DARK_BOLT_GLOW_OUTER_STRENGTH,
    DARK_BOLT_GLOW_INNER_STRENGTH,
    false,
  );
}

/** Attach a self-displacement preFX to the bolt sprite — warps its own pixels
 *  each frame using the radial-noise texture as a UV offset map. This is the
 *  "heat haze" effect: the bolt's body shimmers as if bending the air around
 *  it. Silent no-op if the FX pipeline isn't available. */
function applyBoltHeatHaze(sprite: Phaser.GameObjects.Sprite): void {
  type PreFXCapable = Phaser.GameObjects.Sprite & {
    preFX?: {
      addDisplacement: (texture: string, x: number, y: number) => unknown;
    };
  };
  const s = sprite as PreFXCapable;
  if (!s.preFX) return;
  const x = DARK_BOLT_HEAT_HAZE_X as number;
  const y = DARK_BOLT_HEAT_HAZE_Y as number;
  if (x === 0 && y === 0) return;
  s.preFX.addDisplacement(ASSET_KEYS.VOID_ORB_DISPLACEMENT, x, y);
}

export class DarkBolt extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.DARKNESS;
  readonly spellId: SpellId = SPELL_ID.DARK_BOLT;
  readonly spellType: SpellType = SPELL_TYPE.PROJECTILE;
  readonly manaCost: number = 0;
  readonly cooldown: number = 0;

  #lifetimeTimer: Phaser.Time.TimerEvent | undefined;
  #trailTimer: Phaser.Time.TimerEvent | undefined;
  // Scar trail — fading line segments dropped along the bolt's path. Each
  // segment stays in place (it's the "cut" left behind) and fades over its
  // lifetime. Stored on the bolt only as a TimerEvent handle; segments
  // self-destruct via their own tween onComplete, so we don't track them.
  #scarTimer: Phaser.Time.TimerEvent | undefined;
  // Ground scorch trail — a single per-cast RenderTexture that the bolt
  // paints scorch stamps onto. One canvas + alpha-composited stamps = the
  // trail reads as one continuous mass, not stacked sprites. The RT outlives
  // the bolt (lingers + fades) so the trail is still visible (and, soon,
  // damaging) after the projectile is gone — see #handoffScorchTrail.
  #scorchTimer: Phaser.Time.TimerEvent | undefined;
  #scorchRT: Phaser.GameObjects.RenderTexture | undefined;
  #scorchStamper: Phaser.GameObjects.Image | undefined;
  // RT local-coord conversion needs the world position the RT was placed at
  // (cast point) and half the RT size — see #stampScorch for the math.
  #scorchRTOriginX: number = 0;
  #scorchRTOriginY: number = 0;
  #scorchRTHalf: number = 0;
  #glow: GlowFX | null = null;
  #cameraFX: DisplacementFX | null = null;
  #startTime: number;
  #headingAngle: number;
  // Environment glow — ADD-blended radial sprite that lights up the ground
  // around the bolt. Position is synced each frame in #onSceneUpdate, and the
  // alpha breathes on the same sine wave as the pre-FX glow color cycle so
  // the sprite halo and the environment light pulse together.
  #envLight: Phaser.GameObjects.Image | undefined;
  // Shadow halo — duplicate sprite at 1.15× scale, tinted black, drawn behind
  // the bolt. Plays the same animation in sync; we copy frame + transform each
  // update so the wobble + rotation jitter apply to both layers.
  #shadow: Phaser.GameObjects.Sprite | undefined;
  // Wobble tweens — yoyo'ing sine pulses on scale and rotation. Tracked so we
  // can stop them on destroy; otherwise they keep updating a destroyed target.
  #wobbleScaleTween: Phaser.Tweens.Tween | undefined;
  #wobbleRotTween: Phaser.Tweens.Tween | undefined;
  // Pierce dedupe — each enemy is one-shot AT MOST ONCE per bolt as it passes
  // through. Without this, frame-rate dependent overlap callbacks would re-fire
  // every tick and burn through the slot's damage cap repeatedly.
  #hitEnemies: WeakSet<CharacterGameObject> = new WeakSet();
  #isExploding: boolean = false;

  get baseDamage(): number {
    return RUNTIME_CONFIG.DARK_BOLT_DAMAGE;
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, targetX: number, targetY: number) {
    super(scene, x, y, ASSET_KEYS.DARK_BOLT_BM_VFX3, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 0.5);
    this.setScale(DARK_BOLT_DISPLAY_SCALE);
    // Above regular spells (depth 3) — so when the bolt overlaps lightning
    // beams / strikes during the consume linger, it renders ON TOP of them.
    this.setDepth(DARK_BOLT_DEPTH);

    // Tight circular body centred on the orb's visual core. setCircle takes the
    // OFFSET in source-texture pixels (frames are 128×128) — recentre on the
    // frame so the hitbox follows the sprite origin.
    const r = DARK_BOLT_BODY_RADIUS;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(r, 64 - r, 64 - r);
    body.setAllowGravity(false);

    // Heading + velocity. Cache the angle so the trail emitter can drop
    // particles BEHIND the bolt instead of along its current jitter direction.
    this.#headingAngle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    const speed = RUNTIME_CONFIG.DARK_BOLT_SPEED;
    body.setVelocity(Math.cos(this.#headingAngle) * speed, Math.sin(this.#headingAngle) * speed);

    // Rotate the sprite to face heading. The BloodMage VFX3 art "points right"
    // (trail wisps run to the left in the source frames), so heading angle in
    // radians maps directly to sprite rotation with no offset.
    this.setRotation(this.#headingAngle);

    // Animate the 4-frame loop. The sheet anim was created in preload.
    this.play(ASSET_KEYS.DARK_BOLT_BM_VFX3);

    // Pre-FX glow + (optional) self-displacement heat haze + camera distortion.
    // Self-displacement and camera warp both rely on the radial-noise texture;
    // ensure it exists here so the FX work even on the very first DarkBolt
    // cast (VoidOrb is the other module that generates it).
    ensureDisplacementTexture(scene);
    this.#glow = applyBoltGlow(this);
    if (DARK_BOLT_HEAT_HAZE_ENABLED) {
      applyBoltHeatHaze(this);
    }
    this.#cameraFX = addCameraScreenWarp(scene);
    this.#startTime = scene.time.now;

    // Shadow halo — drawn FIRST so it sits behind the bolt sprite. Same texture
    // and animation; transform is synced each update so the wobble carries over.
    if (DARK_BOLT_SHADOW_ENABLED) {
      this.#shadow = scene.add.sprite(x, y, ASSET_KEYS.DARK_BOLT_BM_VFX3, 0);
      this.#shadow.setOrigin(0.5, 0.5);
      this.#shadow.setScale(DARK_BOLT_DISPLAY_SCALE * DARK_BOLT_SHADOW_SCALE_MULTIPLIER);
      this.#shadow.setTintFill(DARK_BOLT_SHADOW_TINT); // tintFill = solid black silhouette
      this.#shadow.setAlpha(DARK_BOLT_SHADOW_ALPHA);
      this.#shadow.setDepth(2.92); // below the bolt (depth 3) and the trail (2.95)
      this.#shadow.play(ASSET_KEYS.DARK_BOLT_BM_VFX3);
    }

    // Environment light — additive red disc that follows the bolt and lights
    // up the ground/walls around it. Created BEFORE the bolt sprite is drawn
    // (lower depth) so the bolt sits inside its own halo.
    if (DARK_BOLT_ENV_LIGHT_ENABLED) {
      ensureDarkBoltEnvLightTexture(scene);
      this.#envLight = scene.add.image(x, y, ENV_LIGHT_TEXTURE_KEY);
      this.#envLight.setOrigin(0.5, 0.5);
      // Disc texture is 128 px wide. setDisplaySize scales it to 2× the
      // configured radius so the gradient's full diameter matches the intended
      // light footprint.
      const diameter = DARK_BOLT_ENV_LIGHT_RADIUS_PX * 2;
      this.#envLight.setDisplaySize(diameter, diameter);
      this.#envLight.setTint(DARK_BOLT_ENV_LIGHT_TINT);
      this.#envLight.setBlendMode(Phaser.BlendModes.ADD);
      this.#envLight.setAlpha(DARK_BOLT_ENV_LIGHT_ALPHA);
      this.#envLight.setDepth(2.9); // below the shadow + bolt + trail
    }

    // Scale wobble + rotation jitter — gated off for now (looked too wiggly).
    // Tweens stay in-place so flipping DARK_BOLT_WOBBLE_ENABLED back on after
    // re-tuning the amplitudes is a one-line change in config.
    if (DARK_BOLT_WOBBLE_ENABLED) {
      // Both axes tween independently with slightly different ranges so the
      // bolt also squashes a little, not just pulses uniformly.
      const scaleAmp = DARK_BOLT_WOBBLE_SCALE_AMPLITUDE;
      this.#wobbleScaleTween = scene.tweens.add({
        targets: this,
        scaleX: { from: DARK_BOLT_DISPLAY_SCALE * (1 - scaleAmp * 0.5), to: DARK_BOLT_DISPLAY_SCALE * (1 + scaleAmp) },
        scaleY: { from: DARK_BOLT_DISPLAY_SCALE * (1 + scaleAmp * 0.5), to: DARK_BOLT_DISPLAY_SCALE * (1 - scaleAmp) },
        duration: DARK_BOLT_WOBBLE_PERIOD_MS,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });

      // Rotation jitter on a different period so scale + rotation drift in
      // and out of phase, avoiding a single-heartbeat look.
      const rotAmp = (DARK_BOLT_WOBBLE_ROT_AMPLITUDE_DEG * Math.PI) / 180;
      this.#wobbleRotTween = scene.tweens.add({
        targets: this,
        rotation: { from: -rotAmp, to: rotAmp },
        duration: DARK_BOLT_WOBBLE_ROT_PERIOD_MS,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }

    // Pre-cast windup — expanding red flash at the cast point. Reads as a
    // burst of imaginary mass releasing the projectile. Reuses the env-light
    // gradient texture so we don't need a second canvas asset. Self-destructs
    // when the tween completes; if the bolt is destroyed first (wall hit),
    // the flash keeps going and ends on its own — that's intentional, the
    // release energy outlives the projectile leaving the cast point.
    if (DARK_BOLT_WINDUP_ENABLED) {
      ensureDarkBoltEnvLightTexture(scene);
      const baseDiameter = DARK_BOLT_ENV_LIGHT_RADIUS_PX * 2;
      const windup = scene.add.image(x, y, ENV_LIGHT_TEXTURE_KEY);
      windup.setOrigin(0.5, 0.5);
      windup.setDisplaySize(baseDiameter * DARK_BOLT_WINDUP_START_SCALE, baseDiameter * DARK_BOLT_WINDUP_START_SCALE);
      windup.setTint(DARK_BOLT_WINDUP_TINT);
      windup.setBlendMode(Phaser.BlendModes.ADD);
      windup.setAlpha(DARK_BOLT_WINDUP_START_ALPHA);
      windup.setDepth(2.88); // beneath the env-light disc + everything else
      scene.tweens.add({
        targets: windup,
        displayWidth: baseDiameter * DARK_BOLT_WINDUP_END_SCALE,
        displayHeight: baseDiameter * DARK_BOLT_WINDUP_END_SCALE,
        alpha: 0,
        duration: DARK_BOLT_WINDUP_DURATION_MS,
        ease: 'Quad.easeOut',
        onComplete: () => { if (windup.active) windup.destroy(); },
      });
    }

    // Camera shake — low-frequency rumble for the bolt's lifetime. Phaser
    // decays intensity linearly across the duration so the shake is loudest
    // at cast (matches the windup) and fades as the bolt travels. Calling
    // shake again interrupts any previous shake; if multiple bolts overlap
    // the most-recent cast wins, which is fine.
    if (DARK_BOLT_SHAKE_ENABLED) {
      scene.cameras.main.shake(DARK_BOLT_SHAKE_DURATION_MS, DARK_BOLT_SHAKE_INTENSITY, false);
    }

    // Trail emitter
    if (DARK_BOLT_TRAIL_ENABLED) {
      ensureTrailDotTexture(scene);
      this.#trailTimer = scene.time.addEvent({
        delay: DARK_BOLT_TRAIL_EMIT_INTERVAL_MS,
        loop: true,
        callback: this.#emitTrail,
        callbackScope: this,
      });
    }

    // Scar emitter — drops short fading line segments at the bolt's current
    // position. Stacking enough of them at tight intervals makes the bolt's
    // flight path read as a single continuous red cut.
    if (DARK_BOLT_SCAR_ENABLED) {
      ensureScarSegmentTexture(scene);
      this.#scarTimer = scene.time.addEvent({
        delay: DARK_BOLT_SCAR_EMIT_INTERVAL_MS,
        loop: true,
        callback: this.#emitScarSegment,
        callbackScope: this,
      });
    }

    // Scorch trail — painted as alpha-composited stamps onto ONE per-cast
    // RenderTexture instead of spawning separate sprite-per-stamp. Overlapping
    // stamps blend at the pixel level on the same canvas, so the trail reads
    // as a single continuous magical mass instead of a row of discrete blobs.
    // The RT also OUTLIVES the bolt — it lingers at full opacity, then fades —
    // which is what makes the trail viable as a future damage zone.
    if (DARK_BOLT_SCORCH_ENABLED) {
      ensureScorchTexture(scene);
      // RT size: cover the bolt's max possible flight in any direction from
      // its cast point, plus a stamp-diameter buffer on each side so the
      // last stamp at the tip doesn't clip the RT edge.
      const maxFlight = (RUNTIME_CONFIG.DARK_BOLT_SPEED * RUNTIME_CONFIG.DARK_BOLT_LIFETIME_MS) / 1000;
      const buffer = (DARK_BOLT_SCORCH_DIAMETER_PX + DARK_BOLT_SCORCH_DIAMETER_JITTER_PX) * DARK_BOLT_SCORCH_LENGTH_MULTIPLIER;
      const rtSize = Math.ceil((maxFlight + buffer) * 2);
      const rt = scene.add.renderTexture(x, y, rtSize, rtSize);
      rt.setOrigin(0.5, 0.5);
      rt.setDepth(0.4); // above floor tiles, below characters + the bolt
      this.#scorchRT = rt;
      this.#scorchRTOriginX = x;
      this.#scorchRTOriginY = y;
      this.#scorchRTHalf = rtSize / 2;
      // Reusable stamper image — we mutate its scale/rotation/alpha per emit
      // and call rt.draw() to composite it onto the RT. ONE image, never
      // added to the world (origin/visibility don't matter — we only use it
      // as a draw template).
      this.#scorchStamper = scene.add.image(0, 0, SCORCH_TEXTURE_KEY);
      this.#scorchStamper.setOrigin(0.5, 0.5);
      this.#scorchStamper.setVisible(false);
      this.#scorchTimer = scene.time.addEvent({
        delay: DARK_BOLT_SCORCH_EMIT_INTERVAL_MS,
        loop: true,
        callback: this.#stampScorch,
        callbackScope: this,
      });
    }

    // Auto-end after lifetime. Wall collisions also call `explode()` (registered
    // by the spell-vs-collision-layer collider in GameScene).
    this.#lifetimeTimer = scene.time.delayedCall(RUNTIME_CONFIG.DARK_BOLT_LIFETIME_MS, () => {
      if (this.active) this.explode();
    });

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.#onSceneUpdate, this);
  }

  /** Called by the spellGroup vs enemyGroup overlap in GameScene. Erases the
   *  enemy on first touch; subsequent overlaps with the same enemy are no-ops
   *  so the pierce reads as "one bolt, one hit per target".
   *
   *  Disintegration semantics: the bolt deals lethal damage AND immediately
   *  hides the enemy sprite + disables its body. The state machine still
   *  transitions to DEATH (which keeps existing network broadcast + cleanup
   *  paths working), but the death ANIMATION is never visible — the body
   *  just vanishes the frame it's hit, which is the "erased without a trace"
   *  feel the spell is meant to convey. */
  public tryHitEnemy(enemy: CharacterGameObject): void {
    if (this.#isExploding || !this.active) return;
    if (this.#hitEnemies.has(enemy)) return;
    if (!enemy.active || enemy.isDefeated) return;
    this.#hitEnemies.add(enemy);
    enemy.hit(DIRECTION.DOWN, this.baseDamage);
    if (enemy.isDefeated) {
      enemy.setVisible(false);
      const body = enemy.body as Phaser.Physics.Arcade.Body | null;
      if (body) body.enable = false;
    }
  }

  /** Walls (and lifetime expiry) end the bolt. Single shared teardown path so
   *  we don't leave dangling camera-FX or trail timers if either trigger fires. */
  public explode(): void {
    if (this.#isExploding) return;
    this.#isExploding = true;
    this.destroy();
  }

  #onSceneUpdate(_time: number, _delta: number): void {
    if (!this.active) return;
    // Glow color-cycle on a sin wave — reads as the imaginary mass "writhing".
    const elapsed = this.scene.time.now - this.#startTime;
    const t = (Math.sin((elapsed / DARK_BOLT_GLOW_COLOR_CYCLE_MS) * Math.PI * 2) + 1) * 0.5;
    if (this.#glow) {
      this.#glow.color = lerpColor(DARK_BOLT_GLOW_COLOR_A, DARK_BOLT_GLOW_COLOR_B, t);
    }

    // Environment light — track the bolt's position and breathe its alpha on
    // the same sine wave so the halo pulses with the sprite glow. The disc
    // size is fixed (set in constructor); only position + alpha change here.
    if (this.#envLight) {
      this.#envLight.setPosition(this.x, this.y);
      const pulse = DARK_BOLT_ENV_LIGHT_ALPHA + (t - 0.5) * 2 * DARK_BOLT_ENV_LIGHT_PULSE_AMPLITUDE;
      this.#envLight.setAlpha(Math.max(0, Math.min(1, pulse)));
    }

    // Shadow halo — mirror the bolt's full transform so wobble + rotation
    // jitter apply to both layers in lockstep. Frame syncs naturally because
    // both sprites started the same anim at the same time.
    if (this.#shadow && this.#shadow.active) {
      this.#shadow.setPosition(this.x, this.y);
      this.#shadow.setRotation(this.rotation);
      // Scale wobble is on `this` — multiply by the shadow's halo factor so
      // the silhouette stays slightly larger than the bolt as it pulses.
      this.#shadow.setScale(
        this.scaleX * DARK_BOLT_SHADOW_SCALE_MULTIPLIER,
        this.scaleY * DARK_BOLT_SHADOW_SCALE_MULTIPLIER,
      );
    }
  }

  /** Paint a single scorch stamp onto the per-cast RenderTexture. Uses the
   *  reusable #scorchStamper image as the draw template (no per-stamp
   *  allocation). Stamps are alpha-composited onto the RT, so overlapping
   *  emits blend at the pixel level into a single continuous magical mass
   *  instead of layering as visibly distinct sprites. */
  #stampScorch(): void {
    if (!this.active || this.#isExploding) return;
    const rt = this.#scorchRT;
    const stamper = this.#scorchStamper;
    if (!rt || !stamper) return;
    // Bolt world position → RT-local coords. The RT was placed at the cast
    // point with origin (0.5, 0.5), so its local (0,0) is the top-left and
    // (#scorchRTHalf, #scorchRTHalf) is the centre.
    const lx = this.x - this.#scorchRTOriginX + this.#scorchRTHalf;
    const ly = this.y - this.#scorchRTOriginY + this.#scorchRTHalf;
    // Per-stamp size jitter — keeps the trail from looking uniform.
    const half = DARK_BOLT_SCORCH_DIAMETER_JITTER_PX;
    const diameter = DARK_BOLT_SCORCH_DIAMETER_PX + (Math.random() - 0.5) * 2 * half;
    stamper.setDisplaySize(
      diameter * DARK_BOLT_SCORCH_LENGTH_MULTIPLIER,
      diameter * DARK_BOLT_SCORCH_WIDTH_MULTIPLIER,
    );
    const jitter = (Math.random() - 0.5) * 2 * DARK_BOLT_SCORCH_ROTATION_JITTER_RAD;
    stamper.setRotation(this.#headingAngle + jitter);
    stamper.setAlpha(DARK_BOLT_SCORCH_STAMP_ALPHA);
    rt.draw(stamper, lx, ly);
  }

  /** Detach the scorch RT from this bolt and hand it to the scene for its
   *  own lifetime — full opacity for LINGER_MS, then fade over FADE_MS, then
   *  destroy. Called from destroy() so the trail outlives the projectile. */
  #handoffScorchTrail(): void {
    const rt = this.#scorchRT;
    if (!rt || !this.scene) return;
    this.#scorchRT = undefined;
    const scene = this.scene;
    scene.time.delayedCall(DARK_BOLT_SCORCH_LINGER_MS, () => {
      if (!rt.active || !rt.scene) return;
      rt.scene.tweens.add({
        targets: rt,
        alpha: 0,
        duration: DARK_BOLT_SCORCH_FADE_MS,
        ease: 'Quad.easeIn',
        onComplete: () => { if (rt.active) rt.destroy(); },
      });
    });
  }

  /** Drop a single scar-line segment at the bolt's CURRENT position, oriented
   *  along the heading angle. The segment stays where it's dropped (no motion)
   *  and fades alpha to 0 over its lifetime — the bolt's flight path becomes
   *  a fading red scar in the world. Phaser sprite rotation is in radians; the
   *  segment texture is a horizontal rectangle so heading-radians applies
   *  directly with no offset. */
  #emitScarSegment(): void {
    if (!this.active || this.#isExploding) return;
    const scene = this.scene;
    if (!scene) return;
    const seg = scene.add.image(this.x, this.y, SCAR_SEGMENT_TEXTURE_KEY);
    seg.setOrigin(0.5, 0.5);
    seg.setRotation(this.#headingAngle);
    seg.setTint(DARK_BOLT_SCAR_TINT);
    seg.setBlendMode(Phaser.BlendModes.ADD);
    seg.setAlpha(DARK_BOLT_SCAR_START_ALPHA);
    seg.setDepth(2.93); // above shadow halo (2.92), below trail dots (2.95)
    scene.tweens.add({
      targets: seg,
      alpha: 0,
      duration: DARK_BOLT_SCAR_LIFETIME_MS,
      ease: 'Quad.easeOut',
      onComplete: () => { if (seg.active) seg.destroy(); },
    });
  }

  /** Spawn DARK_BOLT_TRAIL_PARTICLES_PER_EMIT streaks behind the bolt. Each
   *  particle is tweened over its lifetime to drift further backward and fade
   *  to alpha 0 — gives the bolt a tapering tail without using a real emitter. */
  #emitTrail(): void {
    if (!this.active || this.#isExploding) return;
    const scene = this.scene;
    if (!scene) return;
    const back = this.#headingAngle + Math.PI; // travel direction reversed
    const cosBack = Math.cos(back), sinBack = Math.sin(back);
    // Perpendicular axis for jitter so particles spread sideways from the path.
    const perp = back + Math.PI / 2;
    const cosPerp = Math.cos(perp), sinPerp = Math.sin(perp);
    for (let i = 0; i < DARK_BOLT_TRAIL_PARTICLES_PER_EMIT; i++) {
      const jitter = (Math.random() - 0.5) * 2 * DARK_BOLT_TRAIL_SPAWN_JITTER_PX;
      const startOffset = 6; // px back from the centre — keeps trail behind the orb
      const sx = this.x + cosBack * startOffset + cosPerp * jitter;
      const sy = this.y + sinBack * startOffset + sinPerp * jitter;
      const dist = (DARK_BOLT_TRAIL_DRIFT_SPEED * DARK_BOLT_TRAIL_PARTICLE_LIFETIME_MS) / 1000;
      const ex = sx + cosBack * dist;
      const ey = sy + sinBack * dist;
      const tint = Math.random() < 0.5 ? DARK_BOLT_TRAIL_TINT_A : DARK_BOLT_TRAIL_TINT_B;
      const sprite = scene.add.image(sx, sy, TRAIL_DOT_TEXTURE_KEY);
      sprite.setTint(tint);
      sprite.setBlendMode(Phaser.BlendModes.ADD);
      sprite.setDepth(2.95); // just below the bolt
      sprite.setScale(0.6 + Math.random() * 0.5);
      scene.tweens.add({
        targets: sprite,
        x: ex,
        y: ey,
        alpha: { from: 0.9, to: 0 },
        scale: 0.2,
        duration: DARK_BOLT_TRAIL_PARTICLE_LIFETIME_MS,
        ease: 'Quad.easeOut',
        onComplete: () => { if (sprite.active) sprite.destroy(); },
      });
    }
  }

  public destroy(fromScene?: boolean): void {
    this.scene?.events.off(Phaser.Scenes.Events.UPDATE, this.#onSceneUpdate, this);
    this.#lifetimeTimer?.destroy();
    this.#trailTimer?.destroy();
    // Scar segments self-destruct via their tweens; we only need to stop the
    // emitter so no more segments spawn after the bolt is gone.
    this.#scarTimer?.destroy();
    this.#scarTimer = undefined;
    // Stop scorch stamping; hand the painted RT off for its own linger+fade
    // lifetime so the trail survives the bolt (and will later act as a
    // damage zone). The temp stamper image dies with the bolt — only the
    // already-painted RT needs to outlive us.
    this.#scorchTimer?.destroy();
    this.#scorchTimer = undefined;
    this.#scorchStamper?.destroy();
    this.#scorchStamper = undefined;
    this.#handoffScorchTrail();
    // Stop wobble tweens BEFORE destroying their target so the tween system
    // doesn't try to mutate a dead sprite on its next tick.
    this.#wobbleScaleTween?.stop();
    this.#wobbleScaleTween = undefined;
    this.#wobbleRotTween?.stop();
    this.#wobbleRotTween = undefined;
    if (this.scene) removeCameraScreenWarp(this.scene, this.#cameraFX);
    this.#cameraFX = null;
    this.#envLight?.destroy();
    this.#envLight = undefined;
    this.#shadow?.destroy();
    this.#shadow = undefined;
    super.destroy(fromScene);
  }
}

registerSpell(SPELL_ID.DARK_BOLT, (scene, x, y, tx, ty) => new DarkBolt(scene, x, y, tx, ty));
