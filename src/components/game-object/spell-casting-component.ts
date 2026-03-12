import * as Phaser from 'phaser';
import { GameObject, SpellId } from '../../common/types';
import { ELEMENT, SPELL_ID } from '../../common/common';
import { CUSTOM_EVENTS, EVENT_BUS } from '../../common/event-bus';
import { BaseGameObjectComponent } from './base-game-object-component';
import { ManaComponent } from './mana-component';
import { ActiveSpell } from '../../game-objects/spells/base-spell';
import { FireBolt } from '../../game-objects/spells/fire-bolt';
import { FireArea } from '../../game-objects/spells/fire-area';
import { EarthBolt } from '../../game-objects/spells/earth-bolt';
import { ElementManager } from '../../common/element-manager';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import {
  FIRE_BOLT_COOLDOWN,
  FIRE_BOLT_MANA_COST,
  FIRE_AREA_COOLDOWN,
  FIRE_AREA_MANA_COST,
} from '../../common/config';

export type SpellSlot = {
  spellId: SpellId;
  manaCost: number;
  cooldown: number;
  lastCastTime: number;
};

export class SpellCastingComponent extends BaseGameObjectComponent {
  #manaComponent: ManaComponent;
  #activeSpells: ActiveSpell[];
  #spellSlots: SpellSlot[];
  #scene: Phaser.Scene;
  #spellGroup: Phaser.GameObjects.Group;

  constructor(gameObject: GameObject, manaComponent: ManaComponent) {
    super(gameObject);
    this.#manaComponent = manaComponent;
    this.#activeSpells = [];
    this.#scene = gameObject.scene;
    this.#spellGroup = this.#scene.add.group();

    // spell slot 1 = Fire Bolt, spell slot 2 = Fire Area
    this.#spellSlots = [
      {
        spellId: SPELL_ID.FIRE_BOLT,
        manaCost: FIRE_BOLT_MANA_COST,
        cooldown: FIRE_BOLT_COOLDOWN,
        lastCastTime: 0,
      },
      {
        spellId: SPELL_ID.FIRE_AREA,
        manaCost: FIRE_AREA_MANA_COST,
        cooldown: FIRE_AREA_COOLDOWN,
        lastCastTime: 0,
      },
    ];
  }

  get spellGroup(): Phaser.GameObjects.Group {
    return this.#spellGroup;
  }

  get activeSpells(): ActiveSpell[] {
    return this.#activeSpells;
  }

  public canCast(slotIndex: number): boolean {
    if (slotIndex < 0 || slotIndex >= this.#spellSlots.length) {
      return false;
    }
    const slot = this.#spellSlots[slotIndex];
    const now = this.#scene.time.now;
    const cooldown = this.#getEffectiveCooldown(slot.spellId);
    if (now - slot.lastCastTime < cooldown) {
      return false;
    }
    if (this.#manaComponent.mana < slot.manaCost) {
      return false;
    }
    return true;
  }

  #getEffectiveCooldown(spellId: SpellId): number {
    if (spellId === SPELL_ID.FIRE_BOLT) {
      return ElementManager.instance.activeElement === ELEMENT.EARTH
        ? RUNTIME_CONFIG.EARTH_BOLT_COOLDOWN
        : RUNTIME_CONFIG.FIRE_BOLT_COOLDOWN;
    }
    return this.#spellSlots.find((s) => s.spellId === spellId)?.cooldown ?? 0;
  }

  public castSpell(slotIndex: number, casterX: number, casterY: number, targetX: number, targetY: number): ActiveSpell | undefined {
    if (!this.canCast(slotIndex)) {
      return undefined;
    }

    const slot = this.#spellSlots[slotIndex];
    this.#manaComponent.consume(slot.manaCost);
    slot.lastCastTime = this.#scene.time.now;

    let spell: ActiveSpell | undefined;

    switch (slot.spellId) {
      case SPELL_ID.FIRE_BOLT: {
        const activeElement = ElementManager.instance.activeElement;
        if (activeElement === ELEMENT.EARTH) {
          spell = new EarthBolt(this.#scene, casterX, casterY, targetX, targetY);
        } else {
          spell = new FireBolt(this.#scene, casterX, casterY, targetX, targetY);
        }
        break;
      }
      case SPELL_ID.FIRE_AREA:
        spell = new FireArea(this.#scene, targetX, targetY);
        break;
      default:
        return undefined;
    }

    this.#activeSpells.push(spell);
    this.#spellGroup.add(spell.gameObject);

    // clean up when spell is destroyed
    spell.gameObject.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.#activeSpells = this.#activeSpells.filter((s) => s !== spell);
    });

    EVENT_BUS.emit(CUSTOM_EVENTS.SPELL_CAST, { spellId: slot.spellId, slotIndex });

    return spell;
  }

  public getCooldownPercent(slotIndex: number): number {
    if (slotIndex < 0 || slotIndex >= this.#spellSlots.length) {
      return 0;
    }
    const slot = this.#spellSlots[slotIndex];
    const elapsed = this.#scene.time.now - slot.lastCastTime;
    if (elapsed >= slot.cooldown) {
      return 1;
    }
    return elapsed / slot.cooldown;
  }
}
