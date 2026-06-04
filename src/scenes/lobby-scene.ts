import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys.js';
import { NetworkManager } from '../networking/network-manager.js';
import { EVENT_BUS, CUSTOM_EVENTS } from '../common/event-bus.js';
import type { Lobby, LobbyConfig, LobbyFormat, MatchConfig, PlayerInfo } from '../networking/types.js';
import { MAP_POOL } from '../networking/types.js';
import { ASSET_KEYS } from '../common/assets.js';
import { LOBBY_VOLUME, MusicManager } from '../common/music-manager';
import { SKIP_TO_LOBBY, resolveConnection } from '../common/config';

// BitmapText replaces Phaser.GameObjects.Text. Press_Start_2P TTF was
// pre-rasterized via Snowb into Press_Start-2.png + Press_Start-2.fnt
// so glyphs draw as nearest-neighbor sprites instead of canvas2d AA text.
const BMFONT_KEY = 'press_start_2p';
type BMStyle = { size: number; tint: number };
// Atlas is rendered at native 8px — render at 8 (1:1) or 16 (2:1) for
// crisp pixel-grid output. Non-multiples of 8 cause fractional glyph
// scaling and blur, so FONT (was 10) snaps to 8 and FONT_TITLE (was 14)
// snaps to 16.
const FONT: BMStyle = { size: 8, tint: 0xffffff };
const FONT_TITLE: BMStyle = { size: 16, tint: 0xffdd55 };
const FONT_SMALL: BMStyle = { size: 8, tint: 0xcccccc };
const FONT_SMALL_WHITE: BMStyle = { size: 8, tint: 0xffffff };
const BTN_COLOR = 0x3355aa;
const BTN_HOVER = 0x4477cc;
const BTN_DISABLED = 0x223366;

// ---------------------------------------------------------------------------
// Gatekeeper NPC dialogue
// ---------------------------------------------------------------------------
// The connect view is driven by a small data-only dialogue script. Each beat
// either prints a line (`say`), pauses for player input (`input`), or fires
// the network connect (`connect`). Faces map 1:1 to the 8 portrait frames
// in the NPC sprite sheet (4×2 grid, frame indices 0..7).
//
// Writing/face choice can be tweaked freely here without touching scene logic.
// Notes on copy: the Press_Start_2P bitmap atlas is ASCII-only, but dialogue
// lines render through canvas Text (TTF), which DOES support accents — so
// PT-BR diacritics are fine inside DIALOGUE_BEATS strings.
// ---------------------------------------------------------------------------
const enum MageFace {
  NEUTRAL = 0,
  SMILE = 1,
  LAUGH = 2,
  THINKING = 3,
  SURPRISED = 4,
  STRICT = 5,
  EXPLAINING = 6,
  MYSTICAL = 7,
}

type SayBeat = { kind: 'say'; face: MageFace; text: string };
type InputBeat = { kind: 'input'; face: MageFace; text: string; field: 'nick' | 'ip'; default: string };
type ConnectBeat = { kind: 'connect' };
type DialogueBeat = SayBeat | InputBeat | ConnectBeat;

const DIALOGUE_BEATS: DialogueBeat[] = [
  { kind: 'say', face: MageFace.NEUTRAL, text: 'Ah... mais um mago se apresenta diante da arena.' },
  { kind: 'say', face: MageFace.SMILE, text: 'Voce veio reivindicar a Pedra Mistica, nao foi?' },
  { kind: 'say', face: MageFace.STRICT, text: 'Antes de atravessar, precisarei de algumas informacoes.' },
  { kind: 'input', face: MageFace.NEUTRAL, text: 'Primeiro: como te invocam, mago?', field: 'nick', default: 'Player' },
  // Default reaction to a nickname. Replaced by NICKNAME_EASTER_EGGS when one
  // of the entries matches (case- and accent-insensitive, see #findNickEasterEgg).
  { kind: 'say', face: MageFace.SMILE, text: 'Otimo. Anotado em meu pergaminho.' },
  {
    kind: 'say',
    face: MageFace.EXPLAINING,
    text: 'Agora, a parte mais importante. Eu preciso da Runa do Portal do seu cla.',
  },
  {
    kind: 'say',
    face: MageFace.EXPLAINING,
    text: 'Os anciaos a inscrevem em uma forma estranha, algo como "192.168.1.10". Ou apenas "localhost", se voce mesmo for o anfitriao do ritual.',
  },
  { kind: 'input', face: MageFace.THINKING, text: 'Qual e a sua Runa?', field: 'ip', default: 'localhost' },
  { kind: 'say', face: MageFace.MYSTICAL, text: 'Muito bem. Que os ventos te guiem ate a arena, mago.' },
  { kind: 'connect' },
];

// ---------------------------------------------------------------------------
// Nickname easter eggs
// ---------------------------------------------------------------------------
// When the player types one of the `match` strings as their nickname, the
// gatekeeper reacts with `lines` instead of the default "Otimo. Anotado..."
// beat. After the reaction, the flow continues normally with the IP prompt.
//
// Matching rules (see #normalizeNickname):
//   • case-insensitive ("Davi", "DAVI", "davi" all match the same entry)
//   • accents/diacritics folded ("joão" matches "joao")
//   • whitespace trimmed
//   • exact-string match only (not a substring) — so "caio_xX" won't trigger
//     "caio"; add the variant explicitly if you want it to.
//
// The first entry whose `match` list contains the normalized nickname wins,
// so put more specific entries (e.g. ["davi silva"]) above more generic
// ones (e.g. ["davi"]).
// ---------------------------------------------------------------------------
type NickEasterEgg = {
  match: string[];
  lines: { face: MageFace; text: string }[];
};

const NICKNAME_EASTER_EGGS: NickEasterEgg[] = [
  {
    match: ['gustavo', 'guga', 'gugs', 'gugames', 'games'],
    lines: [
      { face: MageFace.THINKING, text: 'Ha... tive um aluno que se chamava assim...' },
      { face: MageFace.SMILE, text: 'Aprovava os rituais dos colegas com entusiasmo genuino.' },
      {
        face: MageFace.LAUGH,
        text: 'O problema e que metade deles explodia logo depois. Ele nunca entendia muito bem por que.',
      },
    ],
  },
  {
    match: ['caio'],
    lines: [
      { face: MageFace.THINKING, text: 'Caio... curioso.' },
      {
        face: MageFace.EXPLAINING,
        text: 'Tive um aluno assim. Talentoso, mas com uma relacao complicada com artefatos de invocacao a distancia.',
      },
      {
        face: MageFace.LAUGH,
        text: 'Certa vez, um cristal de conjuracao remota comecou a drenar ouro da bolsa dele sozinho. Nunca descobrimos como.',
      },
    ],
  },
  {
    match: ['davi', 'dave', 'david'],
    lines: [
      { face: MageFace.SURPRISED, text: 'Davi...' },
      {
        face: MageFace.SMILE,
        text: 'Esse nome me traz memorias. Um aluno que, quando todos recuaram diante dos Tomos da Configuracao Arcana...',
      },
      {
        face: MageFace.MYSTICAL,
        text: 'Simplesmente os pegou e os carregou nas costas. Sem reclamar. Chegou junto comigo ate o fim.',
      },
    ],
  },
  {
    match: ['nicolas', 'nico'],
    lines: [
      { face: MageFace.THINKING, text: 'Nicolas... ah.' },
      { face: MageFace.SMILE, text: 'Tinha um aluno com esse nome que consultava o Oraculo para absolutamente tudo.' },
      {
        face: MageFace.LAUGH,
        text: 'Ate para saber se estava com fome. Dizia que o Oraculo era infaivel. O Oraculo, convenhamos, as vezes inventava respostas.',
      },
    ],
  },
  {
    match: ['jesse', 'jessee'],
    lines: [
      { face: MageFace.SMILE, text: 'Jesse. Um aluno fiel as antigas escrituras.' },
      {
        face: MageFace.EXPLAINING,
        text: 'Enquanto todos adotavam novos encantamentos, ele insistia nos feiticos classicos. Verbosos. Com invocacao completa.',
      },
      { face: MageFace.LAUGH, text: 'Funcionava. Demorava. Mas funcionava.' },
    ],
  },
  {
    match: ['arthur', 'artur', 'art'],
    lines: [
      { face: MageFace.THINKING, text: 'Arthur...' },
      {
        face: MageFace.SMILE,
        text: 'Tive um aluno com esse nome que sabia exatamente onde cada maldicao estava escondida na masmorra.',
      },
      {
        face: MageFace.MYSTICAL,
        text: 'Quando algo quebrava, ele ja estava la antes de alguem perceber. O tipo raro de mago que entende o feiticio por dentro.',
      },
    ],
  },
  {
    match: ['ederson'],
    lines: [
      { face: MageFace.SURPRISED, text: 'Ederson...' },
      { face: MageFace.LAUGH, text: 'Também me chamo assim! Só não vem me dizer que teu apelido também é Boi...' },
    ],
  },
  {
    match: ['boi'],
    lines: [
      { face: MageFace.LAUGH, text: 'Boi?' },
      { face: MageFace.SMILE, text: 'Eu tambem atendo por esse nome. Boa!' },
    ],
  },

  // ── Genéricos charmosos ──────────────────────────────────────────────────
  {
    match: ['joao', 'joão'],
    lines: [
      { face: MageFace.SMILE, text: 'Joao. Um dos nomes mais antigos do grimorio.' },
      {
        face: MageFace.NEUTRAL,
        text: 'Aventureiros assim costumam ser dificeis de surpreender. Vamos ver se o portal consegue.',
      },
    ],
  },
  {
    match: ['pedro'],
    lines: [
      { face: MageFace.NEUTRAL, text: 'Pedro. Nome solido. Como uma pedra, curiosamente.' },
      { face: MageFace.SMILE, text: 'Os melhores aventureiros que conheci nao precisavam de um nome chamativo.' },
    ],
  },
  {
    match: ['ana', 'anna'],
    lines: [
      { face: MageFace.SMILE, text: 'Ana. Curto, direto, sem enfeites.' },
      { face: MageFace.MYSTICAL, text: 'Ha algo poderoso em nomes assim. Nao desperdicam nem uma silaba.' },
    ],
  },
  {
    match: ['maria'],
    lines: [
      { face: MageFace.EXPLAINING, text: 'Maria. Tive dezenas de alunas com esse nome ao longo dos anos.' },
      {
        face: MageFace.SMILE,
        text: 'Curiosamente, todas muito mais organizadas que os demais. Coincidencia, certamente.',
      },
    ],
  },

  // ── Palavrões ────────────────────────────────────────────────────────────
  {
    match: ['cu', 'pinto', 'pau', 'merda', 'porra', 'caralho', 'foda', 'fdp', 'corno'],
    lines: [
      { face: MageFace.STRICT, text: 'O grimorio registrou esse nome sem nem piscar.' },
      { face: MageFace.NEUTRAL, text: 'Nao e a primeira vez que alguem tenta cruzar o portal assim.' },
      { face: MageFace.SMILE, text: 'Pode entrar. Ja vi coisa pior em revisao de ritual.' },
    ],
  },
];
// ---------------------------------------------------------------------------
// LOBBY_TUNING — live-editable layout knobs for the connect dialogue
// ---------------------------------------------------------------------------
// All visual offsets for the gatekeeper scene live here so they can be poked
// at runtime via the lobby debug panel (Tab while the connect view is active).
// When you find values you like, paste this object back into the file to
// make them permanent.
//
// Coordinate space: canvas is 480×320. Origins are top-left for the dialogue
// box and center-anchored for the portrait. Source frames in the NPC sheet
// are 443×443 px (4×2 grid of an ~1774×887 PNG); FRAME_CROP shrinks each
// frame's drawn rect inward to hide the inter-frame padding that the PNG
// generator left between faces.
// ---------------------------------------------------------------------------
export const LOBBY_TUNING = {
  // Title bar at top of canvas
  TITLE_Y: 24,

  // NPC portrait (center-anchored)
  PORTRAIT_X: 61,
  PORTRAIT_Y: 258,
  PORTRAIT_SIZE_PX: 98,
  FRAME_CROP_INSET_PX: 23, // how many source-pixels to crop inward on each side of every face frame (kills padding between sprites)

  // Background-removal threshold. With the flood-fill + feathered alpha pass
  // in #processPortraitSheet, pixels near pure white that are reachable from
  // the frame edges get killed; interior whites (skin highlights, hat shine,
  // glasses reflection) are preserved even when they're bright.
  WHITE_KEY_THRESHOLD: 97,

  // Dialogue box (top-left anchored)
  BOX_X: 118,
  BOX_Y: 212,
  BOX_W: 356,
  BOX_H: 95,
  BOX_TEXT_PAD: 19,

  // Inline input — independent X / Y so it can sit anywhere on the canvas,
  // not just inside the dialogue box. (X, Y) is the input's center.
  INPUT_X: 127,
  INPUT_Y: 174,
  INPUT_WIDTH_NICK_PX: 212,
  INPUT_WIDTH_IP_PX: 164,

  // Hint label below the input ("ENTER PARA CONFIRMAR") — independent X / Y.
  HINT_X: 292,
  HINT_Y: 263,

  // Advance prompt position inside the box
  PROMPT_OFFSET_X: 12, // from box right edge
  PROMPT_OFFSET_Y: 4, // from box bottom edge

  // Error/status line
  ERROR_OFFSET_BELOW_BOX: 17,

  // Auto-center every face on its detected bounding box so all 8 frames render
  // at the same on-screen point. Without this, faces that the source artist
  // framed differently (e.g. frame 8's wider mystical aura) shift around when
  // the portrait swaps between beats. 1 = on, 0 = off (use raw cell crop).
  AUTO_CENTER_FACES: 1,
  // Pad the auto-centered crop so the face isn't flush with the frame edge.
  // Measured in source-pixels, applied symmetrically around each detected bbox.
  AUTO_CENTER_PAD_PX: 0,
};

