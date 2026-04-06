import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { ASSET_KEYS } from '../common/assets';
import { MusicManager } from '../common/music-manager';
import { startScene } from './scene-transition';

// ---------------------------------------------------------------------------
// TEXT CLARITY STRATEGY
// ---------------------------------------------------------------------------
// Phaser's built-in Text object rasterises a web font onto an internal canvas
// and creates a GPU texture from it. At the game's native resolution (480x320)
// scaled up to fill the viewport, textures look blurry unless:
//
//   1. pixelArt: true  (main.ts) -- sets texture filter to NEAREST, preventing
//      bilinear blur when the canvas is CSS-scaled up.
//   2. roundPixels: true (main.ts) -- snaps game-object positions to integer
//      pixels so sub-pixel rendering is avoided.
//   3. setResolution(FONT_RESOLUTION) on every Text object -- internally renders
//      the text canvas at 2x the logical size, producing a sharper texture that
//      is then sampled down to the intended size. This is the key workaround for
//      web fonts in pixel-art Phaser games without a proper BitmapFont.
//   4. Integer coordinates -- all positions are Math.round()-ed to avoid
//      sub-pixel offsets that smear the texture.
//
// FUTURE UPGRADE: Replace Text objects with BitmapText once a .fnt + .png
// bitmap font is exported from the "Press Start 2P" TTF (e.g., via Littera,
// Shoebox, or the PixelFont generator). BitmapText is pixel-perfect and does
// not rely on canvas 2D font rasterisation.
// ---------------------------------------------------------------------------

// Rendering text at 2x internal resolution eliminates most blurriness when
// the font is displayed at small sizes on a scaled-up canvas.
const FONT_RESOLUTION = 4;

// Phaser registers the font under this key as the CSS font-family name.
// This mirrors the entry in public/assets/data/assets.json.
const FONT_FAMILY = 'FONT_PRESS_START_2P';

const STYLE_TITLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT_FAMILY,
  fontSize: '20px',
  color: '#ffffff',
  stroke: '#000000',
  strokeThickness: 2,
  align: 'center',
};

const STYLE_SUBTITLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT_FAMILY,
  fontSize: '8px',
  color: '#4f4fd6',
  align: 'center',
};

const STYLE_MENU: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT_FAMILY,
  fontSize: '10px',
  color: '#e0e0e0',
  align: 'center',
};

const STYLE_VERSION: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT_FAMILY,
  fontSize: '6px',
  color: '#333355',
  align: 'right',
};

// Colour palette for menu states
const COLOR_IDLE = '#e0e0e0';
const COLOR_HOVER = '#ffd700';
const COLOR_PRESSED = '#ffffff';

// Vertical gap between each menu option
const MENU_SPACING = 26;

// ============================================================
// BACKGROUND — mude esta linha para trocar o fundo do menu:
//   null  → imagem estática
//   'assets/images/ui/landscape.mp4'
//   'assets/images/ui/forest_temple.mp4'
// ============================================================
const MENU_BG_VIDEO_PATH: string | null = 'assets/images/ui/landscape.mp4';

type MenuEntry = {
  label: string;
  action: () => void;
};

// ms from the start of menu_music.ogg to the beat drop.
// Adjust by listening in browser and counting seconds to the drop.
const MUSIC_DROP_MS = 14_200;

