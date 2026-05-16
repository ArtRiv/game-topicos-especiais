import { RUNTIME_CONFIG } from '../common/runtime-config';
import { CUSTOM_EVENTS, EVENT_BUS } from '../common/event-bus';

interface ParamDef {
  key: keyof typeof RUNTIME_CONFIG;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SECTIONS: { title: string; params: ParamDef[] }[] = [
  {
    title: 'FIRE BOLT',
    params: [
      { key: 'FIRE_BOLT_SPEED', label: 'Speed', min: 0, max: 2000, step: 50 },
      { key: 'FIRE_BOLT_DAMAGE', label: 'Damage', min: 1, max: 20, step: 1 },
      { key: 'FIRE_BOLT_COOLDOWN', label: 'Cooldown (ms)', min: 100, max: 5000, step: 100 },
    ],
  },
  {
    title: 'EARTH BOLT',
    params: [
      { key: 'EARTH_BOLT_SPEED', label: 'Speed', min: 0, max: 2000, step: 50 },
      { key: 'EARTH_BOLT_DAMAGE', label: 'Damage', min: 1, max: 20, step: 1 },
      { key: 'EARTH_BOLT_COOLDOWN', label: 'Cooldown (ms)', min: 100, max: 5000, step: 100 },
    ],
  },
  {
    title: 'EARTH+FIRE COMBO',
    params: [
      { key: 'EARTH_FIRE_EXPLOSION_DAMAGE', label: 'Damage', min: 1, max: 50, step: 1 },
      { key: 'EARTH_FIRE_EXPLOSION_SCALE', label: 'Scale', min: 0.5, max: 6, step: 0.25 },
      { key: 'EARTH_FIRE_EXPLOSION_BODY_RADIUS', label: 'Hit Radius (px)', min: 8, max: 256, step: 8 },
    ],
  },
];

const PANEL_CSS = `
  #game-debug-panel {
    position: fixed;
    top: 10px;
    right: 10px;
    width: 280px;
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
  #game-debug-panel.visible { display: block; }
  #game-debug-panel h2 {
    margin: 0 0 8px;
    font-size: 18px;
    color: #ffcc00;
    letter-spacing: 1px;
    border-bottom: 1px solid #333;
    padding-bottom: 5px;
  }
  #game-debug-panel .hint {
    color: #666;
    font-size: 14px;
    margin-bottom: 8px;
  }
  #game-debug-panel .section-title {
    color: #88ccff;
    font-size: 16px;
    letter-spacing: 1px;
    margin: 8px 0 4px;
  }
  #game-debug-panel .param-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 3px 0;
  }
  #game-debug-panel .param-label {
    flex: 0 0 110px;
    color: #aaa;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  #game-debug-panel .param-row input[type=range] {
    flex: 1;
    height: 4px;
    cursor: url('/assets/cursor/cursor-hover.png') 16 16, pointer;
    accent-color: #ffcc00;
  }
  #game-debug-panel .param-value {
    flex: 0 0 44px;
    text-align: right;
    color: #ffcc00;
    font-size: 14px;
  }
  #game-debug-panel .reset-btn {
    margin-top: 10px;
    width: 100%;
    background: #222;
    color: #aaa;
    border: 1px solid #555;
    border-radius: 3px;
    padding: 4px 0;
    cursor: url('/assets/cursor/cursor-hover.png') 16 16, pointer;
    font-family: inherit;
    font-size: 10px;
    letter-spacing: 1px;
  }
  #game-debug-panel .reset-btn:hover { background: #333; color: #fff; }
  #game-debug-panel .action-btn {
    margin-top: 8px;
    width: 100%;
    background: #263238;
    color: #cfe8ff;
    border: 1px solid #4b6b7a;
    border-radius: 3px;
    padding: 6px 0;
    cursor: url('/assets/cursor/cursor-hover.png') 16 16, pointer;
    font-family: inherit;
    font-size: 10px;
    letter-spacing: 1px;
  }
  #game-debug-panel .action-btn:hover {
    background: #34505d;
    color: #ffffff;
  }
`;

export class DebugPanel {
  #panel: HTMLDivElement;
  #defaultValues: Record<string, number>;

  constructor() {
    this.#defaultValues = Object.fromEntries(
      Object.entries(RUNTIME_CONFIG).map(([k, v]) => [k, v]),
    );

    this.#injectStyles();
    this.#panel = this.#buildPanel();
    document.body.appendChild(this.#panel);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        this.#panel.classList.toggle('visible');
      }
    });
  }

  #injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);
  }

  #buildPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'game-debug-panel';

    panel.innerHTML = `
      <h2>⚙ DEBUG CONFIG</h2>
      <div class="hint">Tab — toggle &nbsp;|&nbsp; changes take effect on next cast</div>
    `;

    for (const section of SECTIONS) {
      const title = document.createElement('div');
      title.className = 'section-title';
      title.textContent = section.title;
      panel.appendChild(title);

      for (const param of section.params) {
        panel.appendChild(this.#buildRow(param));
      }
    }

    const resetBtn = document.createElement('button');
    resetBtn.className = 'reset-btn';
    resetBtn.textContent = 'RESET TO DEFAULTS';
    resetBtn.addEventListener('click', () => this.#resetAll(panel));
    panel.appendChild(resetBtn);

    const spawnObeliskBtn = document.createElement('button');
    spawnObeliskBtn.className = 'action-btn';
    spawnObeliskBtn.textContent = 'SPAWN FLYING OBELISK';
    spawnObeliskBtn.addEventListener('click', () => {
      EVENT_BUS.emit(CUSTOM_EVENTS.DEBUG_SPAWN_FLYING_OBELISK);
    });
    panel.appendChild(spawnObeliskBtn);

    return panel;
  }

  #buildRow(param: ParamDef): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'param-row';

    const label = document.createElement('span');
    label.className = 'param-label';
    label.textContent = param.label;
    label.title = param.key;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(param.min);
    slider.max = String(param.max);
    slider.step = String(param.step);
    slider.value = String(RUNTIME_CONFIG[param.key]);
    slider.dataset['key'] = param.key;

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'param-value';
    valueDisplay.textContent = String(RUNTIME_CONFIG[param.key]);

    slider.addEventListener('input', () => {
      const parsed = parseFloat(slider.value);
      (RUNTIME_CONFIG as Record<string, number>)[param.key] = parsed;
      valueDisplay.textContent = String(parsed);
    });

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(valueDisplay);
    return row;
  }

  #resetAll(panel: HTMLDivElement): void {
    for (const [key, val] of Object.entries(this.#defaultValues)) {
      (RUNTIME_CONFIG as Record<string, number>)[key] = val;
    }

    panel.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((slider) => {
      const key = slider.dataset['key'];
      if (key && key in this.#defaultValues) {
        slider.value = String(this.#defaultValues[key]);
        const valueDisplay = slider.nextElementSibling as HTMLSpanElement | null;
        if (valueDisplay) valueDisplay.textContent = String(this.#defaultValues[key]);
      }
    });
  }
}