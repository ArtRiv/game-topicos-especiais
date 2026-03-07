import * as Phaser from 'phaser';
import { Element, SpellId, SpellType } from '../../common/types';

export interface SpellConfig {
  element: Element;
  spellId: SpellId;
  spellType: SpellType;
  baseDamage: number;
  manaCost: number;
  cooldown: number;
}

export interface ActiveSpell {
  readonly element: Element;
  readonly spellId: SpellId;
  readonly spellType: SpellType;
  readonly baseDamage: number;
  readonly manaCost: number;
  readonly cooldown: number;
  readonly gameObject: Phaser.GameObjects.GameObject;
  destroy(): void;
}
