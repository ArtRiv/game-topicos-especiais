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
  SpellCastEventPayload,
} from '../common/event-bus';
import { DEFAULT_UI_TEXT_STYLE } from '../common/common';
import { ManaUpdatedData } from '../components/game-object/mana-component';
import { ElementManager } from '../common/element-manager';
import { Element, SpellId } from '../common/types';
import { SPELL_CONFIG } from '../game-objects/spells/spell-registry';

type CooldownEntry = {
  spellId: string;
  startTime: number;
  cooldownMs: number;
  container: Phaser.GameObjects.Container;
  barFill: Phaser.GameObjects.Rectangle;
  fading: boolean;
};

// x=8 aligns with mana bar; y=30 sits just below the "MP" label (mana bar at y=14, h=6, text at y=22)
const COOLDOWN_HUD_X = 8;
const COOLDOWN_HUD_Y = 30;
const COOLDOWN_ENTRY_H = 14; // icon 12px + 2px gap to next row
const ICON_SIZE = 12;
const BAR_W = 28;
const BAR_H = 3;

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
  #cooldownEntries: CooldownEntry[] = [];

  constructor() {
    super({
      key: SCENE_KEYS.UI_SCENE,
    });
  }

  public create(): void {
    this.#generateSpellIcons();
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
    EVENT_BUS.on(CUSTOM_EVENTS.SPELL_CAST, this.#onSpellCast, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EVENT_BUS.off(CUSTOM_EVENTS.PLAYER_HEALTH_UPDATED, this.updateHealthInHud, this);
      EVENT_BUS.off(CUSTOM_EVENTS.SHOW_DIALOG, this.showDialog, this);
      EVENT_BUS.off(CUSTOM_EVENTS.MANA_UPDATED, this.updateManaInHud, this);
      EVENT_BUS.off(CUSTOM_EVENTS.ELEMENT_CHANGED, this.#updateElementIndicator, this);
      EVENT_BUS.off(CUSTOM_EVENTS.SPELL_CAST, this.#onSpellCast, this);
    });
  }

  public update(): void {
    const now = this.time.now;
    for (const entry of this.#cooldownEntries) {
      if (entry.fading) continue;
      const progress = Math.min((now - entry.startTime) / entry.cooldownMs, 1);
      entry.barFill.scaleX = progress;
      if (progress >= 1) {
        entry.fading = true;
        this.tweens.add({
          targets: entry.container,
          alpha: 0,
          duration: 200,
          ease: 'Linear',
          onComplete: () => {
            entry.container.destroy();
            this.#cooldownEntries = this.#cooldownEntries.filter((e) => e !== entry);
            this.#repositionEntries();
          },
        });
      }
    }
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
      DARKNESS: 0x884bb6,
    };
    const hexColor = colorMap[data.element] ?? 0xffffff;
    const cssColor = `#${hexColor.toString(16).padStart(6, '0')}`;
    this.#elementGem.setFillStyle(hexColor);
    this.#elementLabel.setText(data.element);
    this.#elementLabel.setColor(cssColor);
  }

  #generateSpellIcons(): void {
    // Lightning — yellow zigzag bolt
    if (!this.textures.exists(ASSET_KEYS.SPELL_ICO_LIGHTNING)) {
      const g = this.add.graphics();
      g.fillStyle(0xffdd00, 1);
      g.fillPoints(
        [
          { x: 9, y: 0 },
          { x: 4, y: 6 },
          { x: 7, y: 6 },
          { x: 2, y: 12 },
          { x: 8, y: 7 },
          { x: 5, y: 7 },
        ],
        true,
      );
      g.generateTexture(ASSET_KEYS.SPELL_ICO_LIGHTNING, 12, 12);
      g.destroy();
    }
    // Ice — cyan diamond
    if (!this.textures.exists(ASSET_KEYS.SPELL_ICO_ICE)) {
      const g = this.add.graphics();
      g.fillStyle(0x22ccff, 1);
      g.fillPoints(
        [
          { x: 6, y: 0 },
          { x: 12, y: 5 },
          { x: 6, y: 12 },
          { x: 0, y: 5 },
        ],
        true,
      );
      g.generateTexture(ASSET_KEYS.SPELL_ICO_ICE, 12, 12);
      g.destroy();
    }
  }

  #getSpellIconKey(spellId: string): string {
    const map: Partial<Record<SpellId, string>> = {
      FIRE_BOLT: ASSET_KEYS.SPELL_ICO_FIRE,
      FIRE_AREA: ASSET_KEYS.SPELL_ICO_FIRE,
      EARTH_BOLT: ASSET_KEYS.SPELL_ICO_ROCK,
      EARTH_BUMP: ASSET_KEYS.SPELL_ICO_ROCK,
      WATER_BALL: ASSET_KEYS.SPELL_ICO_WATER,
      WATER_TORNADO: ASSET_KEYS.SPELL_ICO_WATER,
      WATER_SPIKE: ASSET_KEYS.SPELL_ICO_WATER,
      WIND_BOLT: ASSET_KEYS.SPELL_ICO_WIND,
      THUNDER_STRIKE: ASSET_KEYS.SPELL_ICO_LIGHTNING,
      ICE_SHARD: ASSET_KEYS.SPELL_ICO_ICE,
      DARK_BOLT: ASSET_KEYS.SPELL_ICO_DARK,
    };
    return map[spellId as SpellId] ?? ASSET_KEYS.SPELL_ICO_FIRE;
  }

  #getSpellBarColor(spellId: string): number {
    const map: Partial<Record<SpellId, number>> = {
      FIRE_BOLT: 0xff5500,
      FIRE_AREA: 0xff5500,
      EARTH_BOLT: 0x886633,
      EARTH_BUMP: 0x886633,
      WATER_BALL: 0x0088ff,
      WATER_TORNADO: 0x0088ff,
      WATER_SPIKE: 0x0088ff,
      WIND_BOLT: 0x44ff99,
      THUNDER_STRIKE: 0xffdd00,
      ICE_SHARD: 0x22ccff,
      DARK_BOLT: 0x884bb6,
    };
    return map[spellId as SpellId] ?? 0xffffff;
  }

  #onSpellCast(payload: SpellCastEventPayload): void {
    const { spellId } = payload;
    const config = SPELL_CONFIG[spellId as SpellId];
    if (!config || config.cooldown <= 0) return;

    // If the same spell is already tracked (same-slot re-cast guard), reset the timer
    const existing = this.#cooldownEntries.find((e) => e.spellId === spellId && !e.fading);
    if (existing) {
      existing.startTime = this.time.now;
      existing.barFill.scaleX = 0;
      return;
    }

    const iconKey = this.#getSpellIconKey(spellId);
    const barColor = this.#getSpellBarColor(spellId);

    // Icon centered at (ICON_SIZE/2, ICON_SIZE/2) within the container
    const icon = this.add.image(ICON_SIZE / 2, ICON_SIZE / 2, iconKey)
      .setDisplaySize(ICON_SIZE, ICON_SIZE)
      .setOrigin(0.5);

    // Bar positioned right of icon with 2px gap, vertically centered on the icon
    const barX = ICON_SIZE + 2;
    const barY = ICON_SIZE / 2;
    const barBg = this.add.rectangle(barX, barY, BAR_W, BAR_H, 0x222222).setOrigin(0, 0.5);
    const barFill = this.add.rectangle(barX, barY, BAR_W, BAR_H, barColor).setOrigin(0, 0.5);
    barFill.scaleX = 0;

    const entryY = COOLDOWN_HUD_Y + this.#cooldownEntries.length * COOLDOWN_ENTRY_H;
    const container = this.add.container(COOLDOWN_HUD_X, entryY, [barBg, barFill, icon]);
    container.setAlpha(0);
    this.tweens.add({ targets: container, alpha: 1, duration: 150, ease: 'Linear' });

    this.#cooldownEntries.push({ spellId, startTime: this.time.now, cooldownMs: config.cooldown, container, barFill, fading: false });
  }

  #repositionEntries(): void {
    this.#cooldownEntries.forEach((entry, i) => {
      this.tweens.add({
        targets: entry.container,
        y: COOLDOWN_HUD_Y + i * COOLDOWN_ENTRY_H,
        duration: 150,
        ease: 'Linear',
      });
    });
  }
}
