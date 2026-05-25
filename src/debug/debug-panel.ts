import { RUNTIME_CONFIG } from '../common/runtime-config';
import { CUSTOM_EVENTS, EVENT_BUS } from '../common/event-bus';
import { Puddle } from '../game-objects/spells/puddle';
import { NetworkManager } from '../networking/network-manager';

interface ParamDef {
  key: keyof typeof RUNTIME_CONFIG;
  label: string;
  min: number;
  max: number;
  step: number;
  /** If true, change immediately refreshes all active lava puddles (re-syncs
   *  body, restarts FX timers, redraws). Use for any param Puddle reads. */
  refreshLava?: boolean;
  /** If true, change calls NetworkManager.restartGameTick() so the new tick
   *  rate takes effect immediately. Used for NETWORK_TICK_RATE_HZ. */
  refreshNetwork?: boolean;
}

const SECTIONS: { title: string; params: ParamDef[] }[] = [
  {
    // Tick-rate slider for live A/B testing during a LAN smoke test.
    // 20 = original; 30 = conservative; 60 = LAN default; 90/120 = stress only.
    // restartGameTick() applies the new value without a page reload.
    title: 'NETWORK',
    params: [
      { key: 'NETWORK_TICK_RATE_HZ', label: 'Tick rate (Hz)', min: 10, max: 120, step: 10, refreshNetwork: true },
    ],
  },
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
  {
    title: 'LAVA PUDDLE — size + body',
    params: [
      { key: 'PUDDLE_LAVA_LIFETIME_MS', label: 'Lifetime (ms)', min: 1000, max: 60000, step: 500, refreshLava: true },
      { key: 'PUDDLE_LAVA_RADIUS_MULTIPLIER', label: 'Overall ×', min: 0.2, max: 3, step: 0.05, refreshLava: true },
      { key: 'PUDDLE_LAVA_BODY_RADIUS_FRAC', label: 'Hitbox frac', min: 0.2, max: 1.5, step: 0.05, refreshLava: true },
      { key: 'LAVA_PUDDLE_DAMAGE_PER_TICK', label: 'Damage/tick', min: 0, max: 20, step: 1 },
      { key: 'LAVA_PUDDLE_TICK_INTERVAL_MS', label: 'Tick (ms)', min: 100, max: 2000, step: 50 },
    ],
  },
  {
    title: 'LAVA — rim (outer light)',
    params: [
      { key: 'PUDDLE_LAVA_RIM_BLOB_COUNT', label: 'Blobs', min: 1, max: 16, step: 1, refreshLava: true },
      { key: 'PUDDLE_LAVA_RIM_RX_FRAC', label: 'RX frac', min: 0.1, max: 2.0, step: 0.02, refreshLava: true },
      { key: 'PUDDLE_LAVA_RIM_RY_FRAC', label: 'RY frac', min: 0.1, max: 2.0, step: 0.02, refreshLava: true },
      { key: 'PUDDLE_LAVA_RIM_SIZE_JITTER', label: 'Size jit', min: 0, max: 1.0, step: 0.01, refreshLava: true },
      { key: 'PUDDLE_LAVA_RIM_OFFSET_FRAC', label: 'Offset frac', min: 0, max: 1.0, step: 0.02, refreshLava: true },
      { key: 'PUDDLE_LAVA_RIM_ANGLE_JITTER', label: 'Angle jit (rad)', min: 0, max: 3.14, step: 0.05, refreshLava: true },
      { key: 'PUDDLE_LAVA_RIM_ELLIPSE_ROTATION_RANGE', label: 'Rotation (rad)', min: 0, max: 3.14, step: 0.05, refreshLava: true },
      { key: 'PUDDLE_LAVA_RIM_ALPHA', label: 'Alpha', min: 0, max: 1, step: 0.05, refreshLava: true },
    ],
  },
  {
    title: 'LAVA — core (inner dark)',
    params: [
      { key: 'PUDDLE_LAVA_CORE_BLOB_COUNT', label: 'Blobs', min: 1, max: 16, step: 1, refreshLava: true },
      { key: 'PUDDLE_LAVA_CORE_RX_FRAC', label: 'RX frac', min: 0.1, max: 2.0, step: 0.02, refreshLava: true },
      { key: 'PUDDLE_LAVA_CORE_RY_FRAC', label: 'RY frac', min: 0.1, max: 2.0, step: 0.02, refreshLava: true },
      { key: 'PUDDLE_LAVA_CORE_SIZE_JITTER', label: 'Size jit', min: 0, max: 1.0, step: 0.01, refreshLava: true },
      { key: 'PUDDLE_LAVA_CORE_OFFSET_FRAC', label: 'Offset frac', min: 0, max: 1.0, step: 0.02, refreshLava: true },
      { key: 'PUDDLE_LAVA_CORE_ANGLE_JITTER', label: 'Angle jit (rad)', min: 0, max: 3.14, step: 0.05, refreshLava: true },
      { key: 'PUDDLE_LAVA_CORE_ELLIPSE_ROTATION_RANGE', label: 'Rotation (rad)', min: 0, max: 3.14, step: 0.05, refreshLava: true },
      { key: 'PUDDLE_LAVA_CORE_ALPHA', label: 'Alpha', min: 0, max: 1, step: 0.05, refreshLava: true },
    ],
  },
  {
    title: 'LAVA — noise & embers',
    params: [
      { key: 'PUDDLE_LAVA_NOISE_COUNT', label: 'Noise count', min: 0, max: 40, step: 1, refreshLava: true },
      { key: 'PUDDLE_LAVA_NOISE_SIZE_MIN_PX', label: 'Noise min px', min: 1, max: 8, step: 1, refreshLava: true },
      { key: 'PUDDLE_LAVA_NOISE_SIZE_MAX_PX', label: 'Noise max px', min: 1, max: 12, step: 1, refreshLava: true },
      { key: 'PUDDLE_LAVA_BUBBLE_REDRAW_MS', label: 'Bubble (ms)', min: 0, max: 2000, step: 50, refreshLava: true },
      { key: 'PUDDLE_LAVA_EMBER_EMIT_INTERVAL_MS', label: 'Ember interval', min: 30, max: 2000, step: 20, refreshLava: true },
      { key: 'PUDDLE_LAVA_EMBER_PER_EMIT_MIN', label: 'Ember min', min: 0, max: 10, step: 1 },
      { key: 'PUDDLE_LAVA_EMBER_PER_EMIT_MAX', label: 'Ember max', min: 1, max: 10, step: 1 },
      { key: 'PUDDLE_LAVA_EMBER_LIFETIME_MS', label: 'Ember life', min: 100, max: 2000, step: 50 },
      { key: 'PUDDLE_LAVA_EMBER_RISE_PX_MIN', label: 'Rise min px', min: 0, max: 30, step: 1 },
      { key: 'PUDDLE_LAVA_EMBER_RISE_PX_MAX', label: 'Rise max px', min: 1, max: 40, step: 1 },
      { key: 'PUDDLE_LAVA_EMBER_SIZE_PX_MIN', label: 'Ember sz min', min: 1, max: 6, step: 1 },
      { key: 'PUDDLE_LAVA_EMBER_SIZE_PX_MAX', label: 'Ember sz max', min: 1, max: 8, step: 1 },
    ],
  },
];

