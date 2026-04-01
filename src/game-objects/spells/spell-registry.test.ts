import { describe, it, expect } from 'vitest';
import { ELEMENT, SPELL_ID } from '../../common/common';
import { SPELL_SLOT_REGISTRY, SPELL_CONFIG, SPELL_FACTORY_REGISTRY } from './spell-registry';

describe('SPELL_SLOT_REGISTRY', () => {
  it('every element has a non-null primary spell (slot 0)', () => {
    for (const element of Object.values(ELEMENT)) {
      expect(SPELL_SLOT_REGISTRY[element][0]).not.toBeNull();
    }
  });

  it('every non-null slot entry has a matching SPELL_CONFIG entry', () => {
    for (const slots of Object.values(SPELL_SLOT_REGISTRY)) {
      for (const spellId of slots) {
        if (spellId !== null) {
          expect(SPELL_CONFIG[spellId]).toBeDefined();
        }
      }
    }
  });
});

describe('SPELL_CONFIG', () => {
  it('has an entry for all 10 SpellIds', () => {
    const allIds = Object.values(SPELL_ID);
    for (const id of allIds) {
      expect(SPELL_CONFIG[id]).toBeDefined();
    }
  });

  it('every entry has numeric manaCost and cooldown', () => {
    for (const [id, cfg] of Object.entries(SPELL_CONFIG)) {
      expect(typeof cfg.manaCost).toBe('number');
      expect(typeof cfg.cooldown).toBe('number');
    }
  });
});
