import * as Phaser from 'phaser';
import { startScene } from './scene-transition';

// ---------------------------------------------------------------------------
// buildMenuPlaceholder
// ---------------------------------------------------------------------------
// Utility that builds a consistent "under construction" layout for menu stub
// scenes.  This is NOT a base class â€” it's a plain function called inside each
// scene's create() method so the scene hierarchy stays flat and Phaser-idiomatic.
//
// TEXT CLARITY â€” same strategy as MainMenuScene:
//   â€¢ setResolution(2) on all Text objects renders internally at 2Ã— game-pixel
//     density, reducing blurriness of the web font when canvas is scaled up.
//   â€¢ Integer coordinates via Math.round() prevent sub-pixel offsets.
//   â€¢ pixelArt:true and roundPixels:true are already set globally in main.ts.
//
// FUTURE UPGRADE: replace Text objects with BitmapText once a .fnt bitmap font
// is available for 'FONT_PRESS_START_2P'.
// ---------------------------------------------------------------------------

const FONT = 'FONT_PRESS_START_2P';
const FONT_RES = 2;

export type MenuPlaceholderOptions = {
  /** Big heading shown at the top of the scene. */
  title: string;
  /** Small descriptive line under the title. */
  hint?: string;
  /** Label for an optional primary action button. */
  primaryLabel?: string;
  /** Callback for the primary action button. */
  primaryAction?: () => void;
  /** Scene key to transition to when the BACK button is pressed. */
  backScene: string;
};

export function buildMenuPlaceholder(scene: Phaser.Scene, opts: MenuPlaceholderOptions): void {
  const { width, height } = scene.scale;
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);

  // Smooth fade-in on every entry.
  scene.cameras.main.fadeIn(300, 0, 0, 0);

  // --- Background ---
  scene.add.rectangle(0, 0, width, height, 0x080818, 1).setOrigin(0);

  // Top accent bar
  const g = scene.add.graphics();
  g.fillStyle(0x0d0d2a, 1);
  g.fillRect(0, 0, width, 36);
  g.fillRect(0, height - 36, width, 36);
  g.lineStyle(1, 0x2222aa, 0.5);
  g.beginPath();
  g.moveTo(0, 36);
  g.lineTo(width, 36);
  g.strokePath();
  g.beginPath();
  g.moveTo(0, height - 36);
  g.lineTo(width, height - 36);
  g.strokePath();

  // --- Title ---
  scene.add
    .text(cx, Math.round(cy - 90), opts.title, {
      fontFamily: FONT,
      fontSize: '16px',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
    })
    .setOrigin(0.5)
    .setResolution(FONT_RES);

  // --- Hint ---
  if (opts.hint) {
    scene.add
      .text(cx, Math.round(cy - 58), opts.hint, {
        fontFamily: FONT,
        fontSize: '7px',
        color: '#8888cc',
        align: 'center',
        wordWrap: { width: 320 },
      })
      .setOrigin(0.5)
      .setResolution(FONT_RES);
  }

  // --- Placeholder badge ---
  scene.add
    .text(cx, Math.round(cy), '[ EM CONSTRUCAO ]', {
      fontFamily: FONT,
      fontSize: '8px',
      color: '#444466',
      align: 'center',
    })
    .setOrigin(0.5)
    .setResolution(FONT_RES);

  // --- Primary action button (optional) ---
  if (opts.primaryLabel && opts.primaryAction) {
    const primaryY = Math.round(cy + 40);
    const btnBg = scene.add
      .rectangle(cx, primaryY, 200, 22, 0x223388, 1)
      .setOrigin(0.5)
      .setInteractive();

    const primaryText = scene.add
      .text(cx, primaryY, opts.primaryLabel, {
        fontFamily: FONT,
        fontSize: '8px',
        color: '#e0e0ff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setResolution(FONT_RES);

    btnBg.on('pointerover', () => {
      btnBg.setFillStyle(0x3355bb);
      primaryText.setColor('#ffffff');
      document.body.style.cursor = "url('/assets/cursor/cursor-hover.png') 16 16, pointer";
    });
    btnBg.on('pointerout', () => {
      btnBg.setFillStyle(0x223388);
      primaryText.setColor('#e0e0ff');
      document.body.style.cursor = '';
    });
    btnBg.on('pointerup', () => opts.primaryAction!());
  }

  // --- Back button ---
  const backY = Math.round(height - 60);
  const backBg = scene.add
    .rectangle(cx, backY, 140, 20, 0x111133, 1)
    .setOrigin(0.5)
    .setInteractive();

  const backText = scene.add
    .text(cx, backY, '< VOLTAR', {
      fontFamily: FONT,
      fontSize: '8px',
      color: '#8888bb',
      align: 'center',
    })
    .setOrigin(0.5)
    .setResolution(FONT_RES);

  backBg.on('pointerover', () => {
    backBg.setFillStyle(0x1a1a55);
    backText.setColor('#aaaaff');
    document.body.style.cursor = "url('/assets/cursor/cursor-hover.png') 16 16, pointer";
  });
  backBg.on('pointerout', () => {
    backBg.setFillStyle(0x111133);
    backText.setColor('#8888bb');
    document.body.style.cursor = '';
  });
  backBg.on('pointerup', () => startScene(scene, opts.backScene));
}
