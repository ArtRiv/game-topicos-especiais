import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { MusicManager } from '../common/music-manager';
import { startScene } from './scene-transition';

// ---------------------------------------------------------------------------
// MainMenuScene — cinematic intro synced to menu music drop (D-05).
//
// All text uses BitmapText (Phase 9.1-04 standard, D-02 CONVERT). Cinematic
// timing constants below match UI-branch's hand-tuned values and MUST NOT be
// "fixed" — they are tuned by ear to the menu_music.ogg drop.
// ---------------------------------------------------------------------------

const BMFONT_KEY = 'press_start_2p';

// MENU_SPACING = 26 is a deliberate NON-multiple-of-4 (UI-SPEC §Spacing
// Exceptions) inherited verbatim from UI branch — do NOT "fix" to 24/32.
const MENU_SPACING = 26;

// Offset (ms) from menu_music.ogg start to the drop. Title slam fires here.
const MUSIC_DROP_MS = 2_000;

const MENU_BG_VIDEO_KEY = 'MENU_BG_VIDEO';
const MENU_BG_VIDEO_PATH = 'assets/images/ui/landscape.mp4';

// Tint palette per UI-SPEC §Typography / §Color.
const TINT_DISPLAY = 0xffffff;       // title
const TINT_HEADING = 0xe8d9a8;       // subtitle parchment
const TINT_MENU_IDLE = 0xffffff;
const TINT_MENU_HOVER = 0xffc857;    // accent gold — reserved for hover ONLY

// Module-level flag — first-visit cinematic gate (D-05). Persists across
// scene restarts within the same browser session so back-nav from stubs
// doesn't replay the 2s hold.
let cinematicPlayed = false;

