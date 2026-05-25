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

export class DarkBolt extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.DARKNESS;
  readonly spellId: SpellId = SPELL_ID.DARK_BOLT;
  readonly spellType: SpellType = SPELL_TYPE.PROJECTILE;
  readonly manaCost: number = 0;
  readonly cooldown: number = 0;

  #lifetimeTimer: Phaser.Time.TimerEvent | undefined;
  #trailTimer: Phaser.Time.TimerEvent | undefined;
  #glow: GlowFX | null = null;
  #cameraFX: DisplacementFX | null = null;
  #startTime: number;
  #headingAngle: number;
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
    this.setDepth(3);

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

    // Animate the 4-frame loop. The sheet anim was created in preload.
    this.play(ASSET_KEYS.DARK_BOLT_BM_VFX3);

    // Pre-FX glow + camera distortion (matches VoidOrb's stack, dialled down
    // because the bolt is moving).
    this.#glow = applyBoltGlow(this);
    this.#cameraFX = addCameraScreenWarp(scene);
    this.#startTime = scene.time.now;

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

    // Auto-end after lifetime. Wall collisions also call `explode()` (registered
    // by the spell-vs-collision-layer collider in GameScene).
    this.#lifetimeTimer = scene.time.delayedCall(RUNTIME_CONFIG.DARK_BOLT_LIFETIME_MS, () => {
      if (this.active) this.explode();
    });

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.#onSceneUpdate, this);
  }

  /** Called by the spellGroup vs enemyGroup overlap in GameScene. Erases the
   *  enemy on first touch; subsequent overlaps with the same enemy are no-ops
   *  so the pierce reads as "one bolt, one hit per target". */
  public tryHitEnemy(enemy: CharacterGameObject): void {
    if (this.#isExploding || !this.active) return;
    if (this.#hitEnemies.has(enemy)) return;
    if (!enemy.active || enemy.isDefeated) return;
    this.#hitEnemies.add(enemy);
    enemy.hit(DIRECTION.DOWN, this.baseDamage);
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
    if (this.scene) removeCameraScreenWarp(this.scene, this.#cameraFX);
    this.#cameraFX = null;
    super.destroy(fromScene);
  }
}

registerSpell(SPELL_ID.DARK_BOLT, (scene, x, y, tx, ty) => new DarkBolt(scene, x, y, tx, ty));
