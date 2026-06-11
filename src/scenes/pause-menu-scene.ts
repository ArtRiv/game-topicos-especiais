import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { saveSoundVolume } from '../common/sound-settings';

// ---------------------------------------------------------------------------
// PauseMenuScene — ESC in-match options overlay
// ---------------------------------------------------------------------------
// Launched by GameScene on ESC. The match keeps RUNNING underneath (online
// match — the world can't stop for one player); GameScene gates its own local
// input while this scene is active and re-enables it on our SHUTDOWN.
//
// Pages: MAIN (continuar / som / tela cheia / controles / sair) and
// CONTROLES (static keybinding list).
//
// All text uses the press_start_2p BitmapText atlas (Phase 9.1-04 standard).
// NOTE: the atlas has no '<' / '>' glyphs — volume uses a [###...] bar and
// A/D keys instead of arrow buttons.
// ---------------------------------------------------------------------------

const BMFONT_KEY = 'press_start_2p';
const GAME_W = 480;
const GAME_H = 320;

const TINT_TITLE = 0xffffff;
const TINT_ROW = 0xffffff;
const TINT_ROW_SELECTED = 0xffff66;
const TINT_BODY = 0xb8b8b8;
const TINT_HINT = 0x8888bb;

const TITLE_Y = 44;
const ROW_START_Y = 96;
const ROW_SPACING = 24;
const BACK_ROW_Y = 272;
const HINT_Y = GAME_H - 16;

// Volume is handled in 10% ticks so the bar, the percent label and the
// persisted value can never drift apart.
const VOLUME_TICKS = 10;

type MenuPage = 'main' | 'controls';

type MenuRow = {
  text: Phaser.GameObjects.BitmapText;
  activate: () => void;
  /** A/D (or LEFT/RIGHT) handler — only the volume row uses this. */
  adjust?: (direction: -1 | 1) => void;
};

export class PauseMenuScene extends Phaser.Scene {
  #page: MenuPage = 'main';
  #rows: MenuRow[] = [];
  #selectedIndex = 0;
  /** Everything belonging to the current page — destroyed on page switch. */
  #pageObjects: Phaser.GameObjects.GameObject[] = [];
  #volumeRow: Phaser.GameObjects.BitmapText | null = null;
  #fullscreenRow: Phaser.GameObjects.BitmapText | null = null;

  constructor() {
    super({ key: SCENE_KEYS.PAUSE_MENU_SCENE });
  }