// Skip the cinematic intro when revisiting the menu (e.g. back-nav from sub-scenes).
// Module-level so it persists across scene restarts within the same session.
let cinematicPlayed = false;

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.MAIN_MENU_SCENE });
  }

  // ---------------------------------------------------------------------------
  // preload -- loads all assets needed before the menu renders.
  //   MENU_BG:        assets/images/ui/menu_bg.jpg
  //   MENU_MUSIC:     assets/audio/menu_music.ogg    (looped throughout menu)
  //   GAMEPLAY_MUSIC: assets/audio/gameplay_music.ogg  (loaded here once for later)
  //
  // Both audio files are registered via MusicManager so the global Phaser cache
  // owns them for all future scene transitions.
  // ---------------------------------------------------------------------------
  public preload(): void {
    if (MENU_BG_VIDEO_PATH !== null) {
      this.load.video('MENU_BG_VIDEO', MENU_BG_VIDEO_PATH, true);
    } else {
      this.load.image(ASSET_KEYS.MENU_BG, 'assets/images/ui/menu_bg.jpg');
    }
    MusicManager.instance.loadTracks(this);
  }

  public create(): void {
    const { width, height } = this.scale;
    // All coordinates are rounded to integer pixels (rule 4 above).
    const cx = Math.round(width / 2);
    const cy = Math.round(height / 2);

    // Fade in from black on every entry (smooth transition from splash / sub-scenes).
    this.cameras.main.fadeIn(400, 0, 0, 0);

    this.#drawBackground(cx, cy, width, height);
    const { title, subtitle } = this.#drawTitle(cx, cy);
    const menuItems = this.#drawMenu(cx, cy);
    this.#drawFooter(width, height);

    // Start menu music. MusicManager is a no-op if the track is already
    // playing, so navigating back from any stub scene costs nothing.
    MusicManager.instance.playMenu(this);

    if (cinematicPlayed) {
      // Second+ visit — show everything immediately, no cinematic replay.
      title.setAlpha(1);
      subtitle.setAlpha(1);
      menuItems.forEach((item) => item.setAlpha(1));
    } else {
      // First visit — hide everything, then reveal at the song drop.
      title.setAlpha(0);
      subtitle.setAlpha(0);
      menuItems.forEach((item) => item.setAlpha(0));

      this.time.delayedCall(MUSIC_DROP_MS, () => {
        cinematicPlayed = true;

        // Title: instant scale-up then snap back with ease (impact flash).
        title.setScale(1.3);
        this.tweens.add({
          targets: title,
          scaleX: 1,
          scaleY: 1,
          duration: 250,
          ease: 'Back.Out',
        });
        this.tweens.add({
          targets: title,
          alpha: 1,
          duration: 150,
        });

        // Subtitle: fade in shortly after title.
        this.tweens.add({
          targets: subtitle,
          alpha: { from: 0, to: 1 },
          duration: 400,
          delay: 150,
        });

        // Menu items: staggered fade-in.
        this.tweens.add({
          targets: menuItems,
          alpha: { from: 0, to: 1 },
          duration: 300,
          ease: 'Linear',
          delay: this.tweens.stagger(60, { start: 200 }),
        });
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Background -- renders menu_bg.jpg scaled to fill the canvas, then overlays
  // a dark vignette and solid accent bars so text is always legible.
  // ---------------------------------------------------------------------------
  #drawBackground(cx: number, cy: number, w: number, h: number): void {
    if (MENU_BG_VIDEO_PATH !== null) {
      const vid = this.add.video(cx, cy, 'MENU_BG_VIDEO').setOrigin(0.5);

      // Cover scaling: mantém o aspect ratio do vídeo e cobre o canvas inteiro
      // (equivalente a CSS object-fit: cover). videoWidth/Height são populados
      // após o preload('loadeddata'), então já estão disponíveis no create().
      vid.on('play', () => {
        const videoElem = vid.video as HTMLVideoElement;
        const vw = (videoElem && videoElem.videoWidth) || vid.width || 1920;
        const vh = (videoElem && videoElem.videoHeight) || vid.height || 1080;
        const cover = Math.max(w / vw, h / vh);
        vid.setDisplaySize(Math.round(vw * cover), Math.round(vh * cover));

        // pixelArt:true define filtro NEAREST globalmente, o que causa artefatos
        // feios ao fazer downsample de 1920×1080 para 480×320. Troca para LINEAR
        // (suave) no momento em que a textura do vídeo é criada.
        // Phaser.Textures.LINEAR === 0, NEAREST === 1
        if (vid.texture) {
          vid.texture.setFilter(Phaser.Textures.LINEAR);
        }
      });

      vid.play(true); // loop=true
    } else {
      // Static image background.
      this.add.image(cx, cy, ASSET_KEYS.MENU_BG).setOrigin(0.5).setDisplaySize(w, h);
    }

    // Semi-transparent dark vignette para o texto ficar legível sobre qualquer fundo.
    this.add.graphics().fillStyle(0x000000, 0.4).fillRect(0, 0, w, h);
  }

  // ---------------------------------------------------------------------------
  // Title block
  // ---------------------------------------------------------------------------
  #drawTitle(cx: number, cy: number): { title: Phaser.GameObjects.Text; subtitle: Phaser.GameObjects.Text } {
    const titleY = Math.round(cy - 110);

    // FUTURE: replace with BitmapText once FONT_PRESS_START_2P bitmap font is exported.
    const title = this.add.text(cx, titleY, 'HIGH FANTASY', STYLE_TITLE).setOrigin(0.5).setResolution(FONT_RESOLUTION);

    const subtitle = this.add
      .text(cx, titleY + 26, '- ONLINE EDITION -', STYLE_SUBTITLE)
      .setOrigin(0.5)
      .setResolution(FONT_RESOLUTION);

    return { title, subtitle };
  }

  // ---------------------------------------------------------------------------
  // Interactive menu options
  // ---------------------------------------------------------------------------
  #drawMenu(cx: number, cy: number): Phaser.GameObjects.Text[] {
    const entries: MenuEntry[] = [
      {
        label: 'CRIAR LOBBY',
        action: () => startScene(this, SCENE_KEYS.CREATE_LOBBY_SCENE),
      },
      {
        label: 'ENTRAR EM LOBBY',
        action: () => startScene(this, SCENE_KEYS.JOIN_LOBBY_SCENE),
      },
      {
        label: 'CONTA',
        action: () => startScene(this, SCENE_KEYS.ACCOUNT_SCENE),
      },
      {
        label: 'OPCOES',
        action: () => startScene(this, SCENE_KEYS.OPTIONS_SCENE),
      },
      {
        label: 'CREDITOS',
        action: () => startScene(this, SCENE_KEYS.CREDITS_SCENE),
      },
      {
        // Placeholder -- future hook to auth logout / quit-to-desktop flow.
        label: 'SAIR',
        action: () => console.log('[MainMenu] SAIR -- placeholder. Wire auth logout here.'),
      },
    ];

    const menuStartY = Math.round(cy - 30);

    // Subtle selector highlight box that follows the hovered option.
    const selectorBox = this.add.rectangle(cx, menuStartY, 220, 18, 0x2233aa, 0).setOrigin(0.5);

    const textObjects: Phaser.GameObjects.Text[] = [];

    entries.forEach((entry, i) => {
      const y = Math.round(menuStartY + i * MENU_SPACING);

      const text = this.add
        .text(cx, y, entry.label, STYLE_MENU)
        .setOrigin(0.5)
        .setResolution(FONT_RESOLUTION)
        .setInteractive({ useHandCursor: true });

      textObjects.push(text);

      text.on('pointerover', () => {
        text.setColor(COLOR_HOVER);
        selectorBox.setY(y).setAlpha(0.25);
      });

      text.on('pointerout', () => {
        text.setColor(COLOR_IDLE);
        selectorBox.setAlpha(0);
      });

      text.on('pointerdown', () => {
        text.setColor(COLOR_PRESSED);
      });

      text.on('pointerup', () => {
        text.setColor(COLOR_HOVER);
        entry.action();
      });
    });

    return textObjects;
  }

  // ---------------------------------------------------------------------------
  // Footer -- version label
  // ---------------------------------------------------------------------------
  #drawFooter(w: number, h: number): void {
    this.add
      .text(w - 6, h - 6, 'v0.1 DEV', STYLE_VERSION)
      .setOrigin(1, 1)
      .setResolution(FONT_RESOLUTION);
  }
}
