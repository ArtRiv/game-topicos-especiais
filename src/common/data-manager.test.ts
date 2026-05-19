import { describe, it, expect, beforeEach } from 'vitest';
import { DataManager } from './data-manager.js';
import { PLAYER_START_MAX_HEALTH, PLAYER_MAX_MANA } from './config.js';
import { LEVEL_NAME } from './common.js';

describe('DataManager', () => {
  describe('reset()', () => {
    it('restores health to starting values', () => {
      const dm = DataManager.instance;
      dm.updatePlayerCurrentHealth(1);
      dm.reset();
      expect(dm.data.currentHealth).toBe(PLAYER_START_MAX_HEALTH);
      expect(dm.data.maxHealth).toBe(PLAYER_START_MAX_HEALTH);
    });

    it('restores mana to starting values', () => {
      const dm = DataManager.instance;
      dm.data = { ...dm.data, currentMana: 0, maxMana: 0 };
      dm.reset();
      expect(dm.data.currentMana).toBe(PLAYER_MAX_MANA);
      expect(dm.data.maxMana).toBe(PLAYER_MAX_MANA);
    });

    it('restores currentArea to DUNGEON_1 room 3 door 3', () => {
      const dm = DataManager.instance;
      dm.updateAreaData(LEVEL_NAME.WORLD, 1, 1);
      dm.reset();
      expect(dm.data.currentArea.name).toBe(LEVEL_NAME.DUNGEON_1);
      expect(dm.data.currentArea.startRoomId).toBe(3);
      expect(dm.data.currentArea.startDoorId).toBe(3);
    });

    it('clears areaDetails to initial state', () => {
      const dm = DataManager.instance;
      dm.updateChestData(1, 1, true, true);
      dm.defeatedCurrentAreaBoss();
      dm.reset();
      expect(dm.data.areaDetails.DUNGEON_1.bossDefeated).toBe(false);
      expect(dm.data.areaDetails.DUNGEON_1[1]).toBeUndefined();
    });
  });
});
