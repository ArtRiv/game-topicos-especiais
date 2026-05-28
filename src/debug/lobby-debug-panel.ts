// ---------------------------------------------------------------------------
// LobbyDebugPanel — live tuning UI for the gatekeeper-dialogue connect screen
// ---------------------------------------------------------------------------
// Activates only while LobbyScene's connect view is on screen. Sliders and
// numeric inputs mutate the LOBBY_TUNING object in place; the scene's
// applyLobbyTuning() rebuilds positions/sizes without a beat restart.
//
// Tab toggles the panel (same hotkey as the gameplay DebugPanel — only one
// panel is visible at a time because they live in different scenes).
//
// "COPY VALUES" copies a paste-ready snippet of the current LOBBY_TUNING so
// the user can hand it back to the AI to make the layout permanent.
// ---------------------------------------------------------------------------
import * as Phaser from 'phaser';
import { LOBBY_TUNING, LobbyScene } from '../scenes/lobby-scene';
import { SCENE_KEYS } from '../scenes/scene-keys';

interface Knob {
  key: keyof typeof LOBBY_TUNING;
  label: string;
  min: number;
  max: number;
  step: number;
  /** If true, a change re-processes the portrait sheet (color-key / crop). */
  reprocessSheet?: boolean;
}

const SECTIONS: { title: string; knobs: Knob[] }[] = [
  {
    title: 'Portrait',
    knobs: [
      { key: 'PORTRAIT_X',           label: 'X',                  min: 0,   max: 480, step: 1 },
      { key: 'PORTRAIT_Y',           label: 'Y',                  min: 0,   max: 320, step: 1 },
      { key: 'PORTRAIT_SIZE_PX',     label: 'Size (px)',          min: 16,  max: 256, step: 1 },
      { key: 'FRAME_CROP_INSET_PX',  label: 'Frame crop inset',   min: 0,   max: 80,  step: 1, reprocessSheet: true },
      { key: 'WHITE_KEY_THRESHOLD',  label: 'White-key thresh.',  min: 0,   max: 255, step: 1, reprocessSheet: true },
      { key: 'AUTO_CENTER_FACES',    label: 'Auto-center (0/1)',  min: 0,   max: 1,   step: 1, reprocessSheet: true },
      { key: 'AUTO_CENTER_PAD_PX',   label: 'Auto-center pad',    min: 0,   max: 100, step: 1, reprocessSheet: true },
    ],
  },
  {
    title: 'Dialogue Box',
    knobs: [
      { key: 'BOX_X',                label: 'X',                  min: 0,   max: 480, step: 1 },
      { key: 'BOX_Y',                label: 'Y',                  min: 0,   max: 320, step: 1 },
      { key: 'BOX_W',                label: 'Width',              min: 80,  max: 480, step: 1 },
      { key: 'BOX_H',                label: 'Height',             min: 40,  max: 320, step: 1 },
      { key: 'BOX_TEXT_PAD',         label: 'Text padding',       min: 0,   max: 40,  step: 1 },
    ],
  },
  {
    title: 'Inline Input',
    knobs: [
      { key: 'INPUT_X',              label: 'Input X',            min: 0,   max: 480, step: 1 },
      { key: 'INPUT_Y',              label: 'Input Y',            min: 0,   max: 320, step: 1 },
      { key: 'INPUT_WIDTH_NICK_PX',  label: 'Nick width',         min: 60,  max: 360, step: 4 },
      { key: 'INPUT_WIDTH_IP_PX',    label: 'IP width',           min: 60,  max: 400, step: 4 },
      { key: 'HINT_X',               label: 'Hint X',             min: 0,   max: 480, step: 1 },
      { key: 'HINT_Y',               label: 'Hint Y',             min: 0,   max: 320, step: 1 },
    ],
  },
  {
    title: 'Title & Misc',
    knobs: [
      { key: 'TITLE_Y',              label: 'Title Y',            min: 0,   max: 80,  step: 1 },
      { key: 'PROMPT_OFFSET_X',      label: 'Prompt offset →',    min: 0,   max: 40,  step: 1 },
      { key: 'PROMPT_OFFSET_Y',      label: 'Prompt offset ↓',    min: 0,   max: 40,  step: 1 },
      { key: 'ERROR_OFFSET_BELOW_BOX', label: 'Error offset ↓',   min: 0,   max: 60,  step: 1 },
    ],
  },
];

const PANEL_CSS = `
  #lobby-debug-panel {
    position: fixed;
    top: 10px;
    left: 10px;
    width: 280px;
    max-height: calc(100vh - 20px);
    overflow: auto;
    resize: both;
    background: rgba(10, 10, 20, 0.92);
    color: #e0e0e0;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 10px 12px 12px;
    z-index: 99999;
    display: none;
    user-select: none;
    box-shadow: 0 4px 24px rgba(0,0,0,0.7);
  }
  #lobby-debug-panel.visible { display: block; }
  #lobby-debug-panel h2 {
    margin: 0 0 8px;
    font-size: 16px;
    color: #ffcc00;
    letter-spacing: 1px;
    border-bottom: 1px solid #333;
    padding-bottom: 5px;
  }
  #lobby-debug-panel .hint {
    color: #888;
    font-size: 11px;
    margin-bottom: 8px;
  }
  #lobby-debug-panel .section-title {
    color: #88ccff;
    font-size: 13px;
    letter-spacing: 1px;
    margin: 10px 0 4px;
  }
  #lobby-debug-panel .row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 3px 0;
  }
  #lobby-debug-panel .label {
    flex: 0 0 110px;
    color: #aaa;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  #lobby-debug-panel input[type=range] {
    flex: 1;
    height: 4px;
    accent-color: #ffcc00;
  }
  #lobby-debug-panel input[type=number] {
    flex: 0 0 56px;
    background: #111;
    color: #ffcc00;
    border: 1px solid #444;
    border-radius: 3px;
    font-family: inherit;
    font-size: 11px;
    padding: 2px 4px;
    text-align: right;
  }
  #lobby-debug-panel button {
    margin-top: 8px;
    width: 100%;
    background: #263238;
    color: #cfe8ff;
    border: 1px solid #4b6b7a;
    border-radius: 3px;
    padding: 6px 0;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    letter-spacing: 1px;
  }
  #lobby-debug-panel button:hover { background: #34505d; color: #fff; }
  #lobby-debug-panel .copy-ok { color: #88ff88; font-size: 11px; text-align: center; margin-top: 4px; }
`;

