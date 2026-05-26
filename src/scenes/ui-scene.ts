import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { ASSET_KEYS, HEART_ANIMATIONS, HEART_TEXTURE_FRAME } from '../common/assets';
import { DataManager } from '../common/data-manager';
import {
  CUSTOM_EVENTS,
  ElementCarouselStepData,
  ElementChangedData,
  EVENT_BUS,
  PLAYER_HEALTH_UPDATE_TYPE,
  PlayerHealthUpdated,
  SpecialSpellChargesChangedData,
  SpellCastEventPayload,
} from '../common/event-bus';
import { ELEMENT, SPELL_ID } from '../common/common';
import { DEFAULT_UI_TEXT_STYLE } from '../common/common';
import { SpecialSpellInventory } from '../common/special-spell-inventory';
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

// ───────────────────────────────────────────────────────────────────────────────
// Element carousel layout — tweak by hand to taste.
// Game canvas is 480×320. All values are in game-space pixels.
//
// The 5 element icons sit on the rim of a CIRCLE. The circle's CENTER is below the
// screen, so only the upper arc is visible:
//   - Top of the circle      → active element (framed by panel-border-022.png)
//   - Upper-right / upper-left → adjacent elements (slightly lower & smaller)
//   - The back two icons orbit below the screen
// Q rotates the wheel clockwise (previous element comes to top)
// E rotates the wheel counter-clockwise (next element comes to top)
// ───────────────────────────────────────────────────────────────────────────────
const CAROUSEL_CIRCLE_CX = 240;       // horizontal center of the wheel (canvas mid)
const CAROUSEL_CIRCLE_CY = 315;       // vertical center (below the 320px game height — wheel is mostly off-screen)
const CAROUSEL_CIRCLE_RADIUS = 32;    // distance from circle center to each icon — controls how "wide" the arc reads
// Panel border placement: sits at the top of the wheel (12 o'clock) around the active icon.
const CAROUSEL_PANEL_DISPLAY_SIZE = 32;
const CAROUSEL_PANEL_OFFSET_X = 0;          // nudge relative to the top-of-circle point
const CAROUSEL_PANEL_OFFSET_Y = 0;
// Icon size interpolated by angular distance from the top of the circle.
// Top icon uses _TOP; the icon diametrically opposite (bottom) would use _BOTTOM.
const CAROUSEL_ICON_DISPLAY_SIZE_TOP = 24;
const CAROUSEL_ICON_DISPLAY_SIZE_BOTTOM = 12;
const CAROUSEL_ALPHA_TOP = 1.0;
const CAROUSEL_ALPHA_BOTTOM = 0.25;
const CAROUSEL_ANIM_DURATION_MS = 220;        // tween duration when rotating

