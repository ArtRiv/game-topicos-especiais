import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { ELEMENT } from '../common/common';
import { ASSET_KEYS } from '../common/assets';
import { ElementManager } from '../common/element-manager';
import { Element } from '../common/types';

// Elements shown in the radial menu, ordered clockwise from top
const ELEMENTS: Element[] = [ELEMENT.FIRE, ELEMENT.THUNDER, ELEMENT.EARTH, ELEMENT.ICE, ELEMENT.WIND, ELEMENT.WATER];

const ELEMENT_COLORS: Record<Element, number> = {
  FIRE: 0xff5500,
  THUNDER: 0xffdd00,
  EARTH: 0x886633,
  ICE: 0x22ccff,
  WIND: 0x44ff99,
  WATER: 0x0088ff,
};

const ELEMENT_LABELS: Record<Element, string> = {
  FIRE: 'FIRE',
  THUNDER: 'THUNDER',
  EARTH: 'EARTH',
  ICE: 'ICE',
  WIND: 'WIND',
  WATER: 'WATER',
};

// Layout constants (all values in game-space pixels, game is 480×320)
const GAME_W = 480;
const GAME_H = 320;
const CX = GAME_W / 2; // 240
const CY = GAME_H / 2; // 160
const OUTER_RADIUS = 65;
const OUTER_RADIUS_HOVER = 75;
const INNER_RADIUS = 18;
const LABEL_RADIUS = 47; // distance from center to label midpoint
const LABEL_RADIUS_HOVER = 56;
const START_ANGLE = -Math.PI / 2; // top of circle
const SLICE_ANGLE = (Math.PI * 2) / ELEMENTS.length;

export class RadialMenuScene extends Phaser.Scene {
  #graphics!: Phaser.GameObjects.Graphics;
  #labelTexts!: Phaser.GameObjects.Text[];
  #centerText!: Phaser.GameObjects.Text;
  #titleText!: Phaser.GameObjects.Text;
  #selectedElement!: Element;
  #hoveredElement: Element | null = null;

  constructor() {
    super({ key: SCENE_KEYS.RADIAL_MENU_SCENE });
  }

  public create(): void {
    if (!this.input.keyboard) {
      this.scene.stop();
      return;
    }

    this.#selectedElement = ElementManager.instance.activeElement;
    this.#hoveredElement = this.#selectedElement;

    const zoom = Math.min(this.scale.width / 480, this.scale.height / 320);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(CX, CY);

    // Close and commit selection the moment Ctrl is released (fires exactly once)
    this.input.keyboard.once('keyup-CTRL', () => {
      ElementManager.instance.setElement(this.#selectedElement);
      this.scene.stop();
    });

    // Semi-transparent background overlay
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.45).setOrigin(0);

    // Graphics layer for the pizza slices
    this.#graphics = this.add.graphics();

    // Title hint at top of menu
    this.#titleText = this.add
      .text(CX, CY - OUTER_RADIUS_HOVER - 12, 'SELECT ELEMENT', {
        fontFamily: ASSET_KEYS.FONT_PRESS_START_2P,
        fontSize: '5px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5, 1);

    // Pre-create one text label per element
    this.#labelTexts = ELEMENTS.map((el, i) => {
      const midAngle = START_ANGLE + SLICE_ANGLE * i + SLICE_ANGLE / 2;
      const lx = CX + Math.cos(midAngle) * LABEL_RADIUS;
      const ly = CY + Math.sin(midAngle) * LABEL_RADIUS;
      return this.add
        .text(lx, ly, ELEMENT_LABELS[el], {
          fontFamily: ASSET_KEYS.FONT_PRESS_START_2P,
          fontSize: '5px',
          color: '#ffffff',
          align: 'center',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);
    });

    // Center text shows currently highlighted element name
    this.#centerText = this.add
      .text(CX, CY, '', {
        fontFamily: ASSET_KEYS.FONT_PRESS_START_2P,
        fontSize: '5px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5);

    this.#redraw();
  }

  public update(): void {
    // Determine which slice the mouse is aiming at
    const pointer = this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const dx = worldPoint.x - CX;
    const dy = worldPoint.y - CY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let hovered: Element | null = null;
    if (dist > INNER_RADIUS) {
      // atan2 returns angle from centre; normalise relative to START_ANGLE
      let angle = Math.atan2(dy, dx) - START_ANGLE;
      if (angle < 0) angle += Math.PI * 2;
      const index = Math.floor(angle / SLICE_ANGLE) % ELEMENTS.length;
      hovered = ELEMENTS[index];
    }

    if (hovered !== null) {
      this.#selectedElement = hovered;
    }

    if (hovered !== this.#hoveredElement) {
      this.#hoveredElement = hovered;
      this.#redraw();
    }
  }

  #redraw(): void {
    this.#graphics.clear();

    for (let i = 0; i < ELEMENTS.length; i++) {
      const el = ELEMENTS[i];
      const isHovered = el === this.#selectedElement;
      const outerR = isHovered ? OUTER_RADIUS_HOVER : OUTER_RADIUS;
      const start = START_ANGLE + SLICE_ANGLE * i;
      const end = start + SLICE_ANGLE;
      const color = ELEMENT_COLORS[el];
      const alpha = isHovered ? 1.0 : 0.65;

      // Draw filled slice
      this.#graphics.fillStyle(color, alpha);
      this.#graphics.slice(CX, CY, outerR, start, end, false);
      this.#graphics.fillPath();

      // Draw white border on each slice edge
      this.#graphics.lineStyle(1, 0xffffff, 0.5);
      this.#graphics.slice(CX, CY, outerR, start, end, false);
      this.#graphics.strokePath();

      // Reposition label
      const midAngle = start + SLICE_ANGLE / 2;
      const lr = isHovered ? LABEL_RADIUS_HOVER : LABEL_RADIUS;
      this.#labelTexts[i].setX(CX + Math.cos(midAngle) * lr);
      this.#labelTexts[i].setY(CY + Math.sin(midAngle) * lr);
      this.#labelTexts[i].setColor(isHovered ? '#ffff66' : '#ffffff');
    }

    // Inner circle (centre hole)
    this.#graphics.fillStyle(0x111122, 0.92);
    this.#graphics.fillCircle(CX, CY, INNER_RADIUS);
    this.#graphics.lineStyle(1, 0xffffff, 0.6);
    this.#graphics.strokeCircle(CX, CY, INNER_RADIUS);

    // Update centre label
    this.#centerText.setText(ELEMENT_LABELS[this.#selectedElement]);
    this.#centerText.setColor(
      ELEMENT_COLORS[this.#selectedElement]
        ? `#${ELEMENT_COLORS[this.#selectedElement].toString(16).padStart(6, '0')}`
        : '#ffffff',
    );
  }
}