type ViewObjects = Phaser.GameObjects.GameObject[];

export class LobbyScene extends Phaser.Scene {
  #playerName: string = 'Player';
  #localSocketId: string = '';
  #viewObjects: ViewObjects = [];
  #statusText!: Phaser.GameObjects.BitmapText;
  #configBlockObjects: Phaser.GameObjects.GameObject[] = [];
  #capacityHeader: Phaser.GameObjects.BitmapText | null = null;

  constructor() {
    super({ key: SCENE_KEYS.LOBBY_SCENE });
  }

  public preload(): void {
    // Game boots straight into LobbyScene (main.ts), so PreloadScene's loads
    // are not available yet when map cards first render. Load the two map
    // thumbnails here so `this.textures.exists(...)` is true by create() time
    // and the blue fallback rectangle never shows.
    this.load.image(ASSET_KEYS.MAP_THUMB_WORLD, 'assets/levels/world/thumbnail.png');
    this.load.image(ASSET_KEYS.MAP_THUMB_DUNGEON_1, 'assets/levels/dungeon-1/thumbnail.png');
    this.load.image(ASSET_KEYS.MAP_THUMB_STAGES, 'assets/stages/thumbnail.png');
    this.load.bitmapFont(
      BMFONT_KEY,
      'assets/fonts/Press_Start_2P/press_start_white-2.png',
      'assets/fonts/Press_Start_2P/press_start_white-2.xml',
    );
    // Gatekeeper NPC portrait sheet — 4×2 grid of mage faces.
    // Source PNG is 1774×887 RGB (no alpha) with a solid-white background.
    // We load it as a plain image, then post-process via canvas to:
    //   1. Strip white pixels (color-key based on LOBBY_TUNING.WHITE_KEY_THRESHOLD)
    //   2. Re-pack as 8 frames in an internal sheet, with optional inset crop
    //      (LOBBY_TUNING.FRAME_CROP_INSET_PX) to kill the padding the asset
    //      generator left between faces.
    // The final processed texture is registered under NPC_MAGE_PORTRAITS as a
    // spritesheet with 8 frames (0..7) matching the MageFace enum.
    this.load.image('NPC_MAGE_PORTRAITS_RAW', 'assets/images/npc/bois-magicos.png');
    this.load.once('complete', () => this.#processPortraitSheet());
  }

  // Final per-frame size of the processed portrait sheet. Set by
  // #processPortraitSheet, read by every place that needs to scale the
  // displayed portrait (PORTRAIT_SIZE_PX / #processedFrameSize = scale).
  #processedFrameSize = 1;

  // Build the in-memory spritesheet from the raw PNG. Called on Loader COMPLETE
  // in preload(), and again whenever the debug panel changes WHITE_KEY_THRESHOLD,
  // FRAME_CROP_INSET_PX, AUTO_CENTER_FACES, or AUTO_CENTER_PAD_PX.
  //
  // Pipeline:
  //   1. Sample each of the 8 source cells (4×2 grid) into a packed strip.
  //   2. Per-frame flood-fill near-white pixels from the edges → transparent.
  //   3. Feather the alpha boundary one pixel deep to soften jagged edges.
  //   4. If AUTO_CENTER_FACES: scan each frame's opaque bbox, then re-pack
  //      into a uniformly-sized output strip with each face centered.
  //      This is what fixes "face shifts when the portrait swaps" — the
  //      source artist framed each face within different margins, so cropping
  //      by a constant inset leaves heads at different positions inside the
  //      crop. Centering on the bbox kills that.
  #processPortraitSheet(): void {
    const rawKey = 'NPC_MAGE_PORTRAITS_RAW';
    if (!this.textures.exists(rawKey)) return;

    const src = this.textures.get(rawKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const srcW = src.width;
    const srcH = src.height;

    const cellW = srcW / 4;
    const cellH = srcH / 2;
    const inset = Math.max(0, LOBBY_TUNING.FRAME_CROP_INSET_PX);
    const frameW = Math.floor(cellW - inset * 2);
    const frameH = Math.floor(cellH - inset * 2);

    // Stage A canvas: 8 cropped cells laid side-by-side.
    const outCanvas = document.createElement('canvas');
    outCanvas.width = frameW * 8;
    outCanvas.height = frameH;
    const outCtx = outCanvas.getContext('2d')!;
    outCtx.imageSmoothingEnabled = false;

    for (let i = 0; i < 8; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const sx = Math.round(col * cellW + inset);
      const sy = Math.round(row * cellH + inset);
      outCtx.drawImage(src as CanvasImageSource, sx, sy, frameW, frameH, i * frameW, 0, frameW, frameH);
    }

    // Background removal — per frame, flood-fill from the four corners through
    // "background-ish" pixels (RGB all >= threshold). Only pixels REACHED by
    // the fill become transparent. Interior bright spots (hat shine, glasses
    // reflection, skin highlights) survive even when they're as bright as the
    // background, because the fill can't get to them without first crossing
    // a darker edge pixel.
    //
    // After the fill, a single-pass edge feather softens the alpha boundary:
    // every still-opaque pixel that touches a transparent neighbor has its
    // alpha reduced based on how many transparent neighbors it has. That
    // kills the jagged "stair-step" look on the cropped white edge.
    const thresh = LOBBY_TUNING.WHITE_KEY_THRESHOLD;
    if (thresh > 0) {
      const imgData = outCtx.getImageData(0, 0, outCanvas.width, outCanvas.height);
      const d = imgData.data;
      const W = outCanvas.width;
      const H = outCanvas.height;

      // Flood-fill per frame so a leak through the cropped edge of frame A
      // can't bleed into frame B (they're packed side-by-side on outCanvas).
      const isBg = (idx: number) => d[idx] >= thresh && d[idx + 1] >= thresh && d[idx + 2] >= thresh;

      for (let fi = 0; fi < 8; fi++) {
        const fx0 = fi * frameW;
        const fx1 = fx0 + frameW;
        const fy0 = 0;
        const fy1 = frameH;

        // Seed from all four edges of this frame, not just the corners — handles
        // faces where the background touches an edge but not a corner.
        const stack: number[] = [];
        const push = (x: number, y: number) => {
          if (x < fx0 || x >= fx1 || y < fy0 || y >= fy1) return;
          const idx = (y * W + x) * 4;
          if (d[idx + 3] === 0) return; // already cleared
          if (!isBg(idx)) return;
          d[idx + 3] = 0; // mark cleared in-place
          stack.push(x, y);
        };
        for (let x = fx0; x < fx1; x++) {
          push(x, fy0);
          push(x, fy1 - 1);
        }
        for (let y = fy0; y < fy1; y++) {
          push(fx0, y);
          push(fx1 - 1, y);
        }
        while (stack.length) {
          const y = stack.pop()!;
          const x = stack.pop()!;
          push(x + 1, y);
          push(x - 1, y);
          push(x, y + 1);
          push(x, y - 1);
        }
      }

      // Edge feather: for every opaque pixel, count transparent 4-neighbors
      // and dim alpha accordingly. 1 neighbor → 192/255, 2 → 128/255, 3 → 64/255.
      // Operate on a snapshot of the alpha channel so a feathered pixel doesn't
      // bias its later-visited neighbor's count.
      const alphaSnapshot = new Uint8Array(W * H);
      for (let p = 0, q = 0; p < d.length; p += 4, q++) alphaSnapshot[q] = d[p + 3];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const q = y * W + x;
          if (alphaSnapshot[q] === 0) continue;
          let transparentNeighbors = 0;
          if (x > 0 && alphaSnapshot[q - 1] === 0) transparentNeighbors++;
          if (x < W - 1 && alphaSnapshot[q + 1] === 0) transparentNeighbors++;
          if (y > 0 && alphaSnapshot[q - W] === 0) transparentNeighbors++;
          if (y < H - 1 && alphaSnapshot[q + W] === 0) transparentNeighbors++;
          if (transparentNeighbors === 0) continue;
          const newAlpha = transparentNeighbors >= 3 ? 64 : transparentNeighbors === 2 ? 128 : 192;
          d[q * 4 + 3] = newAlpha;
        }
      }

      outCtx.putImageData(imgData, 0, 0);
    }

