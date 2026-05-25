import * as Phaser from 'phaser';
import type { SpellId, Direction } from '../../common/types';
import { SPELL_ID } from '../../common/common';
import { ASSET_KEYS } from '../../common/assets';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import * as CONFIG from '../../common/config';

/**
 * Spell ghost system — telegraph previews that fire on the moment of cast and land
 * SPELL_GHOST_LEAD_MS *before* the real spell, so opposing mages get a reaction window.
 *
 * Design contract:
 *   - Ghosts are PURE VISUALS: no physics body, no damage, no game-state side effects.
 *   - For projectiles, the ghost travels at the real spell's speed so its flight time
 *     equals the real one's — start it LEAD_MS earlier and it lands LEAD_MS earlier.
 *   - For area spells, the ghost is a static dimmed sprite at the target, alive for
 *     LEAD_MS, then destroyed exactly as the real spell takes over.
 *   - Tint + alpha are read from RUNTIME_CONFIG so they can be tuned at runtime.
 *
 * Not covered by v1 (intentional):
 *   - FireBreath (channeled — would need a beam preview)
 *   - EarthWall (draw mode, not factory-cast)
 */

export type SpellGhostFactory = (
  scene: Phaser.Scene,
  casterX: number,
  casterY: number,
  targetX: number,
  targetY: number,
  direction: Direction,
) => void;

export const SPELL_GHOST_FACTORY_REGISTRY: Partial<Record<SpellId, SpellGhostFactory>> = {};

function registerGhost(spellId: SpellId, factory: SpellGhostFactory): void {
  SPELL_GHOST_FACTORY_REGISTRY[spellId] = factory;
}

// ---------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------

/** Apply the shared ghost look (tint + alpha + depth) to any preview sprite. */
function dressGhost(sprite: Phaser.GameObjects.Sprite): void {
  sprite.setAlpha(RUNTIME_CONFIG.SPELL_GHOST_ALPHA);
  sprite.setTint(RUNTIME_CONFIG.SPELL_GHOST_TINT);
  // Depth just under spells (which sit at 3) so ghosts visually read as "behind" the
  // real action while still being on top of the world tiles.
  sprite.setDepth(2.8);
}

/**
 * Projectile ghost: flies from caster to target at the given speed, then self-destructs.
 * Speed matches the real spell, so ghost arrival lands exactly LEAD_MS before the real
 * spell's arrival (since both travel the same distance at the same speed but the ghost
 * starts LEAD_MS earlier).
 */
function makeProjectileGhost(
  scene: Phaser.Scene,
  casterX: number,
  casterY: number,
  targetX: number,
  targetY: number,
  textureKey: string,
  animKey: string | null,
  speed: number,
  options?: { rotateToAim?: boolean; spriteOriginX?: number; spriteOriginY?: number },
): void {
  const ghost = scene.add.sprite(casterX, casterY, textureKey);
  dressGhost(ghost);
  if (options?.spriteOriginX !== undefined || options?.spriteOriginY !== undefined) {
    ghost.setOrigin(options.spriteOriginX ?? 0.5, options.spriteOriginY ?? 0.5);
  }
  if (animKey !== null) ghost.play(animKey);

  const angle = Phaser.Math.Angle.Between(casterX, casterY, targetX, targetY);
  if (options?.rotateToAim !== false) ghost.setRotation(angle);

  // Travel duration in ms = distance / speed * 1000. Going beyond the target lets the
  // ghost overshoot a touch (so a player still in flight when the ghost reaches the
  // aim point sees it pass through their position cleanly).
  const dx = targetX - casterX;
  const dy = targetY - casterY;
  const distance = Math.hypot(dx, dy);
  const flightMs = Math.max(40, (distance / speed) * 1000);

  // Tween straight-line at constant speed — matches the real spell which uses
  // setVelocity (also constant). Overshoot by 20% so the ghost visibly passes through
  // the target, hammering home "this lands HERE in a moment".
  const overshoot = 1.2;
  scene.tweens.add({
    targets: ghost,
    x: casterX + dx * overshoot,
    y: casterY + dy * overshoot,
    duration: flightMs * overshoot,
    ease: 'Linear',
    onComplete: () => ghost.destroy(),
  });
}

/**
 * Area-at-target ghost: a single dimmed sprite anchored at the cast target. Alive for
 * SPELL_GHOST_LEAD_MS and then destroyed — the real spell takes its place visually at
 * the moment the ghost dies.
 */
function makeAreaGhost(
  scene: Phaser.Scene,
  targetX: number,
  targetY: number,
  textureKey: string,
  options?: {
    yOffset?: number;
    originX?: number;
    originY?: number;
    scale?: number;
  },
): void {
  const y = targetY + (options?.yOffset ?? 0);
  const ghost = scene.add.sprite(targetX, y, textureKey);
  dressGhost(ghost);
  ghost.setOrigin(options?.originX ?? 0.5, options?.originY ?? 0.5);
  if (options?.scale !== undefined) ghost.setScale(options.scale);
  scene.time.delayedCall(RUNTIME_CONFIG.SPELL_GHOST_LEAD_MS, () => {
    if (ghost.active) ghost.destroy();
  });
}

