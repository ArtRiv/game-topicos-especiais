import { describe, it, expect } from 'vitest';
import { ElementManager } from './element-manager.js';
import { ELEMENT } from './common.js';

describe('ElementManager', () => {
  describe('reset()', () => {
    it('restores activeElement to FIRE', () => {
      ElementManager.instance.setElement(ELEMENT.EARTH);
      ElementManager.instance.reset();
      expect(ElementManager.instance.activeElement).toBe(ELEMENT.FIRE);
    });
  });
});