    // Stage B: auto-center each face on its own bbox so they all land at the
    // same on-screen point regardless of how the source artist framed them.
    let finalCanvas: HTMLCanvasElement = outCanvas;
    let finalFrameSize = frameW;

    if (LOBBY_TUNING.AUTO_CENTER_FACES) {
      const W = outCanvas.width;
      const H = outCanvas.height;
      const imgData2 = outCtx.getImageData(0, 0, W, H);
      const a = imgData2.data;

      // Per-frame bbox of pixels with alpha > some small threshold. Treat the
      // feathered edge (<32 alpha) as background so a stray feathered pixel
      // doesn't expand the bbox.
      const ALPHA_THRESH = 32;
      const bboxes: { x: number; y: number; w: number; h: number }[] = [];
      let maxDim = 1;

      for (let fi = 0; fi < 8; fi++) {
        const fx0 = fi * frameW;
        const fx1 = fx0 + frameW;
        let minX = fx1,
          minY = frameH,
          maxX = fx0 - 1,
          maxY = -1;
        for (let y = 0; y < frameH; y++) {
          for (let x = fx0; x < fx1; x++) {
            const alpha = a[(y * W + x) * 4 + 3];
            if (alpha < ALPHA_THRESH) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        // Empty frame (e.g. fully cleared by an over-aggressive threshold) —
        // fall back to the full cell so we don't crash.
        if (maxX < 0) {
          bboxes.push({ x: fx0, y: 0, w: frameW, h: frameH });
          if (frameW > maxDim) maxDim = frameW;
          if (frameH > maxDim) maxDim = frameH;
          continue;
        }
        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        bboxes.push({ x: minX, y: minY, w: bw, h: bh });
        if (bw > maxDim) maxDim = bw;
        if (bh > maxDim) maxDim = bh;
      }

      // Unified output cell size: largest face dimension + symmetric padding.
      const pad = Math.max(0, LOBBY_TUNING.AUTO_CENTER_PAD_PX);
      const S = maxDim + pad * 2;
      const centered = document.createElement('canvas');
      centered.width = S * 8;
      centered.height = S;
      const cctx = centered.getContext('2d')!;
      cctx.imageSmoothingEnabled = false;

      for (let fi = 0; fi < 8; fi++) {
        const bb = bboxes[fi];
        const dx = fi * S + Math.floor((S - bb.w) / 2);
        const dy = Math.floor((S - bb.h) / 2);
        cctx.drawImage(outCanvas, bb.x, bb.y, bb.w, bb.h, dx, dy, bb.w, bb.h);
      }

      finalCanvas = centered;
      finalFrameSize = S;
    }

    this.#processedFrameSize = finalFrameSize;

    // Replace any existing processed texture so re-runs from the debug panel
    // pick up the new pixels. The runtime sprites reference the texture key,
    // so removing+re-adding flushes the GPU upload too.
    const outKey = ASSET_KEYS.NPC_MAGE_PORTRAITS;
    if (this.textures.exists(outKey)) {
      this.textures.remove(outKey);
    }
    this.textures.addSpriteSheet(outKey, finalCanvas as unknown as HTMLImageElement, {
      frameWidth: finalFrameSize,
      frameHeight: finalFrameSize,
    });

    // Update any currently-visible portrait so the debug panel re-process
    // shows changes without a full view-rebuild.
    if (this.#portrait && this.#portrait.scene) {
      const currentFrame = this.#portrait.frame.name;
      this.#portrait.setTexture(outKey, currentFrame);
      this.#portrait.setScale(LOBBY_TUNING.PORTRAIT_SIZE_PX / finalFrameSize);
    }
  }

  public create(): void {
    // Dev flag SKIP_TO_LOBBY: bypass the connect dialogue (name + "localhost" rune) and
    // auto-connect with defaults straight to the lobby list. Otherwise show the dialogue.
    if (SKIP_TO_LOBBY) {
      this.#skipToLobbyConnect();
    } else {
      this.#showConnectView();
    }

    // Switch from intro music (teste.mp3) to the standard menu loop, faded
    // directly to the ducked LOBBY_VOLUME (0.03) so we don't have a tween →
    // hard-set conflict with the prior setMenuVolume call below. No-op if
    // menu music is already the active track (back-nav, fresh boot via a
    // sub-scene that already swapped).
    MusicManager.instance.playMenu(this, { volume: LOBBY_VOLUME });

    // D-13: ensure the ducked level is applied even on the no-op fast path
    // (when menu music is already playing and playMenu skipped the fade).
    MusicManager.instance.setMenuVolume(LOBBY_VOLUME);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_CONNECTED, this.#onConnected, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onLobbyUpdated, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_STARTED, this.#onLobbyStarted, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_DISCONNECTED, this.#onDisconnected, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_DISCONNECTED, this.#onDialogueConnectFail, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_DISCONNECTED, this.#onSkipConnectFail, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onWaitingRoomUpdate, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_HOST_CHANGED, this.#onHostChanged, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_ERROR, this.#onLobbyError, this);
      if (this.#dialogueKeyHandler) {
        this.input.keyboard?.off('keydown', this.#dialogueKeyHandler);
        this.#dialogueKeyHandler = null;
      }
      if (this.#dialoguePointerHandler) {
        this.input.off('pointerdown', this.#dialoguePointerHandler);
        this.#dialoguePointerHandler = null;
      }
      if (this.#dialogueTypeTimer) {
        this.#dialogueTypeTimer.remove();
        this.#dialogueTypeTimer = null;
      }
      this.#currentLobby = null;
      this.#clearView();
    });
  }

  // --- View A: Connect Dialogue ---
  // The connect view is an Undertale-style NPC conversation: the gatekeeper
  // mage (8-face portrait) speaks each beat with a typewriter, and "input"
  // beats slot an inline <input> directly inside the dialogue box.
  // ENTER confirms an input; click / any key advances a `say` beat.
  // Failed connect rewinds to the IP beat with a SURPRISED face.
  #portrait: Phaser.GameObjects.Image | null = null;
  #dialogueText: Phaser.GameObjects.Text | null = null;
  #dialoguePrompt: Phaser.GameObjects.BitmapText | null = null;
  #dialogueInput: Phaser.GameObjects.DOMElement | null = null;
  #dialogueInputHint: Phaser.GameObjects.BitmapText | null = null;
  #dialogueErrorText: Phaser.GameObjects.BitmapText | null = null;
  #dialogueTypeTimer: Phaser.Time.TimerEvent | null = null;
  #dialogueTypeComplete = false;
  #dialogueTypeProgress = 0;
  #dialogueBeatIndex = 0;
  #dialogueBlipCounter = 0;
  #dialogueInputValue: { nick: string; ip: string } = { nick: 'Player', ip: 'localhost' };
  #dialogueAwaitingInput = false;
  #dialogueAcceptingAdvance = false;
  #dialogueKeyHandler: ((event: KeyboardEvent) => void) | null = null;
  #dialoguePointerHandler: (() => void) | null = null;
  // Transient queue of override lines spliced in by NICKNAME_EASTER_EGGS.
  // #runDialogueBeat drains from here first; once empty, the scripted beat
  // at #dialogueBeatIndex plays as usual.
  #easterEggQueue: { face: MageFace; text: string }[] = [];
  // The beat currently displayed on screen — either the scripted beat at
  // #dialogueBeatIndex OR an override line drained from the easter-egg queue.
  // #advanceDialogue must read FROM HERE, not from DIALOGUE_BEATS[index],
  // otherwise fast-complete on an egg line wipes the visible text with the
  // wrong beat's text. null between beats.
  #currentBeat: DialogueBeat | null = null;
  // Set to true on the advance that drained the LAST easter-egg line. The
  // next advance plays the scripted beat at #dialogueBeatIndex WITHOUT
  // incrementing (since the egg replaced the "Otimo..." beat at index 4
  // and #confirmInputBeat already set the index to point at the next
  // scripted beat after that). Cleared after the first such advance.
  #easterEggJustEnded = false;

  // Boxes/labels created by #showConnectView that we want to live-resize from
  // the debug panel without a full view-rebuild. Held as named refs so the
  // panel can mutate them in place.
  #boxFill: Phaser.GameObjects.Rectangle | null = null;
  #boxBorder: Phaser.GameObjects.Rectangle | null = null;
  #dialogueTitle: Phaser.GameObjects.BitmapText | null = null;
  #inConnectView = false;

  #showConnectView(): void {
    this.#clearView();
    this.#inConnectView = true;
    const cx = this.cameras.main.centerX;
    const t = LOBBY_TUNING;

    const bg = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0x000000, 1).setOrigin(0);