const PANEL_CSS = `
  #game-debug-panel {
    position: fixed;
    top: 10px;
    right: 10px;
    width: 280px;
    height: calc(100vh - 20px);
    min-width: 220px;
    min-height: 160px;
    max-width: 95vw;
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
  #defaultValues: Record<string, number | boolean | string>;

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
        return;
      }
      // J — spawn a lava puddle at the current cursor world position.
      // Ignore when typing in form fields so it doesn't conflict with inputs.
      if (e.key === 'j' || e.key === 'J') {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
        EVENT_BUS.emit(CUSTOM_EVENTS.DEBUG_SPAWN_LAVA_PUDDLE);
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
      <div class="hint">Tab — toggle &nbsp;|&nbsp; J — spawn lava at cursor &nbsp;|&nbsp; drag bottom-right to resize</div>
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

    // Lightning burst variant toggle (002 vs 003) — applied to the FireBolt+ThunderStrike
    // combo on the next cast. Click cycles through the two values.
    const burstBtn = document.createElement('button');
    burstBtn.className = 'action-btn';
    const refreshBurstLabel = (): void => {
      burstBtn.textContent = `LIGHTNING BURST: ${RUNTIME_CONFIG.LIGHTNING_BURST_VARIANT}`;
    };
    refreshBurstLabel();
    burstBtn.addEventListener('click', () => {
      RUNTIME_CONFIG.LIGHTNING_BURST_VARIANT =
        RUNTIME_CONFIG.LIGHTNING_BURST_VARIANT === '002' ? '003' : '002';
      refreshBurstLabel();
    });
    panel.appendChild(burstBtn);

    // Thunder-strike sprite-variant toggle (Thunder Effect 02 vs Magic Pack 9 Lightning).
    const sprBtn = document.createElement('button');
    sprBtn.className = 'action-btn';
    const refreshSprLabel = (): void => {
      sprBtn.textContent = `THUNDER SPRITE: ${RUNTIME_CONFIG.LIGHTNING_SPRITE_VARIANT}`;
    };
    refreshSprLabel();
    sprBtn.addEventListener('click', () => {
      RUNTIME_CONFIG.LIGHTNING_SPRITE_VARIANT =
        RUNTIME_CONFIG.LIGHTNING_SPRITE_VARIANT === 'CURRENT' ? 'MAGIC_PACK_9' : 'CURRENT';
      refreshSprLabel();
    });
    panel.appendChild(sprBtn);

    // Live read-out: current effective tick rate + backpressure-drop counter.
    // Polled at 500ms so it reflects RUNTIME_CONFIG changes and ongoing mesh state.
    const netStatus = document.createElement('div');
    netStatus.className = 'section-title';
    netStatus.style.color = '#88ff88';
    netStatus.style.marginTop = '10px';
    netStatus.textContent = 'NET STATUS: offline';
    panel.appendChild(netStatus);

    const refreshNetStatus = (): void => {
      try {
        const nm = NetworkManager.getInstance();
        const snap = nm.debugSnapshot();
        const dropped = snap.droppedDueToBuffer;
        const droppedColor = dropped === 0 ? '#88ff88' : dropped < 100 ? '#ffcc55' : '#ff6655';
        netStatus.style.color = droppedColor;
        netStatus.textContent = `NET: ${snap.currentTickRateHz}Hz | dropped(buffer): ${dropped} | peers: ${snap.peerConnections.length}`;
      } catch {
        netStatus.style.color = '#666';
        netStatus.textContent = 'NET STATUS: offline';
      }
    };
    refreshNetStatus();
    // Poll every 500ms. setInterval is fine here — the panel persists for the page lifetime.
    setInterval(refreshNetStatus, 500);

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
      (RUNTIME_CONFIG as Record<string, number | boolean | string>)[param.key] = parsed;
      valueDisplay.textContent = String(parsed);
      // Lava-related changes: push them into every active lava puddle
      // immediately so you see the effect while dragging the slider, rather
      // than waiting for new puddles to spawn.
      if (param.refreshLava) Puddle.refreshAllLava();
      // Network tick-rate change: re-establish the interval at the new rate.
      // Wrapped in try because the panel can be open before a NM exists.
      if (param.refreshNetwork) {
        try {
          NetworkManager.getInstance().restartGameTick();
        } catch {
          /* offline — slider value persists in RUNTIME_CONFIG until a game starts */
        }
      }
    });

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(valueDisplay);
    return row;
  }

  #resetAll(panel: HTMLDivElement): void {
    for (const [key, val] of Object.entries(this.#defaultValues)) {
      (RUNTIME_CONFIG as Record<string, number | boolean | string>)[key] = val;
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