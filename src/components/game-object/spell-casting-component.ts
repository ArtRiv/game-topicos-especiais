import * as Phaser from 'phaser';
import { GameObject } from '../../common/types';
import { DIRECTION } from '../../common/common';
import { CUSTOM_EVENTS, EVENT_BUS } from '../../common/event-bus';
import { BaseGameObjectComponent } from './base-game-object-component';
import { ManaComponent } from './mana-component';
import { ActiveSpell } from '../../game-objects/spells/base-spell';
import { ElementManager } from '../../common/element-manager';
import { SPELL_ID } from '../../common/common';
import { SPELL_SLOT_REGISTRY, SPELL_CONFIG, SPELL_FACTORY_REGISTRY } from '../../game-objects/spells/spell-registry';
import { maybeSpawnGhost } from '../../game-objects/spells/spell-ghost';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { NetworkManager } from '../../networking/network-manager';

export class SpellCastingComponent extends BaseGameObjectComponent {
  #manaComponent: ManaComponent;
  #activeSpells: ActiveSpell[];
  // [slot0LastCast, slot1LastCast, slot2LastCast] timestamps in scene.time.now ms
  #lastCastTime: [number, number, number] = [0, 0, 0];
  #scene: Phaser.Scene;
  #spellGroup: Phaser.GameObjects.Group;

  constructor(gameObject: GameObject, manaComponent: ManaComponent) {
    super(gameObject);
    this.#manaComponent = manaComponent;
    this.#activeSpells = [];
    this.#scene = gameObject.scene;
    this.#spellGroup = this.#scene.add.group();
  }

  get spellGroup(): Phaser.GameObjects.Group {
    return this.#spellGroup;
  }

  get activeSpells(): ActiveSpell[] {
    return this.#activeSpells;
  }