// ---------------------------------------------------------------------------------------
// Per-spell ghost factories
// ---------------------------------------------------------------------------------------

// --- Projectiles ---

registerGhost(SPELL_ID.FIRE_BOLT, (scene, cx, cy, tx, ty) => {
  makeProjectileGhost(scene, cx, cy, tx, ty, ASSET_KEYS.FIRE_BOLT, ASSET_KEYS.FIRE_BOLT, RUNTIME_CONFIG.FIRE_BOLT_SPEED, {
    spriteOriginX: RUNTIME_CONFIG.FIRE_BOLT_SPRITE_ORIGIN_X,
    spriteOriginY: RUNTIME_CONFIG.FIRE_BOLT_SPRITE_ORIGIN_Y,
  });
});

registerGhost(SPELL_ID.EARTH_BOLT, (scene, cx, cy, tx, ty) => {
  makeProjectileGhost(scene, cx, cy, tx, ty, ASSET_KEYS.EARTH_BOLT, ASSET_KEYS.EARTH_BOLT, RUNTIME_CONFIG.EARTH_BOLT_SPEED, {
    spriteOriginX: RUNTIME_CONFIG.EARTH_BOLT_SPRITE_ORIGIN_X,
    spriteOriginY: RUNTIME_CONFIG.EARTH_BOLT_SPRITE_ORIGIN_Y,
  });
});

registerGhost(SPELL_ID.ICE_SHARD, (scene, cx, cy, tx, ty) => {
  makeProjectileGhost(scene, cx, cy, tx, ty, ASSET_KEYS.ICE_SHARD, ASSET_KEYS.ICE_SHARD, RUNTIME_CONFIG.ICE_SHARD_SPEED);
});

registerGhost(SPELL_ID.WIND_BOLT, (scene, cx, cy, tx, ty) => {
  makeProjectileGhost(scene, cx, cy, tx, ty, ASSET_KEYS.WIND_BOLT, ASSET_KEYS.WIND_BOLT, RUNTIME_CONFIG.WIND_BOLT_SPEED);
});

// --- Area at target ---

registerGhost(SPELL_ID.FIRE_AREA, (scene, _cx, _cy, tx, ty) => {
  // FireArea's first frame is the white explosion start — use it as the ghost preview.
  makeAreaGhost(scene, tx, ty, ASSET_KEYS.FIRE_AREA_EXPLOSION);
});

registerGhost(SPELL_ID.THUNDER_STRIKE, (scene, _cx, _cy, tx, ty) => {
  // Thunder strike sprite anchors bottom-center on the cast point. We do the same here
  // so the ghost lines up with the eventual strike.
  makeAreaGhost(scene, tx, ty, ASSET_KEYS.THUNDER_STRIKE, { originX: 0.5, originY: 1 });
});

registerGhost(SPELL_ID.WATER_SPIKE, (scene, _cx, _cy, tx, ty) => {
  // Real spike anchors its startup puddle at (tx, ty) with origin (0.5, 1). Match that.
  makeAreaGhost(scene, tx, ty, ASSET_KEYS.WATER_SPIKE_STARTUP, { originX: 0.5, originY: 1 });
});

registerGhost(SPELL_ID.WATER_TORNADO, (scene, _cx, _cy, tx, ty) => {
  // Real tornado sprite is positioned y - 48 from target (see water-tornado.ts).
  makeAreaGhost(scene, tx, ty, ASSET_KEYS.WATER_TORNADO_STARTUP_LOOP, { yOffset: -48 });
});

registerGhost(SPELL_ID.EARTH_BUMP, (scene, _cx, _cy, tx, ty) => {
  makeAreaGhost(scene, tx, ty, ASSET_KEYS.EARTH_BUMP);
});

registerGhost(SPELL_ID.VOID_ORB, (scene, _cx, _cy, tx, ty) => {
  // Use frame 0 of the lightning_burst_003 series — the first wisp the real orb shows.
  makeAreaGhost(scene, tx, ty, `${ASSET_KEYS.LIGHTNING_BURST_003}_0`);
});

// ---------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------

/**
 * Spawn the ghost preview for the given spell if one is registered. Returns true if a
 * ghost was spawned (caller should then delay the real spell by SPELL_GHOST_LEAD_MS),
 * false to fire the real spell immediately (no telegraph available / disabled).
 */
export function maybeSpawnGhost(
  scene: Phaser.Scene,
  spellId: SpellId,
  casterX: number,
  casterY: number,
  targetX: number,
  targetY: number,
  direction: Direction,
): boolean {
  if (!CONFIG.SPELL_GHOST_PREVIEW_ENABLED) return false;
  if (RUNTIME_CONFIG.SPELL_GHOST_LEAD_MS <= 0) return false;
  const factory = SPELL_GHOST_FACTORY_REGISTRY[spellId];
  if (!factory) return false;
  factory(scene, casterX, casterY, targetX, targetY, direction);
  return true;
}