  public create(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      this.scene.stop();
      return;
    }

    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.6).setOrigin(0);

    keyboard.on('keydown-ESC', this.#handleBack, this);
    keyboard.on('keydown-W', this.#selectPrevious, this);
    keyboard.on('keydown-UP', this.#selectPrevious, this);
    keyboard.on('keydown-S', this.#selectNext, this);
    keyboard.on('keydown-DOWN', this.#selectNext, this);
    keyboard.on('keydown-A', this.#adjustLeft, this);
    keyboard.on('keydown-LEFT', this.#adjustLeft, this);
    keyboard.on('keydown-D', this.#adjustRight, this);
    keyboard.on('keydown-RIGHT', this.#adjustRight, this);
    keyboard.on('keydown-ENTER', this.#activateSelected, this);

    // Fullscreen can change behind our back (F11, browser ESC) — keep the row
    // label fresh. The ScaleManager is global, so these must be removed by hand.
    this.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, this.#refreshMainLabels, this);
    this.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, this.#refreshMainLabels, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, this.#refreshMainLabels, this);
      this.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, this.#refreshMainLabels, this);
    });

    this.#showPage('main');
  }

  // -------------------------------------------------------------------------
  // Page management
  // -------------------------------------------------------------------------

  #showPage(page: MenuPage): void {
    this.#page = page;
    this.#volumeRow = null;
    this.#fullscreenRow = null;
    this.#pageObjects.forEach((obj) => obj.destroy());
    this.#pageObjects = [];
    this.#rows = [];
    this.#selectedIndex = 0;

    if (page === 'main') {
      this.#buildMainPage();
    } else {
      this.#buildControlsPage();
    }
    this.#refreshRowTints();
  }

  #buildMainPage(): void {
    this.#addTitle('MENU');
    let y = ROW_START_Y;
    this.#addRow('CONTINUAR', y, () => this.scene.stop());
    y += ROW_SPACING;
    this.#volumeRow = this.#addRow(
      this.#volumeLabel(),
      y,
      // Click cycles the volume (wraps after 100%) so mouse-only players can
      // still change it; A/D adjusts in clamped steps.
      () => this.#cycleVolume(),
      (direction) => this.#adjustVolume(direction),
    );
    y += ROW_SPACING;
    this.#fullscreenRow = this.#addRow(this.#fullscreenLabel(), y, () => this.scale.toggleFullscreen());
    y += ROW_SPACING;
    this.#addRow('CONTROLES', y, () => this.#showPage('controls'));
    y += ROW_SPACING;
    this.#addRow('SAIR DA SALA', y, () => {
      // Same exit path as GameOverScene's "Quit": a full reload guarantees
      // clean network/scene state; the server detects the socket drop.
      window.location.reload();
    });
    this.#addHint('W/S NAVEGA  A/D AJUSTA O SOM  ESC FECHA');
  }

  #buildControlsPage(): void {
    this.#addTitle('CONTROLES');
    const lines = [
      'WASD ......... MOVER',
      'SHIFT ........ DASH',
      'ESPACO ....... ELEMENTOS (SEGURAR)',
      '1 / MOUSE ESQ  MAGIA 1',
      '2 / MOUSE DIR  MAGIA 2',
      'Q / E ........ TROCAR ELEMENTO',
      'ESC .......... ESTE MENU',
    ];
    const body = this.add
      .bitmapText(72, 80, BMFONT_KEY, lines.join('\n'), 8)
      .setOrigin(0)
      .setTint(TINT_BODY)
      .setLeftAlign();
    this.#pageObjects.push(body);
    this.#addRow('VOLTAR', BACK_ROW_Y, () => this.#showPage('main'));
  }

  // -------------------------------------------------------------------------
  // UI builders
  // -------------------------------------------------------------------------

  #addTitle(label: string): void {
    const title = this.add
      .bitmapText(GAME_W / 2, TITLE_Y, BMFONT_KEY, label, 16)
      .setOrigin(0.5)
      .setTint(TINT_TITLE)
      .setCenterAlign();
    this.#pageObjects.push(title);
  }

  #addHint(label: string): void {
    const hint = this.add
      .bitmapText(GAME_W / 2, HINT_Y, BMFONT_KEY, label, 8)
      .setOrigin(0.5)
      .setTint(TINT_HINT)
      .setCenterAlign();
    this.#pageObjects.push(hint);
  }

  #addRow(
    label: string,
    y: number,
    activate: () => void,
    adjust?: (direction: -1 | 1) => void,
  ): Phaser.GameObjects.BitmapText {
    const rowIndex = this.#rows.length;
    const text = this.add
      .bitmapText(GAME_W / 2, y, BMFONT_KEY, label, 8)
      .setOrigin(0.5)
      .setTint(TINT_ROW)
      .setCenterAlign();
    text.setInteractive();
    text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      this.#selectedIndex = rowIndex;
      this.#refreshRowTints();
    });
    // pointerup (not pointerdown): fullscreen requests need a completed user
    // gesture, and it also avoids activating a row on a stale held button.
    text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      this.#selectedIndex = rowIndex;
      this.#refreshRowTints();
      activate();
    });
    this.#rows.push({ text, activate, adjust });
    this.#pageObjects.push(text);
    return text;
  }

  // -------------------------------------------------------------------------
  // Selection / input
  // -------------------------------------------------------------------------

  #handleBack(): void {
    if (this.#page !== 'main') {
      this.#showPage('main');
      return;
    }
    this.scene.stop();
  }

  #selectPrevious(): void {
    this.#moveSelection(-1);
  }

  #selectNext(): void {
    this.#moveSelection(1);
  }

  #moveSelection(direction: -1 | 1): void {
    if (this.#rows.length === 0) return;
    this.#selectedIndex = (this.#selectedIndex + direction + this.#rows.length) % this.#rows.length;
    this.#refreshRowTints();
  }

  #adjustLeft(): void {
    this.#rows[this.#selectedIndex]?.adjust?.(-1);
  }

  #adjustRight(): void {
    this.#rows[this.#selectedIndex]?.adjust?.(1);
  }

  #activateSelected(): void {
    this.#rows[this.#selectedIndex]?.activate();
  }

  #refreshRowTints(): void {
    this.#rows.forEach((row, index) => {
      row.text.setTint(index === this.#selectedIndex ? TINT_ROW_SELECTED : TINT_ROW);
    });
  }

  // -------------------------------------------------------------------------
  // Volume / fullscreen
  // -------------------------------------------------------------------------

  #volumeTicks(): number {
    return Math.round(this.sound.volume * VOLUME_TICKS);
  }

  #volumeLabel(): string {
    const ticks = this.#volumeTicks();
    const bar = '#'.repeat(ticks) + '.'.repeat(VOLUME_TICKS - ticks);
    const pct = String(ticks * 10).padStart(3, ' ');
    return `SOM [${bar}] ${pct}%`;
  }

  #fullscreenLabel(): string {
    return `TELA CHEIA: ${this.scale.isFullscreen ? 'LIGADA' : 'DESLIGADA'}`;
  }

  #adjustVolume(direction: -1 | 1): void {
    this.#applyVolumeTicks(Phaser.Math.Clamp(this.#volumeTicks() + direction, 0, VOLUME_TICKS));
  }

  #cycleVolume(): void {
    this.#applyVolumeTicks((this.#volumeTicks() + 1) % (VOLUME_TICKS + 1));
  }

  #applyVolumeTicks(ticks: number): void {
    const volume = ticks / VOLUME_TICKS;
    // Global SoundManager volume — multiplies music AND sfx in one knob.
    this.sound.volume = volume;
    saveSoundVolume(volume);
    this.#refreshMainLabels();
  }

  #refreshMainLabels(): void {
    this.#volumeRow?.setText(this.#volumeLabel());
    this.#fullscreenRow?.setText(this.#fullscreenLabel());
  }
}