    // NPC portrait. Frame index drives the face (0..7 → MageFace).
    const portrait = this.add
      .image(t.PORTRAIT_X, t.PORTRAIT_Y, ASSET_KEYS.NPC_MAGE_PORTRAITS, MageFace.NEUTRAL)
      .setOrigin(0.5);
    portrait.setScale(t.PORTRAIT_SIZE_PX / this.#processedFrameSize);
    this.#portrait = portrait;

    // Dialogue box.
    this.#boxFill = this.add.rectangle(t.BOX_X, t.BOX_Y, t.BOX_W, t.BOX_H, 0x0a0f1f, 0.92).setOrigin(0);
    this.#boxBorder = this.add.rectangle(t.BOX_X, t.BOX_Y, t.BOX_W, t.BOX_H).setOrigin(0).setStrokeStyle(1, 0x2a3a55);

    this.#dialogueTitle = this.#crispText(cx, t.TITLE_Y, 'INSCRICOES PARA A ARENA', FONT_TITLE).setOrigin(0.5);

    // Canvas Text — supports word-wrap and TTF accent glyphs.
    this.#dialogueText = this.add
      .text(t.BOX_X + t.BOX_TEXT_PAD, t.BOX_Y + t.BOX_TEXT_PAD, '', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '8px',
        color: '#ffffff',
        align: 'left',
        wordWrap: { width: t.BOX_W - t.BOX_TEXT_PAD * 2, useAdvancedWrap: true },
      })
      .setOrigin(0, 0)
      .setLineSpacing(4)
      .setResolution(2);

