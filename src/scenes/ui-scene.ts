import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { ASSET_KEYS, HEART_ANIMATIONS, HEART_TEXTURE_FRAME } from '../common/assets';
import { DataManager } from '../common/data-manager';
import {
  CUSTOM_EVENTS,
  ElementChangedData,
  EVENT_BUS,
  PLAYER_HEALTH_UPDATE_TYPE,
  PlayerHealthUpdated,
} from '../common/event-bus';
import { DEFAULT_UI_TEXT_STYLE } from '../common/common';
import { ManaUpdatedData } from '../components/game-object/mana-component';
import { ElementManager } from '../common/element-manager';
import { Element } from '../common/types';

export class UiScene extends Phaser.Scene {
  #hudContainer!: Phaser.GameObjects.Container;
  #hearts!: Phaser.GameObjects.Sprite[];
  #dialogContainer!: Phaser.GameObjects.Container;
  #dialogContainerText!: Phaser.GameObjects.Text;
  #manaBarBg!: Phaser.GameObjects.Rectangle;
  #manaBarFill!: Phaser.GameObjects.Rectangle;
  #manaText!: Phaser.GameObjects.Text;
  #elementGem!: Phaser.GameObjects.Arc;
  #elementLabel!: Phaser.GameObjects.Text;
  #elementHintText!: Phaser.GameObjects.Text;

  constructor() {
    super({
      key: SCENE_KEYS.UI_SCENE,
    });
  }

  public create(): void {
    // create main hud
    this.#hudContainer = this.add.container(0, 0, []);
    this.#hearts = [];

    const numberOfHearts = Math.floor(DataManager.instance.data.maxHealth / 2);
    const numberOfFullHearts = Math.floor(DataManager.instance.data.currentHealth / 2);
    const hasHalfHeart = DataManager.instance.data.currentHealth % 2 === 1;
    for (let i = 0; i < 20; i += 1) {
      let x = 157 + 8 * i;
      let y = 25;
      if (i >= 10) {
        x = 157 + 8 * (i - 10);
        y = 33;
      }
      let frame: string = HEART_TEXTURE_FRAME.NONE;
      if (i < numberOfFullHearts) {
        frame = HEART_TEXTURE_FRAME.FULL;
      } else if (i < numberOfHearts) {
        frame = HEART_TEXTURE_FRAME.EMPTY;
      }
      if (hasHalfHeart && i === numberOfFullHearts) {
        frame = HEART_TEXTURE_FRAME.HALF;
      }
      this.#hearts.push(this.add.sprite(x, y, ASSET_KEYS.HUD_NUMBERS, frame).setOrigin(0));
    }
    this.#hudContainer.add(this.#hearts);

    this.#dialogContainer = this.add.container(32, 142, [this.add.image(0, 0, ASSET_KEYS.UI_DIALOG, 0).setOrigin(0)]);
    this.#dialogContainerText = this.add.text(14, 14, '', DEFAULT_UI_TEXT_STYLE).setOrigin(0);
    this.#dialogContainer.add(this.#dialogContainerText);
    this.#dialogContainer.visible = false;

    // create mana bar
    const manaBarX = 8;
    const manaBarY = 14;
    const manaBarWidth = 60;
    const manaBarHeight = 6;
    this.#manaBarBg = this.add.rectangle(manaBarX, manaBarY, manaBarWidth, manaBarHeight, 0x222244).setOrigin(0);
    this.#manaBarFill = this.add.rectangle(manaBarX, manaBarY, manaBarWidth, manaBarHeight, 0x4444ff).setOrigin(0);
    this.#manaText = this.add
      .text(manaBarX, manaBarY + manaBarHeight + 2, 'MP', {
        fontFamily: ASSET_KEYS.FONT_PRESS_START_2P,
        fontSize: 6,
        color: '#8888ff',
      })
      .setOrigin(0);
    this.#hudContainer.add([this.#manaBarBg, this.#manaBarFill, this.#manaText]);

    // Element indicator (bottom-left corner)
    const elemX = 8;
    const elemY = 290;
    this.#elementGem = this.add.arc(elemX + 5, elemY + 5, 5, 0, 360, false, 0xff5500).setOrigin(0.5);
    this.#elementLabel = this.add
      .text(elemX + 13, elemY + 1, 'FIRE', {
        fontFamily: ASSET_KEYS.FONT_PRESS_START_2P,
        fontSize: '5px',
        color: '#ff5500',
      })
      .setOrigin(0);
    this.#elementHintText = this.add
      .text(elemX, elemY + 12, '[CTRL]', {
        fontFamily: ASSET_KEYS.FONT_PRESS_START_2P,
        fontSize: '4px',
        color: '#888888',
      })
      .setOrigin(0);

    // register event listeners
    EVENT_BUS.on(CUSTOM_EVENTS.PLAYER_HEALTH_UPDATED, this.updateHealthInHud, this);
    EVENT_BUS.on(CUSTOM_EVENTS.SHOW_DIALOG, this.showDialog, this);
    EVENT_BUS.on(CUSTOM_EVENTS.MANA_UPDATED, this.updateManaInHud, this);
    EVENT_BUS.on(CUSTOM_EVENTS.ELEMENT_CHANGED, this.#updateElementIndicator, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EVENT_BUS.off(CUSTOM_EVENTS.PLAYER_HEALTH_UPDATED, this.updateHealthInHud, this);
      EVENT_BUS.off(CUSTOM_EVENTS.SHOW_DIALOG, this.showDialog, this);
      EVENT_BUS.off(CUSTOM_EVENTS.MANA_UPDATED, this.updateManaInHud, this);
      EVENT_BUS.off(CUSTOM_EVENTS.ELEMENT_CHANGED, this.#updateElementIndicator, this);
    });
  }

