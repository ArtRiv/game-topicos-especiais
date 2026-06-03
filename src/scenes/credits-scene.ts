import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { startScene } from './scene-transition';
import { MusicManager } from '../common/music-manager';

const BMFONT_KEY = 'press_start_2p';
const PARTICLE_KEY = 'credits_sq_particle';

export class CreditsScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.CREDITS_SCENE });
  }

  public preload(): void {
    this.load.image('credits_arthur', 'credits/arthur.png');
    this.load.image('credits_gustavo', 'credits/gustavo.jpg');
  }

  public create(): void {
    MusicManager.instance.playMenu(this);

    const { width, height } = this.scale;
    const cx = Math.round(width / 2);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Deep background
    this.add.rectangle(0, 0, width, height, 0x000000).setOrigin(0).setDepth(-5);

    // Generate 4×4 white square texture for particles
    const gfx = this.add.graphics();
    gfx.fillStyle(0xffffff);
    gfx.fillRect(0, 0, 4, 4);
    gfx.generateTexture(PARTICLE_KEY, 4, 4);
    gfx.destroy();

    // Yellow square rain — behind everything
    this.add.particles(0, 0, PARTICLE_KEY, {
      x: { min: 0, max: width },
      y: { min: -8, max: 0 },
      speedY: { min: 45, max: 110 },
      speedX: { min: -8, max: 8 },
      scale: { min: 0.6, max: 2.0 },
      alpha: { start: 0.75, end: 0 },
      tint: 0xffd700,
      lifespan: { min: 2800, max: 4200 },
      quantity: 1,
      frequency: 55,
      advance: 3000,
    }).setDepth(-2);

    // Title
    this.add
      .bitmapText(cx, 14, BMFONT_KEY, 'CREDITOS', 16)
      .setOrigin(0.5, 0)
      .setTint(0xffd700)
      .setCenterAlign()
      .setDepth(1);

    // Gold underline
    this.add.rectangle(cx, 35, 148, 2, 0xffd700).setOrigin(0.5, 0).setDepth(1);

    // Stars decorating the title bar
    for (let i = 0; i < 5; i++) {
      const sx = 30 + i * (width - 60) / 4;
      this.add.rectangle(sx, 20, 3, 3, 0xffd700, 0.5).setOrigin(0.5).setDepth(1);
    }

    // Divider
    this.add.rectangle(cx, 50, 1, height - 70, 0x223355, 0.7).setOrigin(0.5, 0).setDepth(1);

    const photoRadius = 40;
    const photoY = 110;
    const arthurX = Math.round(width * 0.27);
    const gustavoX = Math.round(width * 0.73);

    this.#addCard(arthurX, photoY, photoRadius, 'credits_arthur', 'ARTHUR', 'FELACO MATOS', 1.35, -8);
    this.#addCard(gustavoX, photoY, photoRadius, 'credits_gustavo', 'GUSTAVO', 'PFLEGER REBELO');

    // Back hint
    this.add
      .bitmapText(cx, height - 14, BMFONT_KEY, 'PRESS ESC TO RETURN', 8)
      .setOrigin(0.5, 1)
      .setTint(0x8888bb)
      .setCenterAlign()
      .setDepth(1);

    this.input.keyboard!.once('keydown-ESC', () =>
      startScene(this, SCENE_KEYS.MAIN_MENU_SCENE),
    );
  }

  #addCard(
    x: number,
    photoY: number,
    radius: number,
    textureKey: string,
    firstName: string,
    lastName: string,
    photoZoom = 1,
    photoOffsetY = 0,
  ): void {
    // Outer glow ring
    const glow = this.add.graphics().setDepth(0);
    glow.lineStyle(4, 0xffd700, 0.25);
    glow.strokeCircle(x, photoY, radius + 5);

    // Gold border ring
    const border = this.add.graphics().setDepth(2);
    border.lineStyle(2, 0xffd700, 1);
    border.strokeCircle(x, photoY, radius + 1);

    // Photo image masked to circle
    const img = this.add.image(x, photoY + photoOffsetY, textureKey).setDepth(1);
    const minDim = Math.min(img.width, img.height);
    img.setScale(((radius * 2) / minDim) * photoZoom);

    const maskGfx = this.add.graphics();
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillCircle(x, photoY, radius);
    img.setMask(maskGfx.createGeometryMask());
    maskGfx.setVisible(false);

    // Name lines
    const nameY = photoY + radius + 12;

    this.add
      .bitmapText(x, nameY, BMFONT_KEY, firstName, 8)
      .setOrigin(0.5, 0)
      .setTint(0xffffff)
      .setCenterAlign()
      .setDepth(2);

    this.add
      .bitmapText(x, nameY + 13, BMFONT_KEY, lastName, 8)
      .setOrigin(0.5, 0)
      .setTint(0xdddddd)
      .setCenterAlign()
      .setDepth(2);

    // Role badge
    const badgeY = nameY + 32;
    const badge = this.add.graphics().setDepth(2);
    badge.fillStyle(0xffd700, 0.15);
    badge.fillRoundedRect(x - 30, badgeY - 2, 60, 14, 3);
    badge.lineStyle(1, 0xffd700, 0.6);
    badge.strokeRoundedRect(x - 30, badgeY - 2, 60, 14, 3);

    this.add
      .bitmapText(x, badgeY + 5, BMFONT_KEY, '* TUDO *', 8)
      .setOrigin(0.5, 0.5)
      .setTint(0xffd700)
      .setCenterAlign()
      .setDepth(3);
  }
}