    this.#dialoguePrompt = this.#crispText(
      t.BOX_X + t.BOX_W - t.PROMPT_OFFSET_X,
      t.BOX_Y + t.BOX_H - t.PROMPT_OFFSET_Y,
      '>>',
      { size: 8, tint: 0xcccccc },
    )
      .setOrigin(1, 1)
      .setAlpha(0);

    this.#dialogueErrorText = this.#crispText(cx, t.BOX_Y + t.BOX_H + t.ERROR_OFFSET_BELOW_BOX, '', {
      size: 8,
      tint: 0xff5555,
    }).setOrigin(0.5);
    this.#statusText = this.#dialogueErrorText;

    this.#viewObjects = [
      bg,
      portrait,
      this.#boxFill,
      this.#boxBorder,
      this.#dialogueTitle,
      this.#dialogueText,
      this.#dialoguePrompt,
      this.#dialogueErrorText,
    ];

    this.#dialogueBeatIndex = 0;
    this.#dialogueInputValue = { nick: 'Player', ip: 'localhost' };

    this.#dialogueKeyHandler = (event: KeyboardEvent) => this.#onDialogueKey(event);
    this.#dialoguePointerHandler = () => this.#onDialoguePointer();
    this.input.keyboard!.on('keydown', this.#dialogueKeyHandler);
    this.input.on('pointerdown', this.#dialoguePointerHandler);

    this.#runDialogueBeat();
  }

  // Live-update the connect-view layout from LOBBY_TUNING. Called by the lobby
  // debug panel whenever the user moves a slider. Mutates positions/sizes of
  // existing GameObjects in place — no full rebuild, no beat restart.
  applyLobbyTuning(): void {
    if (!this.#inConnectView) return;
    const t = LOBBY_TUNING;
    const cx = this.cameras.main.centerX;

    if (this.#portrait) {
      this.#portrait.setPosition(t.PORTRAIT_X, t.PORTRAIT_Y);
      this.#portrait.setScale(t.PORTRAIT_SIZE_PX / this.#processedFrameSize);
    }
    if (this.#boxFill) {
      this.#boxFill.setPosition(t.BOX_X, t.BOX_Y);
      this.#boxFill.setSize(t.BOX_W, t.BOX_H);
    }
    if (this.#boxBorder) {
      this.#boxBorder.setPosition(t.BOX_X, t.BOX_Y);
      this.#boxBorder.setSize(t.BOX_W, t.BOX_H);
      this.#boxBorder.setStrokeStyle(1, 0x2a3a55);
    }
    if (this.#dialogueTitle) {
      this.#dialogueTitle.setPosition(cx, t.TITLE_Y);
    }
    if (this.#dialogueText) {
      this.#dialogueText.setPosition(t.BOX_X + t.BOX_TEXT_PAD, t.BOX_Y + t.BOX_TEXT_PAD);
      this.#dialogueText.setWordWrapWidth(t.BOX_W - t.BOX_TEXT_PAD * 2, true);
    }
    if (this.#dialoguePrompt) {
      this.#dialoguePrompt.setPosition(t.BOX_X + t.BOX_W - t.PROMPT_OFFSET_X, t.BOX_Y + t.BOX_H - t.PROMPT_OFFSET_Y);
    }
    if (this.#dialogueErrorText) {
      this.#dialogueErrorText.setPosition(cx, t.BOX_Y + t.BOX_H + t.ERROR_OFFSET_BELOW_BOX);
    }
    // If an input is currently mounted, reposition it too.
    if (this.#dialogueInput && this.#dialogueInputHint) {
      this.#dialogueInput.setPosition(t.INPUT_X, t.INPUT_Y);
      this.#dialogueInputHint.setPosition(t.HINT_X, t.HINT_Y);
    }
  }

  // Re-process the portrait sheet from the raw PNG. Exposed so the debug panel
  // can call it after changing WHITE_KEY_THRESHOLD or FRAME_CROP_INSET_PX.
  reprocessPortraitSheet(): void {
    this.#processPortraitSheet();
  }

  #runDialogueBeat(): void {
    // Drain easter-egg lines (if any) before consulting the scripted beat at
    // #dialogueBeatIndex. The easter-egg queue is populated by #confirmInputBeat
    // when a nickname matches a NICKNAME_EASTER_EGGS entry; #dialogueBeatIndex
    // has already been advanced past the default reaction beat at that point.
    if (this.#easterEggQueue.length > 0) {
      const line = this.#easterEggQueue.shift()!;
      // After this shift, queue may be empty — that means the LINE WE'RE
      // ABOUT TO PLAY is the final egg line. Flag it so #advanceDialogue
      // knows to resume the scripted beat at the current (already-correct)
      // index without incrementing.
      if (this.#easterEggQueue.length === 0) this.#easterEggJustEnded = true;
      this.#playOverrideSayLine(line);
      return;
    }

    const beat = DIALOGUE_BEATS[this.#dialogueBeatIndex];
    if (!beat) {
      this.#currentBeat = null;
      return;
    }

    this.#currentBeat = beat;

    if (this.#dialoguePrompt) this.#dialoguePrompt.setAlpha(0);
    if (this.#dialogueTypeTimer) {
      this.#dialogueTypeTimer.remove();
      this.#dialogueTypeTimer = null;
    }
    this.#destroyInlineInput();
    this.#dialogueTypeComplete = false;
    this.#dialogueAcceptingAdvance = false;
    this.#dialogueAwaitingInput = false;

    if (beat.kind === 'connect') {
      this.#beginConnect();
      return;
    }

    if (this.#portrait) this.#portrait.setFrame(beat.face);

    this.#dialogueTypeProgress = 0;
    this.#dialogueBlipCounter = 0;
    if (this.#dialogueText) this.#dialogueText.setText('');
    this.#startDialogueTyping(beat.text, () => {
      if (beat.kind === 'say') {
        this.#showAdvancePrompt();
        this.#dialogueAcceptingAdvance = true;
      } else if (beat.kind === 'input') {
        this.#dialogueAwaitingInput = true;
        this.#mountInlineInput(beat);
      }
    });
  }

  // Plays a one-off `say`-style line from the easter-egg queue. Mirrors the
  // `say` branch of #runDialogueBeat but draws its text/face from the override
  // line instead of from DIALOGUE_BEATS. Click/Enter triggers the same
  // advance path (#advanceDialogue), which falls through to the next queue
  // entry on the next call to #runDialogueBeat.
  #playOverrideSayLine(line: { face: MageFace; text: string }): void {
    // Treat the override as a synthetic `say` beat for the duration of its
    // display so #advanceDialogue (which reads from #currentBeat) sees the
    // right kind/text. Without this, fast-completing the egg with a click
    // mid-typewriter would dump the scripted beat's text on screen instead
    // of the egg line's text, AND the advance logic would get out of sync.
    this.#currentBeat = { kind: 'say', face: line.face, text: line.text };

    if (this.#dialoguePrompt) this.#dialoguePrompt.setAlpha(0);
    if (this.#dialogueTypeTimer) {
      this.#dialogueTypeTimer.remove();
      this.#dialogueTypeTimer = null;
    }
    this.#destroyInlineInput();
    this.#dialogueTypeComplete = false;
    this.#dialogueAcceptingAdvance = false;
    this.#dialogueAwaitingInput = false;

    if (this.#portrait) this.#portrait.setFrame(line.face);
    this.#dialogueTypeProgress = 0;
    this.#dialogueBlipCounter = 0;
    if (this.#dialogueText) this.#dialogueText.setText('');
    this.#startDialogueTyping(line.text, () => {
      this.#showAdvancePrompt();
      this.#dialogueAcceptingAdvance = true;
    });
  }

  // Normalize for easter-egg lookup: lowercase, fold diacritics, trim.
  // "João  " → "joao".
  #normalizeNickname(raw: string): string {
    return raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  #findNickEasterEgg(nick: string): NickEasterEgg | null {
    const norm = this.#normalizeNickname(nick);
    if (!norm) return null;
    for (const egg of NICKNAME_EASTER_EGGS) {
      if (egg.match.some((m) => this.#normalizeNickname(m) === norm)) return egg;
    }
    return null;
  }

  #startDialogueTyping(fullText: string, onComplete: () => void): void {
    if (!this.#dialogueText) return;
    const MS_PER_CHAR = 24;
    this.#dialogueTypeTimer = this.time.addEvent({
      delay: MS_PER_CHAR,
      repeat: fullText.length - 1,
      callback: () => {
        this.#dialogueTypeProgress++;
        const justTyped = fullText[this.#dialogueTypeProgress - 1];
        if (this.#dialogueText) this.#dialogueText.setText(fullText.slice(0, this.#dialogueTypeProgress));
        if (justTyped && /\S/.test(justTyped)) {
          this.#dialogueBlipCounter++;
          if (this.#dialogueBlipCounter % 2 === 0) this.#playDialogueBlip();
        }
        if (this.#dialogueTypeProgress >= fullText.length) {
          this.#dialogueTypeComplete = true;
          onComplete();
        }
      },
    });
  }

  #showAdvancePrompt(): void {
    if (!this.#dialoguePrompt) return;
    this.#dialoguePrompt.setAlpha(1);
    this.tweens.killTweensOf(this.#dialoguePrompt);
    this.tweens.add({
      targets: this.#dialoguePrompt,
      alpha: { from: 0.3, to: 1.0 },
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  #mountInlineInput(beat: InputBeat): void {
    // Inline <input> sits inside the dialogue box, beneath the question text.
    // ENTER on the input itself confirms the value (the keydown handler on
    // the scene ignores input keystrokes via #dialogueAwaitingInput).
    const t = LOBBY_TUNING;
    const inputX = t.INPUT_X;
    const inputY = t.INPUT_Y;

    const current = this.#dialogueInputValue[beat.field] ?? beat.default;
    const maxlen = beat.field === 'nick' ? 12 : 64;
    const widthPx = beat.field === 'nick' ? t.INPUT_WIDTH_NICK_PX : t.INPUT_WIDTH_IP_PX;
    this.#dialogueInput = this.add
      .dom(inputX, inputY)
      .createFromHTML(
        `<input type="text" value="${current}" maxlength="${maxlen}" autocomplete="off" style="width:${widthPx}px;background:#111;color:#fff;border:1px solid #555;padding:4px;font-size:10px;font-family:monospace;text-align:center;outline:none;-webkit-appearance:none;appearance:none">`,
      );
    this.#viewObjects.push(this.#dialogueInput);

    const el = this.#dialogueInput.node as HTMLElement;
    const inputEl = (el.querySelector('input') ?? el) as HTMLInputElement;
    queueMicrotask(() => inputEl.focus({ preventScroll: true } as FocusOptions));
    inputEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        this.#confirmInputBeat(beat, inputEl.value);
      }
    });

    this.#dialogueInputHint = this.#crispText(t.HINT_X, t.HINT_Y, 'ENTER PARA CONFIRMAR', {
      size: 8,
      tint: 0x888888,
    }).setOrigin(0.5);
    this.#viewObjects.push(this.#dialogueInputHint);
  }

  #confirmInputBeat(beat: InputBeat, raw: string): void {
    const trimmed = raw.trim() || beat.default;
    this.#dialogueInputValue[beat.field] = trimmed;
    if (beat.field === 'nick') {
      this.#playerName = trimmed;
      // If the nickname matches an easter egg, queue its lines and skip past
      // the scripted default reaction beat ("Otimo. Anotado...") that
      // immediately follows the nick input. After the queue drains, the
      // script resumes at the next scripted beat (the IP-prompt setup).
      const egg = this.#findNickEasterEgg(trimmed);
      if (egg) {
        this.#easterEggQueue = egg.lines.slice();
        this.#dialogueBeatIndex += 2; // step over input beat + default reaction
        this.#destroyInlineInput();
        this.#dialogueAwaitingInput = false;
        this.#runDialogueBeat();
        return;
      }
    }
    this.#destroyInlineInput();
    this.#dialogueAwaitingInput = false;
    this.#dialogueBeatIndex++;
    this.#runDialogueBeat();
  }

  #destroyInlineInput(): void {
    if (this.#dialogueInput) {
      this.#dialogueInput.destroy();
      this.#dialogueInput = null;
    }
    if (this.#dialogueInputHint) {
      this.#dialogueInputHint.destroy();
      this.#dialogueInputHint = null;
    }
  }

  /**
   * Dev flag SKIP_TO_LOBBY: connect to the server with defaults (nick 'Player', ip 'localhost')
   * WITHOUT the connect dialogue, landing on the lobby list via #onConnected. On connect failure
   * (server down / wrong host) fall back to the normal connect dialogue so the rune (IP) can be
   * corrected — keeping the dev flag usable even when localhost isn't the host.
   */
  #skipToLobbyConnect(): void {
    this.#playerName = this.#dialogueInputValue.nick || 'Player';
    // resolveConnection picks same-origin + slug path on the platform, or http(s)://<ip>:<port> on LAN.
    const { url, options } = resolveConnection(this.#dialogueInputValue.ip);

    EVENT_BUS.once(CUSTOM_EVENTS.NETWORK_CONNECTED, this.#onConnected, this);
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_DISCONNECTED, this.#onSkipConnectFail, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_DISCONNECTED, this.#onSkipConnectFail, this);

    const nm = NetworkManager.init(url, options);
    nm.connect();
  }

  #onSkipConnectFail = (): void => {
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_CONNECTED, this.#onConnected, this);
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_DISCONNECTED, this.#onSkipConnectFail, this);
    // localhost didn't answer (e.g. server not up, or not the host) — drop into the normal
    // connect dialogue so the player can enter the correct rune.
    this.#showConnectView();
  };

  #beginConnect(): void {
    if (this.#portrait) this.#portrait.setFrame(MageFace.MYSTICAL);
    if (this.#dialogueText) this.#dialogueText.setText('Abrindo o portal...');
    if (this.#dialogueErrorText) this.#dialogueErrorText.setText('');

    const nick = this.#dialogueInputValue.nick || 'Player';
    this.#playerName = nick;

    // resolveConnection picks same-origin + slug path on the platform, or http(s)://<ip>:<port> on LAN.
    const { url, options } = resolveConnection(this.#dialogueInputValue.ip);

    EVENT_BUS.once(CUSTOM_EVENTS.NETWORK_CONNECTED, this.#onConnected, this);
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_DISCONNECTED, this.#onDialogueConnectFail, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_DISCONNECTED, this.#onDialogueConnectFail, this);

    const nm = NetworkManager.init(url, options);
    nm.connect();
  }

  #onConnected = (): void => {
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_CONNECTED, this.#onConnected, this);
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_DISCONNECTED, this.#onDialogueConnectFail, this);
    const nm = NetworkManager.getInstance();
    this.#localSocketId = nm.socketId;
    nm.sendLobbyList();
    this.#showLobbyListView();
  };

  #onDisconnected = (): void => {
    if (this.#statusText) {
      this.#statusText.setText('Disconnected from server').setTint(0xff4444);
    }
  };

  // Failed connect during the dialogue → rewind to the IP input beat with a
  // surprised reaction. After the player corrects the rune, the flow resumes
  // naturally through the existing connect beat.
  #onDialogueConnectFail = (): void => {
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_CONNECTED, this.#onConnected, this);
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_DISCONNECTED, this.#onDialogueConnectFail, this);
    if (this.#portrait) this.#portrait.setFrame(MageFace.SURPRISED);
    const ipBeatIndex = DIALOGUE_BEATS.findIndex((b) => b.kind === 'input' && b.field === 'ip');
    this.#dialogueBeatIndex = ipBeatIndex >= 0 ? ipBeatIndex : 0;
    if (this.#dialogueErrorText) this.#dialogueErrorText.setText('A Runa nao respondeu. Tente outra.');
    this.#runDialogueBeat();
  };

  #onDialogueKey(event: KeyboardEvent): void {
    if (this.#dialogueAwaitingInput) return;
    if (event.key === 'Escape') return;
    if (event.key.length > 1 && event.key !== 'Enter' && event.key !== ' ') return;
    this.#advanceDialogue();
  }

  #onDialoguePointer(): void {
    if (this.#dialogueAwaitingInput) return;
    this.#advanceDialogue();
  }

  #advanceDialogue(): void {
    // Read from #currentBeat (which may be a scripted beat OR a synthetic
    // beat representing an active easter-egg line). Reading from
    // DIALOGUE_BEATS[#dialogueBeatIndex] here would race the queue logic.
    const beat = this.#currentBeat;
    if (!beat) return;
    if (beat.kind !== 'say') return;

    if (!this.#dialogueTypeComplete) {
      if (this.#dialogueTypeTimer) {
        this.#dialogueTypeTimer.remove();
        this.#dialogueTypeTimer = null;
      }
      if (this.#dialogueText) this.#dialogueText.setText(beat.text);
      this.#dialogueTypeComplete = true;
      this.#showAdvancePrompt();
      this.#dialogueAcceptingAdvance = true;
      return;
    }

    if (!this.#dialogueAcceptingAdvance) return;
    this.#dialogueAcceptingAdvance = false;

    // Three transitions out of a say-beat:
    //   1. More egg lines queued → run the next one. Don't touch index.
    //   2. Egg JUST ended (this was the last egg line) → run the scripted
    //      beat at the CURRENT index without incrementing (the index was
    //      pre-pointed at the first post-egg scripted beat by #confirmInputBeat).
    //   3. Normal scripted advance → bump index, run next scripted beat.
    if (this.#easterEggQueue.length > 0) {
      this.#runDialogueBeat();
      return;
    }
    if (this.#easterEggJustEnded) {
      this.#easterEggJustEnded = false;
      this.#runDialogueBeat();
      return;
    }
    this.#dialogueBeatIndex++;
    this.#runDialogueBeat();
  }

  // Synthesized 8-bit blip — same pattern as OpeningCutsceneScene's typewriter.
  #playDialogueBlip(): void {
    const sm = this.sound as unknown as { context?: AudioContext };
    const ctx = sm.context;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 720;
    const t = ctx.currentTime + 0.005;
    const durSec = 0.018;
    gain.gain.setValueAtTime(0.03, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + durSec);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + durSec + 0.01);
  }

  // --- View B: Lobby List Screen ---
  #lobbies: Lobby[] = [];
  #lobbyListContainer: Phaser.GameObjects.GameObject[] = [];

  #showLobbyListView(): void {
    this.#clearView();
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    const title = this.#crispText(cx, 40, 'LOBBIES', FONT_TITLE).setOrigin(0.5);
    const hint = this.#crispText(cx, 65, 'Click a lobby to join it', FONT_SMALL).setOrigin(0.5);

    const createBtn = this.#createButton(cx, 100, 'CREATE LOBBY', () => {
      NetworkManager.getInstance().sendLobbyCreate(this.#playerName);
    });

    const listLabel = this.#crispText(cx - 200, 130, 'Available lobbies:', FONT_SMALL).setOrigin(0, 0);
    this.#lobbyListContainer = [];

    this.#viewObjects = [title, hint, createBtn, listLabel];

    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onLobbyUpdated, this);
    // Re-fetch list
    NetworkManager.getInstance().sendLobbyList();
  }

  #onLobbyUpdated = (data: { lobby?: Lobby; lobbies?: Lobby[] }): void => {
    if (data.lobbies) {
      this.#lobbies = data.lobbies;
      this.#renderLobbyList();
      return;
    }
    if (data.lobby) {
      this.#currentLobby = data.lobby;
      this.#showWaitingRoomView(data.lobby);
    }
  };

  #renderLobbyList(): void {
    // Clear old lobby rows
    this.#lobbyListContainer.forEach((o) => o.destroy());
    this.#lobbyListContainer = [];

    const cx = this.cameras.main.centerX;
    const baseY = 155;

    if (this.#lobbies.length === 0) {
      const empty = this.#crispText(cx, baseY + 16, 'No open lobbies', FONT_SMALL).setOrigin(0.5);
      this.#lobbyListContainer.push(empty);
      return;
    }

    this.#lobbies.slice(0, 6).forEach((lobby, i) => {
      const rowY = baseY + i * 36;
      const bg = this.add.rectangle(cx, rowY + 12, 380, 30, 0x223366).setInteractive();
      const c = lobby.config;
      const md = MAP_POOL.find((m) => m.id === c.mapId)?.displayName ?? c.mapId;
      const rowText = `${lobby.players[0]?.name ?? '?'}'s lobby — ${c.format} • ${md} • ${lobby.players.length}/${c.maxPlayers}`;
      const label = this.#crispText(cx - 185, rowY, rowText, FONT_SMALL_WHITE);

      bg.on('pointerover', () => bg.setFillStyle(BTN_HOVER));
      bg.on('pointerout', () => bg.setFillStyle(0x223366));
      bg.on('pointerdown', () => {
        NetworkManager.getInstance().sendLobbyJoin(lobby.id, this.#playerName);
      });

      this.#lobbyListContainer.push(bg, label);
    });
  }

  // --- View C: Waiting Room ---
  #waitingRoomObjects: Phaser.GameObjects.GameObject[] = [];
  #currentLobby: Lobby | null = null;

  get #isHost(): boolean {
    if (!this.#currentLobby) return false;
    const me = this.#currentLobby.players.find((p) => p.socketId === this.#localSocketId);
    return me !== undefined && me.id === this.#currentLobby.hostPlayerId;
  }

  #showWaitingRoomView(lobby: Lobby): void {
    // Remove lobby list view listeners and objects
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onLobbyUpdated, this);
    this.#clearView();

    this.#currentLobby = lobby;
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    // Title bar background — adds a subtle banner behind the title for visual anchor.
    const titleBg = this.add.rectangle(cx, 24, this.cameras.main.width, 36, 0x111933).setOrigin(0.5);
    const titleUnderline = this.add.rectangle(cx, 42, 200, 1, 0xffdd55).setOrigin(0.5);
    const title = this.#crispText(cx, 24, 'WAITING ROOM', FONT_TITLE).setOrigin(0.5);
    const hostName = lobby.players.find((p) => p.id === lobby.hostPlayerId)?.name ?? '?';
    const subtitle = this.#crispText(cx, 56, `Host: ${hostName}`, FONT_SMALL).setOrigin(0.5);

    this.#waitingRoomObjects = [titleBg, titleUnderline, title, subtitle];
    this.#viewObjects = [...this.#waitingRoomObjects];

    // Status line (errors / info) — placed just below the subtitle so it never
    // overlaps the config block or the player list below.
    this.#statusText = this.#crispText(cx, 70, '', FONT_SMALL).setOrigin(0.5);
    this.#viewObjects.push(this.#statusText);

    this.#renderConfigBlock(lobby);
    this.#renderPlayerList(lobby.players);

    // Show START button only for the host (derived from lobby.hostPlayerId)
    // Anchored at the bottom of the canvas, below the player-list viewport (296).
    if (this.#isHost) {
      const startBtn = this.#createButton(cx, 304, 'START GAME', () => {
        NetworkManager.getInstance().sendLobbyStart();
      });
      this.#viewObjects.push(startBtn);
    }

    // Listen for further updates
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onWaitingRoomUpdate, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_LOBBY_STARTED, this.#onLobbyStarted, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_HOST_CHANGED, this.#onHostChanged, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_LOBBY_ERROR, this.#onLobbyError, this);
  }

  #renderConfigBlock(lobby: Lobby): void {
    // Tear down any prior config-block objects (used on lobby:updated re-render).
    this.#configBlockObjects.forEach((o) => o.destroy());
    this.#configBlockObjects = [];
    this.#capacityHeader = null;

    const cx = this.cameras.main.centerX;
    const cfg = lobby.config;
    const mapDisplay = MAP_POOL.find((m) => m.id === cfg.mapId)?.displayName ?? cfg.mapId;

    // Subtle panel behind the whole config block (capacity header + format row +
    // map cards + card name labels). Centered at y=144, height 132 → spans y=78
    // to y=210 — covers capacity (y=86) through card-name labels (~y=202).
    const panel = this.add.rectangle(cx, 144, this.cameras.main.width - 16, 132, 0x0a0f1f, 0.6).setOrigin(0.5);
    const panelBorder = this.add
      .rectangle(cx, 144, this.cameras.main.width - 16, 132)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0x2a3a55);
    this.#configBlockObjects.push(panel, panelBorder);

    // Capacity header (visible to everyone) — simplified: format & map are shown
    // explicitly below, so no need to duplicate them here.
    this.#capacityHeader = this.#crispText(cx, 86, `Players ${lobby.players.length}/${cfg.maxPlayers}`, FONT).setOrigin(
      0.5,
      0,
    );
    this.#configBlockObjects.push(this.#capacityHeader);

    if (this.#isHost) {
      // Format row — native cycle control: < value > arrows replace the former
      // DOM <select> which rendered above the canvas and overlapped map cards.
      const formats: LobbyFormat[] = ['1v1', '2v2', '3v3', '4v4', '5v5', '6v6', '7v7', '8v8', '9v9', '10v10'];
      let fmtIdx = Math.max(0, formats.indexOf(cfg.format));

      const formatLabel = this.#crispText(cx - 8, 100, 'Format:', FONT_SMALL_WHITE).setOrigin(1, 0.5);
      const fmtValueText = this.#crispText(cx + 40, 100, formats[fmtIdx], FONT_SMALL_WHITE).setOrigin(0.5, 0.5);

      const fmtBgPrev = this.add.rectangle(cx + 12, 100, 20, 14, BTN_COLOR).setInteractive();
      const fmtLabelPrev = this.#crispText(cx + 12, 100, '<', FONT_SMALL_WHITE).setOrigin(0.5);
      fmtBgPrev.on('pointerover', () => fmtBgPrev.setFillStyle(BTN_HOVER));
      fmtBgPrev.on('pointerout', () => fmtBgPrev.setFillStyle(BTN_COLOR));
      fmtBgPrev.on('pointerdown', () => {
        fmtIdx = (fmtIdx - 1 + formats.length) % formats.length;
        fmtValueText.setText(formats[fmtIdx]);
        NetworkManager.getInstance().sendLobbySetConfig({ format: formats[fmtIdx] });
      });

      const fmtBgNext = this.add.rectangle(cx + 68, 100, 20, 14, BTN_COLOR).setInteractive();
      const fmtLabelNext = this.#crispText(cx + 68, 100, '>', FONT_SMALL_WHITE).setOrigin(0.5);
      fmtBgNext.on('pointerover', () => fmtBgNext.setFillStyle(BTN_HOVER));
      fmtBgNext.on('pointerout', () => fmtBgNext.setFillStyle(BTN_COLOR));
      fmtBgNext.on('pointerdown', () => {
        fmtIdx = (fmtIdx + 1) % formats.length;
        fmtValueText.setText(formats[fmtIdx]);
        NetworkManager.getInstance().sendLobbySetConfig({ format: formats[fmtIdx] });
      });

      this.#configBlockObjects.push(formatLabel, fmtBgPrev, fmtLabelPrev, fmtValueText, fmtBgNext, fmtLabelNext);

      // Match-length row — cycle control mirroring Format (host-only). winTarget: 8 / 15 / 30 kills.
      const winTargets = [8, 15, 30];
      let wtIdx = Math.max(0, winTargets.indexOf(cfg.winTarget ?? 30));

      const wtLabel = this.#crispText(cx - 8, 114, 'Match:', FONT_SMALL_WHITE).setOrigin(1, 0.5);
      const wtValueText = this.#crispText(cx + 40, 114, `${winTargets[wtIdx]}`, FONT_SMALL_WHITE).setOrigin(0.5, 0.5);

      const wtBgPrev = this.add.rectangle(cx + 12, 114, 20, 14, BTN_COLOR).setInteractive();
      const wtLabelPrev = this.#crispText(cx + 12, 114, '<', FONT_SMALL_WHITE).setOrigin(0.5);
      wtBgPrev.on('pointerover', () => wtBgPrev.setFillStyle(BTN_HOVER));
      wtBgPrev.on('pointerout', () => wtBgPrev.setFillStyle(BTN_COLOR));
      wtBgPrev.on('pointerdown', () => {
        wtIdx = (wtIdx - 1 + winTargets.length) % winTargets.length;
        wtValueText.setText(`${winTargets[wtIdx]}`);
        NetworkManager.getInstance().sendLobbySetConfig({ winTarget: winTargets[wtIdx] });
      });

      const wtBgNext = this.add.rectangle(cx + 68, 114, 20, 14, BTN_COLOR).setInteractive();
      const wtLabelNext = this.#crispText(cx + 68, 114, '>', FONT_SMALL_WHITE).setOrigin(0.5);
      wtBgNext.on('pointerover', () => wtBgNext.setFillStyle(BTN_HOVER));
      wtBgNext.on('pointerout', () => wtBgNext.setFillStyle(BTN_COLOR));
      wtBgNext.on('pointerdown', () => {
        wtIdx = (wtIdx + 1) % winTargets.length;
        wtValueText.setText(`${winTargets[wtIdx]}`);
        NetworkManager.getInstance().sendLobbySetConfig({ winTarget: winTargets[wtIdx] });
      });

      this.#configBlockObjects.push(wtLabel, wtBgPrev, wtLabelPrev, wtValueText, wtBgNext, wtLabelNext);

      // Map label — centered above the cards row.
      const mapLabel = this.#crispText(cx, 124, 'Map:', FONT_SMALL_WHITE).setOrigin(0.5, 0);
      this.#configBlockObjects.push(mapLabel);

      // Map preview cards (3-up). Cards are 96x64 to preserve the source
      // thumbnail aspect ratio (PNGs are 96x64 at the asset).
      // Center y at 158 → cards span y=126 to y=190.
      MAP_POOL.forEach((entry, i) => {
        const cardX = cx + (i - (MAP_POOL.length - 1) / 2) * (96 + 8);
        const cardY = 158;
        const isSelected = entry.id === cfg.mapId;
        const border = this.add
          .rectangle(cardX, cardY, 96, 64)
          .setStrokeStyle(isSelected ? 2 : 1, isSelected ? 0xffdd55 : 0x444444);
        const bg = this.add.rectangle(cardX, cardY, 96, 64, 0x111111).setInteractive();
        const thumb = this.textures.exists(entry.thumbnailKey)
          ? this.add.image(cardX, cardY, entry.thumbnailKey)
          : this.add.rectangle(cardX, cardY, 96, 64, 0x223366);
        const cardLabel = this.#crispText(cardX, cardY + 36, entry.displayName, FONT_SMALL_WHITE).setOrigin(0.5, 0);
        bg.on('pointerover', () => bg.setFillStyle(0x222222));
        bg.on('pointerout', () => bg.setFillStyle(0x111111));
        bg.on('pointerdown', () => {
          NetworkManager.getInstance().sendLobbySetConfig({ mapId: entry.id });
        });
        this.#configBlockObjects.push(border, bg, thumb, cardLabel);
      });
    } else {
      // Non-host: read-only labels mirroring the host control positions.
      const fmtLabel = this.#crispText(cx, 100, `Format: ${cfg.format}`, FONT_SMALL_WHITE).setOrigin(0.5, 0.5);
      const wtReadLabel = this.#crispText(cx, 114, `Match: ${cfg.winTarget ?? 30} kills`, FONT_SMALL_WHITE).setOrigin(0.5, 0.5);
      const mapReadLabel = this.#crispText(cx, 124, `Map: ${mapDisplay}`, FONT_SMALL_WHITE).setOrigin(0.5, 0);
      this.#configBlockObjects.push(fmtLabel, wtReadLabel, mapReadLabel);

      // Still render the cards (read-only — no pointer handlers, dimmer overlay
      // on non-selected cards) so non-hosts get the same visual map preview.
      MAP_POOL.forEach((entry, i) => {
        const cardX = cx + (i - (MAP_POOL.length - 1) / 2) * (96 + 8);
        const cardY = 158;
        const isSelected = entry.id === cfg.mapId;
        const border = this.add
          .rectangle(cardX, cardY, 96, 64)
          .setStrokeStyle(isSelected ? 2 : 1, isSelected ? 0xffdd55 : 0x333333);
        const bg = this.add.rectangle(cardX, cardY, 96, 64, 0x111111);
        const thumb = this.textures.exists(entry.thumbnailKey)
          ? this.add.image(cardX, cardY, entry.thumbnailKey)
          : this.add.rectangle(cardX, cardY, 96, 64, 0x223366);
        if (!isSelected) thumb.setAlpha(0.45);
        const cardLabel = this.#crispText(cardX, cardY + 36, entry.displayName, FONT_SMALL_WHITE)
          .setOrigin(0.5, 0)
          .setAlpha(isSelected ? 1 : 0.5);
        this.#configBlockObjects.push(border, bg, thumb, cardLabel);
      });
    }
  }

  #onLobbyError = (data: { message: string }): void => {
    if (!this.#statusText) return;
    this.#statusText.setText(data.message).setTint(0xff4444);
    this.time.delayedCall(3000, () => {
      this.#statusText?.setText('').setTint(0xffffff);
    });
  };

  #onWaitingRoomUpdate = (data: { lobby?: Lobby }): void => {
    if (data.lobby) {
      this.#currentLobby = data.lobby;
      this.#renderPlayerList(data.lobby.players);
      // Tear-down-and-rebuild the config block on every lobby:updated.
      // N is small (1 select + ≤10 cards) so the cost is negligible, and rebuild
      // guarantees the gold border tracks the authoritative server selection.
      // The DOM <select>.value is set to cfg.format on rebuild so an in-flight
      // host edit converges to the server's accepted value (which is the value
      // the host just sent, so no visible flicker).
      this.#renderConfigBlock(data.lobby);
    }
  };

  #onHostChanged = (data: { newHostPlayerId: string }): void => {
    if (this.#currentLobby) {
      this.#currentLobby = { ...this.#currentLobby, hostPlayerId: data.newHostPlayerId };
      this.#showWaitingRoomView(this.#currentLobby);
    }
  };

  #onLobbyStarted = (data: { matchConfig: MatchConfig }): void => {
    // 1. Unbind EVENT_BUS listeners first (existing behavior).
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onWaitingRoomUpdate, this);
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_STARTED, this.#onLobbyStarted, this);
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_HOST_CHANGED, this.#onHostChanged, this);
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_ERROR, this.#onLobbyError, this);
    this.#currentLobby = null;

    // 2. Eager teardown of configBlock objects before scene.start so the
    //    SHUTDOWN handler is idempotent (destroy is a no-op on already-destroyed
    //    objects; array assignments to [] make a second pass cheap).
    this.#clearView();

    // 3. Phase 9.2: 400ms fade-to-black + parallel menu-music duck to 0,
    //    then hard-stop the track and start LoadingScene. Per-client (D-08) —
    //    no server protocol event; LoadingScene's MIN_DISPLAY_MS floor
    //    absorbs cross-client jitter.
    // 400ms — chosen so the menu duck fits inside one perceived UI beat;
    // both calls use the literal so the value is greppable from a single spot.
    this.cameras.main.fadeOut(400, 0, 0, 0);
    MusicManager.instance.tweenMenuVolume(this, 0, 400);

    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      // D-09: hard stop (not crossfade) — gameplay music starts later inside
      // LoadingScene with a computed delay so the drop hits at COUNTDOWN-end.
      MusicManager.instance.stopMenu();
      this.scene.stop(SCENE_KEYS.LOBBY_SCENE);
      this.scene.start(SCENE_KEYS.LOADING_SCENE, { matchConfig: data.matchConfig });
    });
  };

  #playerListObjects: Phaser.GameObjects.GameObject[] = [];
  // Scrollable viewport for the player list — used when player count exceeds the
  // visible row capacity. The container holds every row at its natural Y position;
  // we adjust container.y to scroll, and a geometry mask clips children to the viewport.
  #playerListContainer: Phaser.GameObjects.Container | null = null;
  #playerListMaskGfx: Phaser.GameObjects.Graphics | null = null;
  #playerListScrollY = 0;
  #playerListMaxScroll = 0;
  #playerListWheelHandler:
    | ((pointer: Phaser.Input.Pointer, gameObjects: unknown[], deltaX: number, deltaY: number) => void)
    | null = null;
  static readonly #ROW_HEIGHT = 22; // tighter than the old 36 to fit more rows in viewport
  static readonly #PLAYER_LIST_TOP = 214; // viewport top (below map-card name row at y=194+8)
  static readonly #PLAYER_LIST_BOTTOM = 288; // viewport bottom (above Start button at y=304)

  #renderPlayerList(players: PlayerInfo[]): void {
    // Tear down prior render so re-render on lobby:updated is clean.
    this.#playerListObjects.forEach((o) => o.destroy());
    this.#playerListObjects = [];
    if (this.#playerListContainer) {
      this.#playerListContainer.destroy(true);
      this.#playerListContainer = null;
    }
    if (this.#playerListMaskGfx) {
      this.#playerListMaskGfx.destroy();
      this.#playerListMaskGfx = null;
    }
    if (this.#playerListWheelHandler) {
      this.input.off('wheel', this.#playerListWheelHandler);
      this.#playerListWheelHandler = null;
    }
    this.#playerListScrollY = 0;

    const cx = this.cameras.main.centerX;
    const TINTS = [0xffffff, 0x00aaff, 0xff4444, 0x44ff44, 0xff44ff];
    const viewportTop = LobbyScene.#PLAYER_LIST_TOP;
    const viewportBottom = LobbyScene.#PLAYER_LIST_BOTTOM;
    const viewportHeight = viewportBottom - viewportTop;
    const rowH = LobbyScene.#ROW_HEIGHT;

    // Container at the viewport's natural origin; rows are placed at local y = i * rowH
    // so container.y acts as the scroll offset.
    this.#playerListContainer = this.add.container(0, viewportTop);
    this.#playerListObjects.push(this.#playerListContainer);

    players.forEach((player, i) => {
      const rowY = i * rowH;
      const tint = TINTS[i % TINTS.length];

      // Zebra-stripe row background — improves scanability when many players are present.
      const rowBg = this.add
        .rectangle(cx, rowY + 8, this.cameras.main.width - 32, rowH - 4, i % 2 === 0 ? 0x111a2e : 0x0c1626, 0.55)
        .setOrigin(0.5);
      const dot = this.add.rectangle(cx - 150, rowY + 8, 8, 8, tint);
      const name = this.#crispText(cx - 130, rowY, player.name, FONT_SMALL_WHITE);
      this.#playerListContainer!.add([rowBg, dot, name]);

      if (player.id === this.#currentLobby?.hostPlayerId) {
        // HOST badge — placed right after the max name width (12 chars * 8px from cx-130).
        // Gold-tinted so it's visually distinct from team labels and won't be mistaken
        // for a clickable control. Fixed position avoids collision with team buttons.
        const role = this.#crispText(cx - 30, rowY, 'HOST', { size: 8, tint: 0xffdd55 });
        this.#playerListContainer!.add(role);
      }

      if (this.#isHost) {
        // Host sees clickable Team A / Team B toggle buttons per row.
        // Buttons are smaller (28px wide) so a HOST badge + A + B fit without overlap.
        const isTeamA = player.team === 0;
        const isTeamB = player.team === 1;
        const nm = NetworkManager.getInstance();

        const btnA = this.#createCompactButton(cx + 90, rowY + 8, 'A', () => {
          nm.sendLobbyAssignTeam(player.id, 0);
        });
        const btnB = this.#createCompactButton(cx + 124, rowY + 8, 'B', () => {
          nm.sendLobbyAssignTeam(player.id, 1);
        });

        // Container.getAt returns GameObject; tsc requires the cast to call
        // Rectangle.setFillStyle below. ESLint's "unnecessary assertion" rule
        // disagrees with tsc here, so we silence it locally.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const bgA = btnA.getAt(0) as Phaser.GameObjects.Rectangle;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const bgB = btnB.getAt(0) as Phaser.GameObjects.Rectangle;
        if (isTeamA) {
          bgA.setFillStyle(0x0066dd);
          bgB.setFillStyle(BTN_DISABLED);
        } else if (isTeamB) {
          bgA.setFillStyle(BTN_DISABLED);
          bgB.setFillStyle(0xcc2200);
        }

        this.#playerListContainer!.add([btnA, btnB]);
      } else {
        const teamLabel = player.team === 0 ? 'TEAM A' : player.team === 1 ? 'TEAM B' : 'NO TEAM';
        const teamColor = player.team === 0 ? 0x44aaff : player.team === 1 ? 0xff5533 : 0xaaaaaa;
        const badge = this.#crispText(cx + 80, rowY, teamLabel, { ...FONT_SMALL, tint: teamColor });
        this.#playerListContainer!.add(badge);
      }
    });

    // Compute the total content height and the max scroll allowed.
    const contentHeight = players.length * rowH;
    this.#playerListMaxScroll = Math.max(0, contentHeight - viewportHeight);

    // Geometry mask that clips the container to the viewport rectangle. The mask gfx
    // is drawn at screen coords (it's NOT added to the container — Phaser uses it as a
    // stencil only). Hidden via setVisible(false) so the mask shape itself doesn't render.
    this.#playerListMaskGfx = this.add.graphics();
    this.#playerListMaskGfx.fillStyle(0xffffff, 1);
    this.#playerListMaskGfx.fillRect(0, viewportTop, this.cameras.main.width, viewportHeight);
    this.#playerListMaskGfx.setVisible(false);
    this.#playerListContainer.setMask(this.#playerListMaskGfx.createGeometryMask());

    // Wire mousewheel scrolling — only enable if content actually overflows.
    if (this.#playerListMaxScroll > 0) {
      this.#playerListWheelHandler = (_p, _gos, _dx, deltaY) => {
        // Snap scroll by one row at a time to keep rows aligned with the viewport.
        const dir = deltaY > 0 ? 1 : -1;
        this.#setPlayerListScroll(this.#playerListScrollY + dir * rowH);
      };
      this.input.on('wheel', this.#playerListWheelHandler);

      // Visual hint: a small scrollbar at the right edge of the viewport.
      this.#drawPlayerListScrollbar(viewportTop, viewportHeight, contentHeight);
    }
  }

  #setPlayerListScroll(targetY: number): void {
    if (!this.#playerListContainer) return;
    const clamped = Phaser.Math.Clamp(targetY, 0, this.#playerListMaxScroll);
    this.#playerListScrollY = clamped;
    this.#playerListContainer.y = LobbyScene.#PLAYER_LIST_TOP - clamped;
  }

  #drawPlayerListScrollbar(top: number, viewportH: number, contentH: number): void {
    const cw = this.cameras.main.width;
    const trackX = cw - 8;
    const trackW = 3;
    // Track
    const track = this.add.rectangle(trackX, top, trackW, viewportH, 0x222222).setOrigin(0, 0);
    // Thumb height proportional to viewport / content ratio
    const thumbH = Math.max(8, Math.round(viewportH * (viewportH / contentH)));
    const thumb = this.add.rectangle(trackX, top, trackW, thumbH, 0xffdd55).setOrigin(0, 0);
    this.#playerListObjects.push(track, thumb);
    // Reposition thumb whenever scroll changes — quick hack: tween thumb on a 60Hz follow
    // since #setPlayerListScroll is called sparsely. Use Phaser's update event.
    const updateThumb = () => {
      if (!thumb.active) return;
      const ratio = this.#playerListMaxScroll === 0 ? 0 : this.#playerListScrollY / this.#playerListMaxScroll;
      thumb.y = top + ratio * (viewportH - thumbH);
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, updateThumb);
    // Cleanup: when this scrollbar is destroyed (next #renderPlayerList run), stop the update.
    track.once('destroy', () => this.events.off(Phaser.Scenes.Events.UPDATE, updateThumb));
  }

  // BitmapText draws each glyph as a sprite from the pre-rasterized atlas
  // loaded in preload(). No runtime canvas2d AA, so glyphs stay sharp under
  // the 480x320 → viewport nearest-neighbor upscale. Tint replaces the CSS
  // color from the old Text-based styling.
  #crispText(x: number, y: number, text: string, style: BMStyle): Phaser.GameObjects.BitmapText {
    return this.add.bitmapText(x, y, BMFONT_KEY, text, style.size).setTint(style.tint);
  }

  #createButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, label.length * 10 + 24, 28, BTN_COLOR).setInteractive();
    const text = this.#crispText(0, 0, label, FONT_SMALL_WHITE).setOrigin(0.5);
    const container = this.add.container(x, y, [bg, text]);

    bg.on('pointerover', () => bg.setFillStyle(BTN_HOVER));
    bg.on('pointerout', () => bg.setFillStyle(BTN_COLOR));
    bg.on('pointerdown', onClick);

    return container;
  }

  // Compact 28×16 button used for per-row team toggles (Team A / Team B) in the
  // player list. Smaller than #createButton so a HOST badge + A + B fit in one
  // row without overlapping the player name area.
  #createCompactButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, 28, 16, BTN_COLOR).setInteractive();
    const text = this.#crispText(0, 0, label, FONT_SMALL_WHITE).setOrigin(0.5);
    const container = this.add.container(x, y, [bg, text]);

    bg.on('pointerover', () => bg.setFillStyle(BTN_HOVER));
    bg.on('pointerout', () => bg.setFillStyle(BTN_COLOR));
    bg.on('pointerdown', onClick);

    return container;
  }

  #clearView(): void {
    // Tear down dialogue listeners + timer first so a transition out of the
    // connect view doesn't leak keyboard/pointer handlers into subsequent views.
    if (this.#dialogueKeyHandler) {
      this.input.keyboard?.off('keydown', this.#dialogueKeyHandler);
      this.#dialogueKeyHandler = null;
    }
    if (this.#dialoguePointerHandler) {
      this.input.off('pointerdown', this.#dialoguePointerHandler);
      this.#dialoguePointerHandler = null;
    }
    if (this.#dialogueTypeTimer) {
      this.#dialogueTypeTimer.remove();
      this.#dialogueTypeTimer = null;
    }
    this.#portrait = null;
    this.#dialogueText = null;
    this.#dialoguePrompt = null;
    this.#dialogueInput = null;
    this.#dialogueInputHint = null;
    this.#dialogueErrorText = null;
    this.#boxFill = null;
    this.#boxBorder = null;
    this.#dialogueTitle = null;
    this.#inConnectView = false;
    this.#dialogueAwaitingInput = false;
    this.#dialogueAcceptingAdvance = false;
    this.#dialogueTypeComplete = false;
    this.#currentBeat = null;
    this.#easterEggQueue = [];
    this.#easterEggJustEnded = false;

    this.#viewObjects.forEach((o) => o.destroy());
    this.#lobbyListContainer.forEach((o) => o.destroy());
    this.#waitingRoomObjects.forEach((o) => o.destroy());
    this.#playerListObjects.forEach((o) => o.destroy());
    this.#configBlockObjects.forEach((o) => o.destroy());
    this.#viewObjects = [];
    this.#lobbyListContainer = [];
    this.#waitingRoomObjects = [];
    this.#playerListObjects = [];
    this.#configBlockObjects = [];
    this.#capacityHeader = null;
  }
}