// Elements shown in the carousel, in display order. The list is treated as circular.
const CAROUSEL_ELEMENTS = [
  ELEMENT.FIRE,
  ELEMENT.WATER,
  ELEMENT.EARTH,
  ELEMENT.WIND,
  ELEMENT.THUNDER,
] as const;

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
  // Pixel-perfect hint that pops in when Wind is the active element to remind
  // the player that SHIFT now triggers the wind super-dash instead of the
  // regular dash. Uses BitmapText (press_start_2p atlas) instead of WebFont
  // Text because BitmapText draws each glyph as a pre-rasterized sprite — no
  // browser anti-aliasing, crisp pixel rendering that matches the game art.
  #windDashHint!: Phaser.GameObjects.BitmapText;
  #cooldownEntries: CooldownEntry[] = [];

  // Element carousel state — one icon per element, positioned around a circle whose
  // center sits below the screen. `#carouselRotation` is added to every icon's base
  // angle each frame; tweening it gives the wheel its smooth rotation.
  #carouselIndex: number = 0; // index of the element currently at the top
  #carouselPanel!: Phaser.GameObjects.Image;
  #carouselIcons: Phaser.GameObjects.Image[] = []; // length === CAROUSEL_ELEMENTS.length
  #carouselRotation: number = 0;  // tweened angular offset, radians. 0 == at rest.
  #carouselAnimating: boolean = false;
  #carouselTween: Phaser.Tweens.Tween | null = null;

  // Special-spell charges HUD (e.g. VoidOrb). Icon + count, bottom-right corner.
  #specialIcon!: Phaser.GameObjects.Image;
  #specialChargesText!: Phaser.GameObjects.Text;

  constructor() {
    super({
      key: SCENE_KEYS.UI_SCENE,
    });
  }

  public create(): void {
    // Reset class fields — Phaser reuses scene instances across stop/start, so any
    // arrays we mutate would otherwise carry over references to destroyed GameObjects.
    this.#cooldownEntries = [];

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

    // Element indicator — small text label kept above the carousel as a redundancy.
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
      .text(elemX, elemY + 12, '[SPACE]', {
        fontFamily: ASSET_KEYS.FONT_PRESS_START_2P,
        fontSize: '4px',
        color: '#888888',
      })
      .setOrigin(0);

    this.#createElementCarousel();
    this.#createSpecialChargesHud();

    // Wind-dash hint — centred along the bottom of the canvas (480 wide,
    // 320 tall). Shown only when the active element is WIND. Tinted with
    // the wind-element colour so it reads as element-bound. BitmapText
    // (press_start_2p atlas, key matches preload-scene.ts:19) renders
    // crisp glyph sprites with no browser anti-aliasing.
    this.#windDashHint = this.add
      .bitmapText(240, 308, 'press_start_2p', 'SHIFT  WIND DASH', 6)
      .setOrigin(0.5)
      .setTint(0x44ff99);
    this.#windDashHint.setVisible(
      ElementManager.instance.activeElement === ELEMENT.WIND,
    );
    this.#hudContainer.add(this.#windDashHint);

    // register event listeners
    EVENT_BUS.on(CUSTOM_EVENTS.PLAYER_HEALTH_UPDATED, this.updateHealthInHud, this);
    EVENT_BUS.on(CUSTOM_EVENTS.SHOW_DIALOG, this.showDialog, this);
    EVENT_BUS.on(CUSTOM_EVENTS.MANA_UPDATED, this.updateManaInHud, this);
    EVENT_BUS.on(CUSTOM_EVENTS.ELEMENT_CHANGED, this.#updateElementIndicator, this);
    EVENT_BUS.on(CUSTOM_EVENTS.ELEMENT_CHANGED, this.#syncCarouselToElement, this);
    EVENT_BUS.on(CUSTOM_EVENTS.ELEMENT_CAROUSEL_STEP, this.#onCarouselStep, this);
    EVENT_BUS.on(CUSTOM_EVENTS.SPELL_CAST, this.#onSpellCast, this);
    EVENT_BUS.on(CUSTOM_EVENTS.SPECIAL_SPELL_CHARGES_CHANGED, this.#onSpecialChargesChanged, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EVENT_BUS.off(CUSTOM_EVENTS.PLAYER_HEALTH_UPDATED, this.updateHealthInHud, this);
      EVENT_BUS.off(CUSTOM_EVENTS.SHOW_DIALOG, this.showDialog, this);
      EVENT_BUS.off(CUSTOM_EVENTS.MANA_UPDATED, this.updateManaInHud, this);
      EVENT_BUS.off(CUSTOM_EVENTS.ELEMENT_CHANGED, this.#updateElementIndicator, this);
      EVENT_BUS.off(CUSTOM_EVENTS.ELEMENT_CHANGED, this.#syncCarouselToElement, this);
      EVENT_BUS.off(CUSTOM_EVENTS.ELEMENT_CAROUSEL_STEP, this.#onCarouselStep, this);
      EVENT_BUS.off(CUSTOM_EVENTS.SPELL_CAST, this.#onSpellCast, this);
      EVENT_BUS.off(CUSTOM_EVENTS.SPECIAL_SPELL_CHARGES_CHANGED, this.#onSpecialChargesChanged, this);
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
    // Wind-dash hint visibility tracks the active element.
    this.#windDashHint?.setVisible(data.element === ELEMENT.WIND);
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
      VOID_ORB: ASSET_KEYS.SPELL_ICO_DARK,
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
      VOID_ORB: 0x884bb6,
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

  // ─── Element carousel ────────────────────────────────────────────────────────

  #elementToIconKey(element: typeof CAROUSEL_ELEMENTS[number]): string {
    switch (element) {
      case ELEMENT.FIRE:    return ASSET_KEYS.ELEMENT_ICON_FIRE;
      case ELEMENT.WATER:   return ASSET_KEYS.ELEMENT_ICON_WATER;
      case ELEMENT.EARTH:   return ASSET_KEYS.ELEMENT_ICON_EARTH;
      case ELEMENT.WIND:    return ASSET_KEYS.ELEMENT_ICON_WIND;
      case ELEMENT.THUNDER: return ASSET_KEYS.ELEMENT_ICON_LIGHTNING;
      default:              return ASSET_KEYS.ELEMENT_ICON_FIRE;
    }
  }

  #createElementCarousel(): void {
    // UiScene is restarted on map transitions, and Phaser reuses the scene instance —
    // class fields persist across runs. Reset state so we don't keep references to
    // destroyed GameObjects from the previous run.
    this.#carouselIcons = [];
    this.#carouselAnimating = false;
    this.#carouselRotation = 0;
    this.#carouselTween = null;

    // Sync starting index to whatever element is currently active.
    const active = ElementManager.instance.activeElement;
    const startIdx = CAROUSEL_ELEMENTS.findIndex((e) => e === active);
    this.#carouselIndex = startIdx >= 0 ? startIdx : 0;

    // Panel border sits at the top of the wheel (12 o'clock) framing the active icon.
    const panelX = CAROUSEL_CIRCLE_CX + CAROUSEL_PANEL_OFFSET_X;
    const panelY = CAROUSEL_CIRCLE_CY - CAROUSEL_CIRCLE_RADIUS + CAROUSEL_PANEL_OFFSET_Y;
    this.#carouselPanel = this.add
      .image(panelX, panelY, ASSET_KEYS.CAROUSEL_PANEL)
      .setOrigin(0.5)
      .setDisplaySize(CAROUSEL_PANEL_DISPLAY_SIZE, CAROUSEL_PANEL_DISPLAY_SIZE);

    // One icon per element. Each icon owns a fixed texture; rotation is achieved by
    // recomputing every icon's (x, y, scale, alpha) from a shared rotation angle.
    for (const element of CAROUSEL_ELEMENTS) {
      const icon = this.add
        .image(0, 0, this.#elementToIconKey(element))
        .setOrigin(0.5);
      this.#carouselIcons.push(icon);
    }

    this.#repositionCarousel();
  }

  /**
   * Recompute (x, y, displaySize, alpha) for every icon from `#carouselIndex` +
   * `#carouselRotation`. Called every frame from `update()` while the wheel is animating
   * so the tween reads as a smooth orbit. Cheap — 5 trig pairs per frame.
   *
   * Geometry:
   *   - Top of the circle is at angle -Ï€/2 (Phaser y grows downward).
   *   - The icon at carouselIndex sits at -Ï€/2 when rotation == 0.
   *   - Other icons fan out evenly around the rim. Back two end up below the screen.
   */
  #repositionCarousel(): void {
    const n = CAROUSEL_ELEMENTS.length;
    const sliceAngle = (Math.PI * 2) / n;
    const TOP_ANGLE = -Math.PI / 2;

    for (let i = 0; i < n; i++) {
      // Signed shortest-path slot offset in [-2, -1, 0, 1, 2] for N=5.
      // E.g. with currentIndex=0 and N=5: i=0→0, i=1→1, i=2→2, i=3→-2, i=4→-1.
      const rawOffset = i - this.#carouselIndex;
      const slotOffset = ((rawOffset + Math.floor(n / 2) + n) % n) - Math.floor(n / 2);

      const angle = TOP_ANGLE + slotOffset * sliceAngle + this.#carouselRotation;

      const icon = this.#carouselIcons[i];
      icon.x = CAROUSEL_CIRCLE_CX + Math.cos(angle) * CAROUSEL_CIRCLE_RADIUS;
      icon.y = CAROUSEL_CIRCLE_CY + Math.sin(angle) * CAROUSEL_CIRCLE_RADIUS;

      // Distance from "top of wheel" in [0, 1] — 0 at top, 1 at bottom (diametrically
      // opposite). Lerp size/alpha so icons grow + brighten as they approach the top.
      // Normalize angle to [-Ï€, Ï€] then take absolute value vs the top.
      let angleFromTop = angle - TOP_ANGLE;
      angleFromTop = Math.atan2(Math.sin(angleFromTop), Math.cos(angleFromTop));
      const t = 1 - Math.abs(angleFromTop) / Math.PI;
      const size = Phaser.Math.Linear(CAROUSEL_ICON_DISPLAY_SIZE_BOTTOM, CAROUSEL_ICON_DISPLAY_SIZE_TOP, t);
      const alpha = Phaser.Math.Linear(CAROUSEL_ALPHA_BOTTOM, CAROUSEL_ALPHA_TOP, t);
      icon.setDisplaySize(size, size);
      icon.setAlpha(alpha);

      // Render order: back icons behind front icons so the active one stays on top of
      // anything that orbits close to it.
      icon.setDepth(t);
    }
  }

  #onCarouselStep(data: ElementCarouselStepData): void {
    if (this.#carouselAnimating) return;
    const n = CAROUSEL_ELEMENTS.length;
    const newIndex = (this.#carouselIndex + data.direction + n) % n;
    this.#animateCarouselTo(newIndex, data.direction);
  }

  /** Sync the carousel when the element changes from a non-carousel source (radial menu).
   *  No animation — snap, so we don't fight an in-flight tween. */
  #syncCarouselToElement(data: ElementChangedData): void {
    const targetIdx = CAROUSEL_ELEMENTS.findIndex((e) => e === data.element);
    if (targetIdx < 0 || targetIdx === this.#carouselIndex) return;
    if (this.#carouselTween) {
      this.#carouselTween.stop();
      this.#carouselTween = null;
    }
    this.#carouselAnimating = false;
    this.#carouselRotation = 0;
    this.#carouselIndex = targetIdx;
    this.#repositionCarousel();
  }

  /**
   * Rotate the wheel by one slot. We tween `#carouselRotation` from 0 to ±sliceAngle;
   * on each frame `update()` reads it and reposition every icon. On complete, snap
   * rotation back to 0 and bump `#carouselIndex` — the new at-rest state is visually
   * identical to the end of the tween.
   *
   * direction = +1 (E, "next"): the icon previously on the upper-right rotates UP to
   *   the top. The wheel turns counter-clockwise → rotation tweens NEGATIVE.
   * direction = -1 (Q, "prev"): wheel turns clockwise → rotation tweens POSITIVE.
   */
  #animateCarouselTo(newIndex: number, direction: -1 | 1): void {
    this.#carouselAnimating = true;
    const sliceAngle = (Math.PI * 2) / CAROUSEL_ELEMENTS.length;
    const targetRotation = -direction * sliceAngle;
    // Tween a plain object — Phaser writes to `.rotation` each frame; we copy it onto
    // the class field in onUpdate so #repositionCarousel can read it.
    const rotState = { rotation: 0 };
    this.#carouselTween = this.tweens.add({
      targets: rotState,
      rotation: targetRotation,
      duration: CAROUSEL_ANIM_DURATION_MS,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        this.#carouselRotation = rotState.rotation;
        this.#repositionCarousel();
      },
      onComplete: () => {
        this.#carouselRotation = 0;
        this.#carouselIndex = newIndex;
        this.#repositionCarousel();
        this.#carouselAnimating = false;
        this.#carouselTween = null;
        // Commit the selection. ElementManager.setElement no-ops if unchanged and emits
        // ELEMENT_CHANGED otherwise — which #syncCarouselToElement handles with an early-out.
        ElementManager.instance.setElement(CAROUSEL_ELEMENTS[newIndex]);
      },
    });
  }

  // ─── Special-spell charges HUD (VoidOrb / DarkBolt — single slot) ────────

  /** Per-spell HUD icon texture. New specials added here will surface automatically
   *  when their pickup sets them active. */
  static readonly #SPECIAL_ICON_KEY: Record<string, string> = {
    [SPELL_ID.VOID_ORB]: ASSET_KEYS.VOID_ORB_BM_LOOP,
    [SPELL_ID.DARK_BOLT]: ASSET_KEYS.DARK_BOLT_BM_VFX3,
    [SPELL_ID.STAR_SHIELD]: ASSET_KEYS.STAR_SHIELD,
  };

  #createSpecialChargesHud(): void {
    // Bottom-right corner of the 480×320 canvas. Icon + small "xN" label.
    const HUD_X = 458;
    const HUD_Y = 304;
    // Start hidden — the first SPECIAL_SPELL_CHARGES_CHANGED event swaps in the
    // right icon and reveals it. We seed with VOID_ORB_BM_LOOP just to give the
    // sprite a valid initial texture.
    this.#specialIcon = this.add
      .image(HUD_X, HUD_Y, ASSET_KEYS.VOID_ORB_BM_LOOP, 0)
      .setOrigin(1, 1)
      .setScale(0.18)
      .setVisible(false);
    this.#specialChargesText = this.add
      .text(HUD_X - 22, HUD_Y - 4, '', {
        fontFamily: ASSET_KEYS.FONT_PRESS_START_2P,
        fontSize: '8px',
        color: '#ffaadd',
      })
      .setOrigin(1, 1)
      .setVisible(false);

    // Sync to whatever the inventory currently holds (handles UiScene restarts
    // where the SpecialSpellInventory singleton may already have a spell loaded
    // from a previous pickup).
    const inv = SpecialSpellInventory.instance;
    this.#renderSpecial(inv.activeSpellId, inv.charges);
  }

  #onSpecialChargesChanged(data: SpecialSpellChargesChangedData): void {
    this.#renderSpecial(data.spellId, data.charges);
  }

  #renderSpecial(spellId: string | null, charges: number): void {
    if (!this.#specialIcon || !this.#specialChargesText) return;
    const visible = spellId !== null && charges > 0;
    this.#specialIcon.setVisible(visible);
    this.#specialChargesText.setVisible(visible);
    if (visible && spellId) {
      const iconKey = UiScene.#SPECIAL_ICON_KEY[spellId] ?? ASSET_KEYS.VOID_ORB_BM_LOOP;
      this.#specialIcon.setTexture(iconKey, 0);
      this.#specialChargesText.setText(`x${charges}`);
    }
  }
}