  public async updateHealthInHud(data: PlayerHealthUpdated): Promise<void> {
    if (data.type === PLAYER_HEALTH_UPDATE_TYPE.INCREASE) {
      // if player has increased their health, picking up hearts, new heart container, fairy, etc.,
      // need to update their health here
      return;
    }

    // play animation for losing hearts depending on the amount of health lost
    const healthDifference = data.previousHealth - data.currentHealth;
    let health = data.previousHealth;
    for (let i = 0; i < healthDifference; i += 1) {
      const heartIndex = Math.round(health / 2) - 1;
      const isHalfHeart = health % 2 === 1;
      let animationName = HEART_ANIMATIONS.LOSE_LAST_HALF;
      if (!isHalfHeart) {
        animationName = HEART_ANIMATIONS.LOSE_FIRST_HALF;
      }
      await new Promise((resolve) => {
        this.#hearts[heartIndex].play(animationName);
        this.#hearts[heartIndex].once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + animationName, () => {
          resolve(undefined);
        });
      });
      health -= 1;
    }
  }

  public showDialog(message: string): void {
    this.#dialogContainer.visible = true;
    this.#dialogContainerText.setText(message);

    this.time.delayedCall(3000, () => {
      this.#dialogContainer.visible = false;
      EVENT_BUS.emit(CUSTOM_EVENTS.DIALOG_CLOSED);
    });
  }

  public updateManaInHud(data: ManaUpdatedData): void {
    const percent = data.currentMana / data.maxMana;
    this.#manaBarFill.setScale(percent, 1);
  }

  #updateElementIndicator(data: ElementChangedData): void {
    const colorMap: Record<Element, number> = {
      FIRE: 0xff5500,
      THUNDER: 0xffdd00,
      EARTH: 0x886633,
      ICE: 0x22ccff,
      WIND: 0x44ff99,
      WATER: 0x0088ff,
    };
    const hexColor = colorMap[data.element] ?? 0xffffff;
    const cssColor = `#${hexColor.toString(16).padStart(6, '0')}`;
    this.#elementGem.setFillStyle(hexColor);
    this.#elementLabel.setText(data.element);
    this.#elementLabel.setColor(cssColor);
  }
}
