import { RUNTIME_CONFIG } from './runtime-config';

// Relative (not '/assets/...') so the cursor resolves under the platform subpath
// feira-de-jogos.dev.br/<slug>/ instead of 404-ing at the domain root. Works on LAN too.
const CURSOR_URL = './assets/cursor/cursor.png';

function apply(): void {
  const x = Math.max(0, Math.round(RUNTIME_CONFIG.CURSOR_HOTSPOT_X));
  const y = Math.max(0, Math.round(RUNTIME_CONFIG.CURSOR_HOTSPOT_Y));
  document.body.style.cursor = `url('${CURSOR_URL}') ${x} ${y}, crosshair`;
}

/**
 * Installs the custom cursor and a small adjustment keymap. Ctrl+ArrowLeft/Right shifts the
 * hotspot X by 1; Ctrl+ArrowUp/Down shifts Y. Reset with Ctrl+0. Values land in RUNTIME_CONFIG
 * so they survive between scenes and the debug panel can also drive them.
 */
export function installCustomCursor(): void {
  apply();
  // Expose tuning helpers on window for ad-hoc adjustment via devtools.
  (window as unknown as { adjustCursor: (x: number, y: number) => void }).adjustCursor = (x: number, y: number) => {
    RUNTIME_CONFIG.CURSOR_HOTSPOT_X = x;
    RUNTIME_CONFIG.CURSOR_HOTSPOT_Y = y;
    apply();
  };

  window.addEventListener('keydown', (ev) => {
    if (!ev.ctrlKey) return;
    let handled = true;
    switch (ev.key) {
      case 'ArrowLeft':
        RUNTIME_CONFIG.CURSOR_HOTSPOT_X -= 1;
        break;
      case 'ArrowRight':
        RUNTIME_CONFIG.CURSOR_HOTSPOT_X += 1;
        break;
      case 'ArrowUp':
        RUNTIME_CONFIG.CURSOR_HOTSPOT_Y -= 1;
        break;
      case 'ArrowDown':
        RUNTIME_CONFIG.CURSOR_HOTSPOT_Y += 1;
        break;
      case '0':
        RUNTIME_CONFIG.CURSOR_HOTSPOT_X = 8;
        RUNTIME_CONFIG.CURSOR_HOTSPOT_Y = 8;
        break;
      default:
        handled = false;
    }
    if (handled) {
      ev.preventDefault();
      apply();
      console.log(`[cursor] hotspot = (${RUNTIME_CONFIG.CURSOR_HOTSPOT_X}, ${RUNTIME_CONFIG.CURSOR_HOTSPOT_Y})`);
    }
  });
}
