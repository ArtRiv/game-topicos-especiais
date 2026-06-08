import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { EVENT_BUS, CUSTOM_EVENTS } from '../common/event-bus';
import { NetworkManager } from '../networking/network-manager';
import type { MatchConfig, MatchStateChangedPayload } from '../networking/types';
import { MAP_POOL } from '../networking/types';
import { MusicManager, GAMEPLAY_MUSIC_DROP_MS } from '../common/music-manager';
import { typewrite } from '../common/typewriter';

// ---------------------------------------------------------------------------
// CINEMATIC TIMING (CONTEXT.md D-10) — tune by ear, do not hunt for these in
// the body of the file. All values in ms.
// ---------------------------------------------------------------------------
const T_MAP_NAME_MS     = 1500;
// The map name TYPES over this sub-window, then holds the fully-revealed word for the
// remainder of T_MAP_NAME_MS before Beat 2 (preview) starts. Without the hold the last
// letter landed exactly as the next beat began, so the word read as "cut off". Keep this
// < T_MAP_NAME_MS; the difference (≈600ms) is the readable hold. T_MAP_NAME_MS stays the
// SLOT length so every downstream beat offset is unchanged.
const T_MAP_NAME_REVEAL_MS = 900;
const T_PREVIEW_FADE_MS = 1000;
const T_MAP_INFO_MS     = 2000;
const T_GAP_MS          = 500;
const T_TIP_CARD_MS     = 2500;
const T_FADE_OUT_MS     = 500;
// Total cinematic budget = 8000ms. Adjust freely.
const T_CINEMATIC_TOTAL_MS =
  T_MAP_NAME_MS + T_PREVIEW_FADE_MS + T_MAP_INFO_MS + T_GAP_MS + T_TIP_CARD_MS + T_FADE_OUT_MS;

// COUNTDOWN-state total (zoom-in + 3-2-1-FIGHT! — Phase 8). Used only to
// compute the gameplay-music start delay (D-14): we want the music DROP to
// land at COUNTDOWN-end. Math:
//   gameplay_play_at = (T_CINEMATIC_TOTAL_MS + COUNTDOWN_TOTAL_MS) - GAMEPLAY_MUSIC_DROP_MS
// e.g. 8000 + 3500 - 4000 = 7500ms after LoadingScene.create() fires.
const COUNTDOWN_TOTAL_MS = 3500;

// Phase 7 sync-barrier — minimum LoadingScene display time. The cinematic
// length implicitly exceeds this; kept for safety floor + background-tab
// throttle resilience (anchored to ack-send, not scene-create).
const MIN_DISPLAY_MS = 1500;

const BMFONT_KEY = 'press_start_2p';

// Tints per UI-SPEC §Typography.
const TINT_DISPLAY = 0xffffff;
const TINT_HEADING = 0xe8d9a8;
const TINT_BODY    = 0xffffff;
const TINT_MUTED   = 0xb8b8b8;

// Tip card surface (UI-SPEC §Color).
const TIP_BG     = 0x0a0a0f;
const TIP_BG_A   = 0.85;
const TIP_BORDER = 0x2a2a35;

// Fallback tips when /content/loading-tips.txt is missing/empty (D-12).
const FALLBACK_TIPS: readonly string[] = [
  "Mages don't blink. They strategize.",
  'Tip: spells deal more damage when aimed.',
  'Combo: WindBolt + ThunderStrike for the airborne finish.',
];

// Module-scoped tip cache — fetched once per page load (D-12).
let cachedTips: string[] | null = null;
async function loadTips(): Promise<string[]> {
  if (cachedTips) return cachedTips;
  try {
    const res = await fetch('/content/loading-tips.txt');
    if (!res.ok) throw new Error(`status ${res.status}`);
    const text = await res.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    cachedTips = lines.length > 0 ? lines : [...FALLBACK_TIPS];
  } catch {
    cachedTips = [...FALLBACK_TIPS];
  }
  return cachedTips;
}

type LoadingSceneData = { matchConfig: MatchConfig };

/**
 * Pre-match cinematic LoadingScene (Phase 7 + Phase 9.2 plan 04).
 *
 * Runs an ~8s cinematic (map name typewriter → preview fade-in → map info
 * typewriter → tip card → fade out) in parallel with the Phase 7 sync barrier
 * (match:loaded ack + COUNTDOWN broadcast wait). The cinematic does NOT trigger
 * the scene transition — #scheduleTransition still owns that. Cinematic length
 * is the effective MIN_DISPLAY floor in practice.
 *
 * Also kicks off gameplay music with a computed delay so GAMEPLAY_MUSIC_DROP_MS
 * lands at COUNTDOWN-end (D-14).
 */