export class LobbyDebugPanel {
  #panel: HTMLDivElement;
  #game: Phaser.Game;
  #defaults: Record<string, number>;
  // Per-knob refs so we can sync slider + number input when one of them changes.
  #knobUI: Record<string, { range: HTMLInputElement; num: HTMLInputElement }> = {};

  constructor(game: Phaser.Game) {
    this.#game = game;
    this.#defaults = { ...LOBBY_TUNING };
    this.#injectStyles();
    this.#panel = this.#buildPanel();
    document.body.appendChild(this.#panel);

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      // Only react when LobbyScene's connect view is active. The gameplay
      // DebugPanel takes Tab in GameScene; this panel takes it in LobbyScene.
      const scene = this.#getLobbyScene();
      if (!scene) return;
      // The dialogue input <input> may have focus — when toggling we should
      // still grab the key (the input event listener does ev.preventDefault
      // for Enter only, so Tab will still bubble here).
      e.preventDefault();
      this.#panel.classList.toggle('visible');
    });
  }

  #getLobbyScene(): LobbyScene | null {
    const scene = this.#game.scene.getScene(SCENE_KEYS.LOBBY_SCENE) as LobbyScene | undefined;
    if (!scene) return null;
    if (!scene.scene.isActive()) return null;
    return scene;
  }

  #injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);
  }

  #buildPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'lobby-debug-panel';
    panel.innerHTML = `
      <h2>LOBBY TUNING</h2>
      <div class="hint">Tab — toggle &nbsp;|&nbsp; live preview &nbsp;|&nbsp; values save on COPY</div>
    `;

    for (const section of SECTIONS) {
      const title = document.createElement('div');
      title.className = 'section-title';
      title.textContent = section.title;
      panel.appendChild(title);
      for (const knob of section.knobs) {
        panel.appendChild(this.#buildRow(knob));
      }
    }

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'COPY VALUES';
    const copyMsg = document.createElement('div');
    copyMsg.className = 'copy-ok';
    copyMsg.style.opacity = '0';
    copyBtn.addEventListener('click', async () => {
      const lines = Object.entries(LOBBY_TUNING).map(([k, v]) => `  ${k}: ${v},`).join('\n');
      const snippet = `export const LOBBY_TUNING = {\n${lines}\n};`;
      try {
        await navigator.clipboard.writeText(snippet);
        copyMsg.textContent = 'Copied!';
      } catch {
        // Fallback: select+copy via a hidden textarea.
        const ta = document.createElement('textarea');
        ta.value = snippet;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        copyMsg.textContent = 'Copied (fallback)!';
      }
      copyMsg.style.opacity = '1';
      setTimeout(() => (copyMsg.style.opacity = '0'), 1600);
    });
    panel.appendChild(copyBtn);
    panel.appendChild(copyMsg);

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'RESET TO DEFAULTS';
    resetBtn.addEventListener('click', () => this.#resetAll());
    panel.appendChild(resetBtn);

    return panel;
  }

  #buildRow(knob: Knob): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = knob.label;

    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(knob.min);
    range.max = String(knob.max);
    range.step = String(knob.step);
    range.value = String(LOBBY_TUNING[knob.key]);

    const num = document.createElement('input');
    num.type = 'number';
    num.min = String(knob.min);
    num.max = String(knob.max);
    num.step = String(knob.step);
    num.value = String(LOBBY_TUNING[knob.key]);

    const apply = (raw: string) => {
      const v = Number(raw);
      if (!Number.isFinite(v)) return;
      (LOBBY_TUNING as Record<string, number>)[knob.key as string] = v;
      range.value = String(v);
      num.value = String(v);
      const scene = this.#getLobbyScene();
      if (!scene) return;
      if (knob.reprocessSheet) scene.reprocessPortraitSheet();
      scene.applyLobbyTuning();
    };
    range.addEventListener('input', () => apply(range.value));
    num.addEventListener('input', () => apply(num.value));

    this.#knobUI[knob.key as string] = { range, num };

    row.appendChild(label);
    row.appendChild(range);
    row.appendChild(num);
    return row;
  }

  #resetAll(): void {
    for (const [k, v] of Object.entries(this.#defaults)) {
      (LOBBY_TUNING as Record<string, number>)[k] = v as number;
      const ui = this.#knobUI[k];
      if (ui) {
        ui.range.value = String(v);
        ui.num.value = String(v);
      }
    }
    const scene = this.#getLobbyScene();
    if (!scene) return;
    scene.reprocessPortraitSheet();
    scene.applyLobbyTuning();
  }
}
