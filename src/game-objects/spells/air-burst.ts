import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE, DIRECTION } from '../../common/common';
import {
  AIR_BURST_COOLDOWN,
  AIR_BURST_DURATION_MS,
  AIR_BURST_MANA_COST,
  AIR_BURST_VFX_OFFSET_PX,
  AIR_BURST_VFX_SCALE,
} from '../../common/config';
import { registerSpell } from './spell-registry';

/**
 * AirBurst — the wind super-dash spell. The "spell game object" itself is just a stub:
 * an invisible Zone that lives long enough for the SpellCastingComponent tracking pipeline
 * (#activeSpells, spellGroup, DESTROY event hook) to register the cast, then auto-destroys.
 * The actual dash + VFX are owned by the Player (see Player.dashSuper()), which is the
 * caller that drives this factory.
 *
 * Damage: none. The dash is the spell's effect — there's no projectile or AOE hitbox.
 */
export class AirBurst extends Phaser.GameObjects.Zone implements ActiveSpell {
  readonly element: Element = ELEMENT.WIND;
  readonly spellId: SpellId = SPELL_ID.AIR_BURST;
  readonly spellType: SpellType = SPELL_TYPE.AREA; // closest match — the burst is at-caster, not a projectile
  readonly manaCost: number = AIR_BURST_MANA_COST;
  readonly cooldown: number = AIR_BURST_COOLDOWN;
  readonly baseDamage: number = 0;

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 1, 1);
    scene.add.existing(this);
    // Auto-cleanup once the dash window has closed — the dash + VFX are independent
    // game objects tracked by the Player, so this stub no longer matters.
    scene.time.delayedCall(AIR_BURST_DURATION_MS + 100, () => {
      if (this.active) this.destroy();
    });
  }

  /** Spawn the 3x3 air-burst sheet behind a remote-caster mage (no dash trigger). */
  static spawnRemoteVfx(
    scene: Phaser.Scene,
    caster: Phaser.GameObjects.GameObject & { x: number; y: number; direction?: string },
  ): void {
    // Pick a unit vector for the trail using the caster's facing if present; that's the
    // best signal we have on the remote end (PlayerUpdate broadcasts the facing direction).
    let nx = 0;
    let ny = 1;
    switch (caster.direction) {
      case DIRECTION.LEFT:  nx = -1; ny =  0; break;
      case DIRECTION.RIGHT: nx =  1; ny =  0; break;
      case DIRECTION.UP:    nx =  0; ny = -1; break;
      case DIRECTION.DOWN:
      default:              nx =  0; ny =  1;
    }
    const angle = Math.atan2(ny, nx);
    const burst = scene.add.sprite(
      caster.x - nx * AIR_BURST_VFX_OFFSET_PX,
      caster.y - ny * AIR_BURST_VFX_OFFSET_PX,
      ASSET_KEYS.AIR_BURST,
      0,
    );
    burst.setOrigin(0.5, 0.5);
    burst.setDepth((caster as unknown as { depth?: number }).depth ?? 3);
    burst.setRotation(angle);
    burst.setScale(AIR_BURST_VFX_SCALE);
    burst.play(ASSET_KEYS.AIR_BURST);
    burst.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => burst.destroy());
  }
}

// AirBurst factory.
// Local cast: the SpellCastingComponent passes the local Player as `caster`, which exposes
// dashSuper() — calling it does the actual movement + the air-burst trail VFX behind the
// mage. Remote cast: the GameScene passes the remote Player as `caster`; we still need the
// VFX to render behind that remote mage, but the dash itself is replayed by the network's
// PlayerUpdate broadcasts (don't double-dash). So: same dashSuper call either way is wrong
// — instead, on remote we just spawn the visual.
registerSpell(SPELL_ID.AIR_BURST, (scene, cx, cy, _tx, _ty, _dir, caster) => {
  const localPlayer = (scene as unknown as { player?: unknown }).player as
    | { dashSuper?: () => void }
    | undefined;
  const isLocalCaster = caster !== undefined && caster === (localPlayer as unknown);

  if (isLocalCaster) {
    localPlayer?.dashSuper?.();
  } else if (caster && typeof (caster as { x?: number }).x === 'number') {
    // Remote (or non-Player) caster: render just the burst VFX behind them. We don't
    // know their dash direction explicitly — use their facing if exposed, else fall back
    // to a small drift along the (caster → cast point) vector.
    AirBurst.spawnRemoteVfx(scene, caster as Phaser.GameObjects.GameObject & { x: number; y: number; direction?: string });
  }

  return new AirBurst(scene, cx, cy);
});