type MenuEntry = { label: string; action: () => void };

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.MAIN_MENU_SCENE });
  }

  public preload(): void {
    if (!this.cache.video.has(MENU_BG_VIDEO_KEY)) {
      this.load.video(MENU_BG_VIDEO_KEY, MENU_BG_VIDEO_PATH, true);
    }
    if (!this.cache.bitmapFont.has(BMFONT_KEY)) {
      this.load.bitmapFont(
        BMFONT_KEY,
        'assets/fonts/Press_Start_2P/press_start_white-2.png',
        'assets/fonts/Press_Start_2P/press_start_white-2.xml',
      );
    }
    MusicManager.instance.loadTracks(this);
  }

  public create(): void {
    const { width, height } = this.scale;
    const cx = Math.round(width / 2);
    const cy = Math.round(height / 2);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    this.#drawBackground(cx, cy, width, height);
    const { title, subtitle } = this.#drawTitle(cx, cy);
    const menuItems = this.#drawMenu(cx, cy);

    MusicManager.instance.playMenu(this);
    // WARNING 5 / D-13: Restore menu volume to 0.05 on every MainMenu entry so
    // back-nav from Lobby (which ducks to 0.03) returns to the canonical menu
    // profile. Idempotent: no-op if menu music isn't initialised yet. The
    // playMenu call above kicks it off either way. Future-proofs back-nav.
    MusicManager.instance.setMenuVolume(0.05);

    if (cinematicPlayed) {
      // Second+ visit — show everything immediately, no cinematic replay.
      title.setAlpha(1);
      subtitle.setAlpha(1);
      menuItems.forEach((m) => m.setAlpha(1));
    } else {
      // First visit — hide everything, then reveal at the song drop.
      title.setAlpha(0);
      subtitle.setAlpha(0);
      menuItems.forEach((m) => m.setAlpha(0));

      this.time.delayedCall(MUSIC_DROP_MS, () => {
        cinematicPlayed = true;

        // Title slam: scale 1.3 -> 1.0 over 250ms Back.Out + α 0 -> 1 over 150ms.
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
          ease: 'Linear',
        });

        // Subtitle: α 0 -> 1 + y offset +8 -> 0, 200ms Quad.Out, delay 150ms.
        subtitle.y += 8;
        this.tweens.add({
          targets: subtitle,
          alpha: 1,
          y: subtitle.y - 8,
          duration: 200,
          ease: 'Quad.Out',
          delay: 150,
        });

        // Menu items: per-item α 0 -> 1 + x offset -8 -> 0, 200ms Quad.Out,
        // stagger 60ms starting at 200ms.
        menuItems.forEach((m, i) => {
          m.x -= 8;
          this.tweens.add({
            targets: m,
            alpha: 1,
            x: m.x + 8,
            duration: 200,
            ease: 'Quad.Out',
            delay: 200 + i * 60,
          });
        });
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Background — landscape.mp4 cover-fit + vignette overlay (D-06).
  //
  // pixelArt:true defines NEAREST as the global filter, which causes ugly
  // artefacts when downsampling 1920×1080 video to 480×320. We override the
  // video texture's filter to LINEAR (smooth) on play. Vignette overlay is
  // 0x000000 α 0.4 over the full canvas, beneath the text.
  // ---------------------------------------------------------------------------
  #drawBackground(cx: number, cy: number, w: number, h: number): void {
    const vid = this.add.video(cx, cy, MENU_BG_VIDEO_KEY).setOrigin(0.5);

    vid.on('play', () => {
      const vEl = vid.video as HTMLVideoElement;
      const vw = (vEl && vEl.videoWidth) || vid.width || 1920;
      const vh = (vEl && vEl.videoHeight) || vid.height || 1080;
      const cover = Math.max(w / vw, h / vh);
      vid.setDisplaySize(Math.round(vw * cover), Math.round(vh * cover));
      if (vid.texture) {
        // Phaser.Textures.FilterMode.LINEAR === 0
        vid.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    });
    vid.play(true);

    // Vignette overlay: 0x000000 α 0.4 (D-06 / UI-SPEC §Color).
    this.add.graphics().fillStyle(0x000000, 0.4).fillRect(0, 0, w, h);
  }

  #drawTitle(
    cx: number,
    cy: number,
  ): { title: Phaser.GameObjects.BitmapText; subtitle: Phaser.GameObjects.BitmapText } {
    const titleY = Math.round(cy - 110);
    // Display: 32px (UI-SPEC §Typography).
    const title = this.add
      .bitmapText(cx, titleY, BMFONT_KEY, 'HIGH FANTASY', 32)
      .setOrigin(0.5)
      .setTint(TINT_DISPLAY);
    // Heading: 16px parchment.
    const subtitle = this.add
      .bitmapText(cx, titleY + 48, BMFONT_KEY, '- ONLINE EDITION -', 16)
      .setOrigin(0.5)
      .setTint(TINT_HEADING);
    return { title, subtitle };
  }

  #drawMenu(cx: number, cy: number): Phaser.GameObjects.BitmapText[] {
    // Both CRIAR LOBBY and ENTRAR EM LOBBY route to LOBBY_SCENE per D-03 —
    // multiplayer's LobbyScene supports both flows via Connect+Browser.
    const entries: MenuEntry[] = [
      { label: 'CRIAR LOBBY',     action: () => startScene(this, SCENE_KEYS.LOBBY_SCENE, 300) },
      { label: 'ENTRAR EM LOBBY', action: () => startScene(this, SCENE_KEYS.LOBBY_SCENE, 300) },
      { label: 'CONTA',           action: () => startScene(this, SCENE_KEYS.ACCOUNT_SCENE, 300) },
      { label: 'OPCOES',          action: () => startScene(this, SCENE_KEYS.OPTIONS_SCENE, 300) },
      { label: 'CREDITOS',        action: () => startScene(this, SCENE_KEYS.CREDITS_SCENE, 300) },
      { label: 'SAIR',            action: () => console.info('[MainMenu] SAIR pressed') },
    ];

    const menuStartY = Math.round(cy - 30);
    const items: Phaser.GameObjects.BitmapText[] = [];

    entries.forEach((entry, i) => {
      const y = Math.round(menuStartY + i * MENU_SPACING);
      // Body: 16px menu items.
      const item = this.add
        .bitmapText(cx, y, BMFONT_KEY, entry.label, 16)
        .setOrigin(0.5)
        .setTint(TINT_MENU_IDLE)
        .setInteractive({ useHandCursor: true });
      items.push(item);

      item.on('pointerover', () => {
        item.setTint(TINT_MENU_HOVER);
        this.tweens.add({ targets: item, scaleX: 1.05, scaleY: 1.05, duration: 100, ease: 'Quad.Out' });
      });
      item.on('pointerout', () => {
        item.setTint(TINT_MENU_IDLE);
        this.tweens.add({ targets: item, scaleX: 1, scaleY: 1, duration: 100, ease: 'Quad.Out' });
      });
      item.on('pointerup', entry.action);
    });

    return items;
  }
}
