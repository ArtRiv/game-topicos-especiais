import * as Phaser from 'phaser';
import { saveSoundVolume } from '../common/sound-settings';

// ---------------------------------------------------------------------------
// SettingsMenuBaseScene — shared settings-menu machinery
// ---------------------------------------------------------------------------
// Common core for PauseMenuScene (in-match ESC overlay) and OptionsScene
// (main-menu OPCOES). Owns the row list, W/S + mouse selection, the volume
// bar, the fullscreen toggle and the CONTROLES page. Subclasses supply only
// what differs: the backdrop, the title/hint copy, extra rows before/after
// the shared settings rows, and what "close" means (stop overlay vs. go back
// to the main menu).
//
// All text uses the press_start_2p BitmapText atlas (Phase 9.1-04 standard).
// NOTE: the atlas has no '<' / '>' glyphs — volume uses a [###...] bar and
// A/D keys instead of arrow buttons.
// ---------------------------------------------------------------------------

const BMFONT_KEY = 'press_start_2p';

export const SETTINGS_MENU_W = 480;
export const SETTINGS_MENU_H = 320;

const TINT_TITLE = 0xffffff;
const TINT_ROW = 0xffffff;
const TINT_ROW_SELECTED = 0xffff66;
const TINT_BODY = 0xb8b8b8;
const TINT_HINT = 0x8888bb;

const TITLE_Y = 44;
const ROW_START_Y = 96;
const ROW_SPACING = 24;
const BACK_ROW_Y = 272;
const HINT_Y = SETTINGS_MENU_H - 16;

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

/** Extra row contributed by a subclass to the main page. */
export type SettingsMenuRowDef = {
  label: string;
  activate: () => void;
};

export abstract class SettingsMenuBaseScene extends Phaser.Scene {
  #page: MenuPage = 'main';
  #rows: MenuRow[] = [];
  #selectedIndex = 0;
  /** Everything belonging to the current page — destroyed on page switch. */
  #pageObjects: Phaser.GameObjects.GameObject[] = [];
  #volumeRow: Phaser.GameObjects.BitmapText | null = null;
  #fullscreenRow: Phaser.GameObjects.BitmapText | null = null;

  // -------------------------------------------------------------------------
  // Subclass hooks
  // -------------------------------------------------------------------------

  /** Draw whatever sits behind the menu (dim overlay, solid black, ...). */
  protected abstract buildBackdrop(): void;
  /** Heading shown on the main page. */
  protected abstract mainTitle(): string;
  /** Bottom hint line shown on the main page. */
  protected abstract mainHint(): string;
  /** Rows placed above the shared SOM / TELA CHEIA / CONTROLES rows. */
  protected abstract rowsBeforeSettings(): SettingsMenuRowDef[];
  /** Rows placed below the shared SOM / TELA CHEIA / CONTROLES rows. */
  protected abstract rowsAfterSettings(): SettingsMenuRowDef[];
  /** ESC on the main page — leave the menu however the context demands. */
  protected abstract closeMenu(): void;

  public create(): void {
    this.#page = 'main';

    const keyboard = this.input.keyboard;
    if (!keyboard) {
      this.scene.stop();
      return;
    }

    this.buildBackdrop();

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
    this.#addTitle(this.mainTitle());
    let y = ROW_START_Y;
    for (const row of this.rowsBeforeSettings()) {
      this.#addRow(row.label, y, row.activate);
      y += ROW_SPACING;
    }
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
    for (const row of this.rowsAfterSettings()) {
      this.#addRow(row.label, y, row.activate);
      y += ROW_SPACING;
    }
    this.#addHint(this.mainHint());
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
      .bitmapText(SETTINGS_MENU_W / 2, TITLE_Y, BMFONT_KEY, label, 16)
      .setOrigin(0.5)
      .setTint(TINT_TITLE)
      .setCenterAlign();
    this.#pageObjects.push(title);
  }

  #addHint(label: string): void {
    const hint = this.add
      .bitmapText(SETTINGS_MENU_W / 2, HINT_Y, BMFONT_KEY, label, 8)
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
      .bitmapText(SETTINGS_MENU_W / 2, y, BMFONT_KEY, label, 8)
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
    this.closeMenu();
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