  public canCast(slotIndex: number): boolean {
    if (slotIndex !== 0 && slotIndex !== 1 && slotIndex !== 2) return false;
    const element = ElementManager.instance.activeElement;
    const spellId = SPELL_SLOT_REGISTRY[element]?.[slotIndex];
    if (!spellId) return false;
    // Phase 9.3 — DASH_INTERRUPTABLE_BY_CAST guard (D-13). When false, an active
    // dash refuses new casts (1/2/3). Player.isDashing is the duck-typed flag.
    // EXCEPTION: AirBurst is itself a (super) dash — let it override the
    // in-flight regular dash so the user can chain Shift → AirBurst smoothly.
    if (
      !RUNTIME_CONFIG.DASH_INTERRUPTABLE_BY_CAST &&
      (this.gameObject as unknown as { isDashing?: boolean }).isDashing === true &&
      spellId !== SPELL_ID.AIR_BURST
    ) {
      return false;
    }
    const { manaCost, cooldown } = SPELL_CONFIG[spellId];
    const now = this.#scene.time.now;
    if (now - this.#lastCastTime[slotIndex] < cooldown) return false;
    if (this.#manaComponent.mana < manaCost) return false;
    return true;
  }

  public castSpell(
    slotIndex: number,
    casterX: number,
    casterY: number,
    targetX: number,
    targetY: number,
  ): ActiveSpell | undefined {
    if (!this.canCast(slotIndex)) return undefined;

    const element = ElementManager.instance.activeElement;
    const spellId = SPELL_SLOT_REGISTRY[element]![slotIndex]!;
    const { manaCost } = SPELL_CONFIG[spellId];

    this.#manaComponent.consume(manaCost);
    this.#lastCastTime[slotIndex] = this.#scene.time.now;

    // Cardinal-axis snap: when the cursor is within a few pixels of the caster's centre
    // line, force the matching axis to 0 so straight-up / straight-down / horizontal casts
    // travel exactly along that axis instead of drifting slightly off-cardinal because of
    // sub-pixel cursor positioning.
    const snap = RUNTIME_CONFIG.AIM_SNAP_THRESHOLD_PX;
    if (Math.abs(targetX - casterX) <= snap) targetX = casterX;
    if (Math.abs(targetY - casterY) <= snap) targetY = casterY;

    // Clamp the requested target to the caster's attack range. Targets farther than
    // PLAYER_ATTACK_RANGE_PX are projected back along the aim vector so projectiles
    // still fly in the requested direction but AOE spells (FireArea, ThunderStrike,
    // EarthBump, …) cannot be placed arbitrarily far from the caster.
    const range = RUNTIME_CONFIG.PLAYER_ATTACK_RANGE_PX;
    const rawDx = targetX - casterX;
    const rawDy = targetY - casterY;
    const distSq = rawDx * rawDx + rawDy * rawDy;
    if (distSq > range * range) {
      const dist = Math.sqrt(distSq);
      const scale = range / dist;
      targetX = casterX + rawDx * scale;
      targetY = casterY + rawDy * scale;
    }

    // Derive 4-way direction from caster → target for spells that need it
    const dx = targetX - casterX;
    const dy = targetY - casterY;
    const direction =
      Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0
          ? DIRECTION.RIGHT
          : DIRECTION.LEFT
        : dy >= 0
          ? DIRECTION.DOWN
          : DIRECTION.UP;

    const factory = SPELL_FACTORY_REGISTRY[spellId];
    if (!factory) {
      console.warn(`[SpellCastingComponent] No factory registered for spellId: ${spellId}`);
      return undefined;
    }

    // Pre-allocate the UUID and emit SPELL_CAST immediately so the player cast animation,
    // sound, and network broadcast all fire at PRESS time — the only thing that lags is
    // the actual spell game-object spawn (delayed by SPELL_GHOST_LEAD_MS when a ghost is
    // available, so the telegraph lands ahead of the real spell).
    const spellInstanceId = Phaser.Math.RND.uuid();
    EVENT_BUS.emit(CUSTOM_EVENTS.SPELL_CAST, { spellInstanceId, spellId, slotIndex, casterX, casterY, targetX, targetY });

    // Spawn ghost telegraph (if registered). Returns true when a ghost was spawned, in
    // which case the real spell is delayed by SPELL_GHOST_LEAD_MS so the ghost arrives
    // first (projectiles travel at matching speed → flight times equal → ghost lands
    // exactly LEAD_MS before the real spell).
    const ghosted = maybeSpawnGhost(this.#scene, spellId, casterX, casterY, targetX, targetY, direction);
    const delay = ghosted ? RUNTIME_CONFIG.SPELL_GHOST_LEAD_MS : 0;

    const spawn = (): ActiveSpell | undefined => {
      // Scene may have shut down during the delay (room transition, etc.).
      if (!this.#scene?.scene?.isActive?.()) return undefined;
      const spell = factory(this.#scene, casterX, casterY, targetX, targetY, direction, this.gameObject as Phaser.GameObjects.GameObject);

      this.#activeSpells.push(spell);
      this.#spellGroup.add(spell.gameObject);

      // Phase 9.3 (Plan 03): tag the spell gameObject with a unique per-cast UUID and the casterId
      // so cross-player overlap callbacks can identify the spell over the wire (D-01..D-04).
      spell.gameObject.setData('spellId', spellInstanceId);
      spell.gameObject.setData('spellType', spellId);
      try {
        const localId = NetworkManager.getInstance().localPlayerId;
        if (localId) spell.gameObject.setData('casterId', localId);
      } catch {
        /* offline / single-player — no casterId needed */
      }

      spell.gameObject.once(Phaser.GameObjects.Events.DESTROY, () => {
        this.#activeSpells = this.#activeSpells.filter((s) => s !== spell);
      });

      return spell;
    };

    if (delay > 0) {
      this.#scene.time.delayedCall(delay, spawn);
      // Caller can't get back a synchronous spell ref when telegraphed — return undefined.
      // No existing caller relies on the return value past fire-and-forget animation hooks.
      return undefined;
    }
    return spawn();
  }

  /**
   * Set the slot's lastCastTime to "now" — used by channeled spells (LightningBeam,
   * FireBreath-style) to start their cooldown when the channel ENDS rather than when
   * it begins. Without this, holding a beam for several seconds would consume the
   * entire cooldown window during the cast and allow instant re-cast on release.
   */
  public refreshCooldown(slotIndex: number): void {
    if (slotIndex !== 0 && slotIndex !== 1 && slotIndex !== 2) return;
    this.#lastCastTime[slotIndex] = this.#scene.time.now;
  }

  public getCooldownPercent(slotIndex: number): number {
    if (slotIndex !== 0 && slotIndex !== 1 && slotIndex !== 2) return 0;
    const element = ElementManager.instance.activeElement;
    const spellId = SPELL_SLOT_REGISTRY[element]?.[slotIndex];
    if (!spellId) return 1;
    const { cooldown } = SPELL_CONFIG[spellId];
    const elapsed = this.#scene.time.now - this.#lastCastTime[slotIndex];
    return elapsed >= cooldown ? 1 : elapsed / cooldown;
  }
}