export class LoadingScene extends Phaser.Scene {
  #matchConfig!: MatchConfig;
  #ackSent = false;
  #ackSentAt = -1;
  #pendingTransition = false;
  #createdAt = -1;

  constructor() {
    super({ key: SCENE_KEYS.LOADING_SCENE });
  }

  init(data: LoadingSceneData): void {
    this.#matchConfig = data.matchConfig;
    this.#ackSent = false;
    this.#ackSentAt = -1;
    this.#pendingTransition = false;
  }

  create(): void {
    this.#createdAt = this.time.now;
    this.cameras.main.setBackgroundColor(0x000000);
    this.cameras.main.fadeIn(300, 0, 0, 0);

    // Build cinematic UI (all elements start invisible; beats reveal them).
    this.#buildCinematic();

    // Phase 7 sync barrier — kept verbatim.
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, this.#onMatchStateChanged, this);
    this.time.delayedCall(0, () => this.#sendLoadedAck());

    // Schedule gameplay music start so its DROP aligns with COUNTDOWN-end (D-14).
    const playGameplayAtMs = Math.max(
      0,
      T_CINEMATIC_TOTAL_MS + COUNTDOWN_TOTAL_MS - GAMEPLAY_MUSIC_DROP_MS,
    );
    this.time.delayedCall(playGameplayAtMs, () => {
      MusicManager.instance.playGameplay(this);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, this.#onMatchStateChanged, this);
    });
  }

  #buildCinematic(): void {
    const cx = this.cameras.main.centerX;
    const h = this.cameras.main.height;

    // Resolve map metadata from MatchConfig.config.mapId.
    const mapId = this.#matchConfig.config?.mapId ?? 'WORLD';
    const mapEntry = MAP_POOL.find(m => m.id === mapId) ?? MAP_POOL[0];
    const mapName = mapEntry.displayName.toUpperCase();

    // --- Beat 1: Map name typewriter (y = h*0.20) ---
    const nameText = this.add
      .bitmapText(cx, Math.round(h * 0.20), BMFONT_KEY, '', 32)
      .setOrigin(0.5)
      .setTint(TINT_DISPLAY);
    // Type over T_MAP_NAME_REVEAL_MS (not the whole slot) so the finished word holds visibly
    // for the remainder of T_MAP_NAME_MS before the preview beat begins.
    typewrite(this, nameText, mapName, T_MAP_NAME_REVEAL_MS);

    // --- Beat 2: Map preview fade-in (y = h*0.40, scale ×4) ---
    // Thumbnail texture key from MAP_POOL entry. Plan 05 replaces the placeholder PNG.
    const preview = this.add
      .image(cx, Math.round(h * 0.40), mapEntry.thumbnailKey)
      .setOrigin(0.5)
      .setScale(4)
      .setAlpha(0);
    this.time.delayedCall(T_MAP_NAME_MS, () => {
      this.tweens.add({ targets: preview, alpha: 1, duration: T_PREVIEW_FADE_MS, ease: 'Quad.Out' });
    });

    // --- Beat 3: Map info typewriter (2 lines, y = h*0.65, lineHeight 1.5) ---
    const infoStartT = T_MAP_NAME_MS + T_PREVIEW_FADE_MS; // t=2500
    // BLOCKER 1 fix: 2 lines, not 3. MODE conveys the format ("2v2"); the prior
    // `FORMAT: {format.id}` row mapped to a non-existent field. Removing the
    // duplicate-of-MODE row. T_MAP_INFO_MS stays at 2000ms; cadence is slightly
    // slower (more readable).
    const format = this.#matchConfig.mode || 'TEAM';
    const playerCount = this.#matchConfig.players.length;
    const lines: { copy: string; tint: number }[] = [
      { copy: `MODE: ${format.toUpperCase()}`, tint: TINT_HEADING },
      { copy: `PLAYERS: ${playerCount}`,        tint: TINT_BODY },
    ];
    const infoBaseY = Math.round(h * 0.65);
    const lineHeight = Math.round(16 * 1.5); // 24px (UI-SPEC §Typography line-height 1.5 at 16px)
    // Distribute the 2000ms window across 2 lines: ~1000ms each.
    const perLineMs = Math.floor(T_MAP_INFO_MS / lines.length);
    lines.forEach((ln, i) => {
      const txt = this.add
        .bitmapText(cx, infoBaseY + i * lineHeight, BMFONT_KEY, '', 16)
        .setOrigin(0.5)
        .setTint(ln.tint);
      this.time.delayedCall(infoStartT + i * perLineMs, () => typewrite(this, txt, ln.copy, perLineMs));
    });

    // --- Beat 4: Tip card enter (y = h*0.85, width min(w-64, 480), pad 16) ---
    const tipEnterT = infoStartT + T_MAP_INFO_MS + T_GAP_MS; // t=5000
    const w = this.cameras.main.width;
    const cardW = Math.min(w - 64, 480);
    const cardH = 56;
    const tipY = Math.round(h * 0.85);
    const cardBg = this.add
      .rectangle(cx, tipY + 16, cardW, cardH, TIP_BG, TIP_BG_A)
      .setOrigin(0.5)
      .setStrokeStyle(1, TIP_BORDER, 1)
      .setAlpha(0);
    const tipHeading = this.add
      .bitmapText(cx, tipY + 16 - cardH / 2 + 12, BMFONT_KEY, 'TIP', 16)
      .setOrigin(0.5)
      .setTint(TINT_HEADING)
      .setAlpha(0);
    const tipBody = this.add
      .bitmapText(cx, tipY + 16 + 6, BMFONT_KEY, '...', 8)
      .setOrigin(0.5)
      .setTint(TINT_MUTED)
      .setAlpha(0);
    tipBody.setMaxWidth(cardW - 32);

    loadTips().then(tips => {
      if (!this.scene.isActive(SCENE_KEYS.LOADING_SCENE)) return;
      tipBody.setText(tips[Math.floor(Math.random() * tips.length)]);
    });

    this.time.delayedCall(tipEnterT, () => {
      this.tweens.add({
        targets: [cardBg, tipHeading, tipBody],
        alpha: { from: 0, to: 1 },
        y: '-=16',
        duration: 200,
        ease: 'Quad.Out',
      });
    });

    // --- Beat 5: Fade out → handoff to PreloadScene/GameScene ---
    // We DO NOT call scene.start here. Phase 7's #scheduleTransition still
    // owns that — once the server's COUNTDOWN broadcast arrives AND the ack
    // MIN_DISPLAY_MS floor passes, the transition fires. The camera fade is
    // visual polish; it's reset by PreloadScene.create().
    this.time.delayedCall(tipEnterT + T_TIP_CARD_MS, () => {
      this.cameras.main.fadeOut(T_FADE_OUT_MS, 0, 0, 0);
    });
  }

