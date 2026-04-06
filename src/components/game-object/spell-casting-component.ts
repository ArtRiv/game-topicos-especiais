import * as Phaser from 'phaser';
import { GameObject } from '../../common/types';
import { DIRECTION } from '../../common/common';
import { CUSTOM_EVENTS, EVENT_BUS } from '../../common/event-bus';
import { BaseGameObjectComponent } from './base-game-object-component';
import { ManaComponent } from './mana-component';
import { ActiveSpell } from '../../game-objects/spells/base-spell';
import { ElementManager } from '../../common/element-manager';
import { SPELL_SLOT_REGISTRY, SPELL_CONFIG, SPELL_FACTORY_REGISTRY } from '../../game-objects/spells/spell-registry';

export class SpellCastingComponent extends BaseGameObjectComponent {
  #manaComponent: ManaComponent;
  #activeSpells: ActiveSpell[];
  // [slot0LastCast, slot1LastCast] timestamps in scene.time.now ms
  #lastCastTime: [number, number] = [0, 0];
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
    if (slotIndex !== 0 && slotIndex !== 1) return false;
    const element = ElementManager.instance.activeElement;
    const spellId = SPELL_SLOT_REGISTRY[element]?.[slotIndex];
    if (!spellId) return false;
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

    const spell = factory(this.#scene, casterX, casterY, targetX, targetY, direction);

    this.#activeSpells.push(spell);
    this.#spellGroup.add(spell.gameObject);

    spell.gameObject.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.#activeSpells = this.#activeSpells.filter((s) => s !== spell);
    });

    EVENT_BUS.emit(CUSTOM_EVENTS.SPELL_CAST, { spellId, slotIndex, casterX, casterY, targetX, targetY });

    return spell;
  }

  public getCooldownPercent(slotIndex: number): number {
    if (slotIndex !== 0 && slotIndex !== 1) return 0;
    const element = ElementManager.instance.activeElement;
    const spellId = SPELL_SLOT_REGISTRY[element]?.[slotIndex];
    if (!spellId) return 1;
    const { cooldown } = SPELL_CONFIG[spellId];
    const elapsed = this.#scene.time.now - this.#lastCastTime[slotIndex];
    return elapsed >= cooldown ? 1 : elapsed / cooldown;
  }
}
