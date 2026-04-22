import { describe, it, expect } from 'vitest';
import { InventoryManager } from './inventory-manager.js';
import { LEVEL_NAME, DUNGEON_ITEM } from '../../common/common.js';

describe('InventoryManager', () => {
  describe('reset()', () => {
    it('restores generalInventory to defaults', () => {
      const im = InventoryManager.instance;
      im.reset();
      expect(im.data.general.sword).toBe(true);
    });

    it('restores area inventory to clean defaults', () => {
      const im = InventoryManager.instance;
      im.addDungeonItem(LEVEL_NAME.DUNGEON_1, DUNGEON_ITEM.MAP);
      im.addDungeonItem(LEVEL_NAME.DUNGEON_1, DUNGEON_ITEM.SMALL_KEY);
      im.reset();
      const area = im.getAreaInventory(LEVEL_NAME.DUNGEON_1);
      expect(area.map).toBe(false);
      expect(area.bossKey).toBe(false);
      expect(area.compass).toBe(false);
      expect(area.keys).toBe(0);
    });
  });
});
