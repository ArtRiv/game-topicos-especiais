import { LEVEL_NAME } from './common';
import { PLAYER_START_MAX_HEALTH } from './config';
import {
  CUSTOM_EVENTS,
  EVENT_BUS,
  PLAYER_HEALTH_UPDATE_TYPE,
  PlayerHealthUpdated,
  PlayerHealthUpdateType,
} from './event-bus';
import { LevelName } from './types';

export type PlayerData = {
  currentHealth: number;
  maxHealth: number;
  currentArea: {
    name: LevelName;
    startRoomId: number;
    startDoorId: number;
  };
  areaDetails: {
    [key in LevelName]: {
      [key: number]: {
        chests: {
          [key: string]: {
            revealed: boolean;
            opened: boolean;
          };
        };
        doors: {
          [key: string]: {
            unlocked: boolean;
          };
        };
      };
      bossDefeated?: boolean;
    };
  };
};

export class DataManager {
  static #instance: DataManager;

  #data: PlayerData;

  private constructor() {
    this.#data = {
      currentHealth: PLAYER_START_MAX_HEALTH,
      maxHealth: PLAYER_START_MAX_HEALTH,
      currentArea: {
        name: LEVEL_NAME.DUNGEON_1,
        startRoomId: 3,
        startDoorId: 3,
      },
      areaDetails: {
        DUNGEON_1: {
          bossDefeated: false,
        },
        WORLD: {},
        STAGES: {},
      },
    };
  }

  public static get instance(): DataManager {
    if (!DataManager.#instance) {
      DataManager.#instance = new DataManager();
    }
    return DataManager.#instance;
  }

  get data(): PlayerData {
    return { ...this.#data };
  }

  set data(data: PlayerData) {
    this.#data = { ...data };
  }

  public updateAreaData(area: LevelName, startRoomId: number, startDoorId: number): void {
    this.#data.currentArea = {
      name: area,
      startDoorId,
      startRoomId,
    };
  }

  public updateChestData(roomId: number, chestId: number, revealed: boolean, opened: boolean): void {
    this.#populateDefaultRoomData(roomId);
    this.#data.areaDetails[this.#data.currentArea.name][roomId].chests[chestId] = {
      revealed,
      opened,
    };
  }

  public updateDoorData(roomId: number, doorId: number, unlocked: boolean): void {
    this.#populateDefaultRoomData(roomId);
    this.#data.areaDetails[this.#data.currentArea.name][roomId].doors[doorId] = {
      unlocked,
    };
  }

  public resetPlayerHealthToMin(): void {
    this.#data.currentHealth = PLAYER_START_MAX_HEALTH;
  }

  public reset(): void {
    this.#data = {
      currentHealth: PLAYER_START_MAX_HEALTH,
      maxHealth: PLAYER_START_MAX_HEALTH,
      currentArea: {
        name: LEVEL_NAME.DUNGEON_1,
        startRoomId: 3,
        startDoorId: 3,
      },
      areaDetails: {
        DUNGEON_1: {
          bossDefeated: false,
        },
        WORLD: {},
        STAGES: {},
      },
    };
  }

  /** TDM death-card upgrades (Tough Skin / Titan Heart): set the player's max health and notify
   *  the HUD to rebuild the heart row. Also used at match start to reset back to the base value
   *  (the DataManager singleton survives between matches; everything else is rebuilt fresh). */
  public updatePlayerMaxHealth(maxHealth: number): void {
    if (maxHealth === this.#data.maxHealth) {
      return;
    }
    this.#data.maxHealth = maxHealth;
    this.#data.currentHealth = Math.min(this.#data.currentHealth, maxHealth);
    EVENT_BUS.emit(CUSTOM_EVENTS.PLAYER_MAX_HEALTH_UPDATED, maxHealth);
  }

  public updatePlayerCurrentHealth(health: number): void {
    if (health === this.#data.currentHealth) {
      return;
    }
    let healthUpdateType: PlayerHealthUpdateType = PLAYER_HEALTH_UPDATE_TYPE.DECREASE;
    if (health > this.#data.currentHealth) {
      healthUpdateType = PLAYER_HEALTH_UPDATE_TYPE.INCREASE;
    }
    const dataToPass: PlayerHealthUpdated = {
      previousHealth: this.#data.currentHealth,
      currentHealth: health,
      type: healthUpdateType,
    };
    EVENT_BUS.emit(CUSTOM_EVENTS.PLAYER_HEALTH_UPDATED, dataToPass);
    this.#data.currentHealth = health;
  }

  public defeatedCurrentAreaBoss(): void {
    this.#data.areaDetails[this.#data.currentArea.name].bossDefeated = true;
  }

  #populateDefaultRoomData(roomId: number): void {
    if (this.#data.areaDetails[this.#data.currentArea.name][roomId] === undefined) {
      this.#data.areaDetails[this.#data.currentArea.name][roomId] = {
        chests: {},
        doors: {},
      };
    }
  }
}
