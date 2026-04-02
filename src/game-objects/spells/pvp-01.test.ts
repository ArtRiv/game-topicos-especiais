import { describe, it, expect } from 'vitest';
import { ELEMENT } from '../../common/common';
import { SPELL_SLOT_REGISTRY } from './spell-registry';

describe('PVP-01 — all elements have a primary spell (slot 0)', () => {
  it('every ELEMENT value maps to a non-null slot 0 in SPELL_SLOT_REGISTRY', () => {
    for (const element of Object.values(ELEMENT)) {
      const primarySpell = SPELL_SLOT_REGISTRY[element][0];
      expect(primarySpell).not.toBeNull();
      expect(primarySpell).not.toBeUndefined();
    }
  });

  it('SPELL_SLOT_REGISTRY covers exactly the same set of keys as ELEMENT', () => {
    const elementKeys = Object.keys(ELEMENT).sort();
    const registryKeys = Object.keys(SPELL_SLOT_REGISTRY).sort();
    expect(registryKeys).toEqual(elementKeys);
  });
});