  #sendLoadedAck(): void {
    if (this.#ackSent) return;
    this.#ackSent = true;
    this.#ackSentAt = this.time.now;
    NetworkManager.getInstance().sendMatchLoaded(this.#matchConfig.lobbyId);
    if (this.#pendingTransition) this.#scheduleTransition();
  }

  #onMatchStateChanged = (payload: MatchStateChangedPayload): void => {
    if (payload.lobbyId !== this.#matchConfig.lobbyId) return;
    if (payload.state !== 'COUNTDOWN' && payload.state !== 'ACTIVE') return;
    if (this.#pendingTransition) return;
    this.#pendingTransition = true;
    this.#scheduleTransition();
  };

  #scheduleTransition(): void {
    if (this.#ackSentAt < 0) return;
    const elapsed = this.time.now - this.#ackSentAt;
    // Floor = max(MIN_DISPLAY_MS, remaining cinematic time). The cinematic
    // length is the effective floor in practice (8000ms >> 1500ms).
    const cinematicElapsed = this.time.now - this.#createdAt;
    const remainingCinematic = Math.max(0, T_CINEMATIC_TOTAL_MS - cinematicElapsed);
    const remainingMin = Math.max(0, MIN_DISPLAY_MS - elapsed);
    const wait = Math.max(remainingCinematic, remainingMin);
    this.time.delayedCall(wait, () => {
      this.scene.stop(SCENE_KEYS.LOADING_SCENE);
      // Forward matchConfig so PreloadScene can map mapId → DataManager.currentArea
      // before booting GameScene. Without this, the lobby's map selection would
      // never reach the actual level loader.
      this.scene.start(SCENE_KEYS.PRELOAD_SCENE, { matchConfig: this.#matchConfig });
    });
  }
}
