import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { DIRECTION, ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import { DASH_DURATION_MS } from '../../common/config/dash';
import { registerSpell } from './spell-registry';
import { Player } from '../player/player';

/**
 * DashVfx — a stub "spell" used purely to propagate the dash-roll animation
 * across the WebRTC mesh. The local Player.dash() path runs the actual motion
 * + VFX locally and emits a SPELL_CAST event tagged with SPELL_ID.DASH so the
 * standard spell broadcast pipeline replays it on every other client.
 *
 * The factory below renders ONLY the dash-roll VFX behind the remote caster's
 * mage — there is no movement to replay (the remote player's position is
 * already streamed via the 60Hz PlayerUpdate broadcasts), and no hitbox.
 */
class DashVfx extends Phaser.GameObjects.Zone implements ActiveSpell {
  readonly element: Element = ELEMENT.WIND;
  readonly spellId: SpellId = SPELL_ID.DASH;
  readonly spellType: SpellType = SPELL_TYPE.AREA;
  readonly manaCost: number = 0;
  readonly cooldown: number = 0;
  readonly baseDamage: number = 0;

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 1, 1);
    scene.add.existing(this);
    scene.time.delayedCall(DASH_DURATION_MS + 100, () => {
      if (this.active) this.destroy();
    });
  }
}

registerSpell(SPELL_ID.DASH, (scene, cx, cy, tx, ty, dir, caster) => {
  // Local cast: the local Player.dash() already spawned the VFX. Skip — we
  // only want this factory to do work for REMOTE replays. The local-cast
  // detection mirrors AirBurst's (caster === scene.player).
  const localPlayer = (scene as unknown as { player?: unknown }).player;
  const isLocalCaster = caster !== undefined && caster === (localPlayer as unknown);

  if (!isLocalCaster && caster && typeof (caster as { x?: number }).x === 'number') {
    // Derive a unit direction. Prefer the (caster -> target) vector since the
    // dash key includes the WASD direction in the cast point. Fall back to
    // the caster's facing direction if the vector is degenerate.
    const c = caster as Phaser.GameObjects.Sprite & {
      x: number;
      y: number;
      depth: number;
      flipX: boolean;
      tint: number;
      tintFill: boolean;
      active: boolean;
      direction?: string;
    };
    let nx = tx - c.x;
    let ny = ty - c.y;
    const len = Math.hypot(nx, ny);
    if (len > 0.001) {
      nx /= len;
      ny /= len;
    } else {
      // Degenerate vector — use facing direction.
      switch (c.direction ?? dir) {
        case DIRECTION.LEFT:  nx = -1; ny = 0; break;
        case DIRECTION.RIGHT: nx = 1;  ny = 0; break;
        case DIRECTION.UP:    nx = 0;  ny = -1; break;
        case DIRECTION.DOWN:
        default:              nx = 0;  ny = 1;
      }
    }
    Player.spawnDashVfxFor(c, nx, ny);
  }

  return new DashVfx(scene, cx, cy);
});
