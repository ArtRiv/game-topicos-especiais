import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { TEAM_COLORS } from './ui-scene';
import { MatchEndedPayload, TdmPlayerStat } from '../networking/types';
import { MusicManager } from '../common/music-manager';

/**
 * Phase 14 (Plan 04, surface 4 — D-06/D-07/D-08): the minimal Team Deathmatch results
 * screen, launched on match ENDED over a frozen GameScene + UiScene.
 *
 * It reads a `MatchEndedPayload` passed as SCENE DATA (GameScene launches it on the
 * NETWORK_MATCH_ENDED broadcast). Renders: a dark scrim, a team-colored winner line,
 * a per-player kills/deaths table (rows tinted by each player's team), an MVP highlight
 * (gold ★ + underline on the mvpPlayerId row), and a single RETURN TO LOBBY button.
 *
 * No charts, no damage column, no elaborate animation (D-06) — a single overlay fade-in.
 * Robust to a missing/partial payload: missing fields fall back to 0 / neutral tint and
 * an empty roster still renders (never blank-screen, never errors — UI-SPEC error state).
 */

const GOLD = 0xffdd55;
const WHITE = 0xffffff;
const DIM = 0xcccccc;
const NEUTRAL_TEAM_TINT = 0xaaaaaa; // for a stat with no/unknown team

const CENTER_X = 240;
const WINNER_Y = 48;
const TABLE_HEADER_Y = 96;
const TABLE_FIRST_ROW_Y = 116;
const ROW_PITCH = 16;
const BUTTON_Y = 276;

// Column x-anchors (left-origin rows). Name is left-aligned; K / D are fixed columns.
const COL_NAME_X = 96;
const COL_K_X = 300;
const COL_D_X = 360;

export class TdmResultsScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.TDM_RESULTS_SCENE });
  }

  public create(data: MatchEndedPayload): void {
    // Switch to menu music — the match is over (mirrors GameOverScene / lobby destinations
    // which own the menu-music switch; GameScene intentionally does not switch on shutdown).
    MusicManager.instance.playMenu(this);

    const payload = this.#normalizePayload(data);

    // ── Scrim: full-screen dark overlay, viewport-anchored, fades in (D-06 minimal). ──
    const scrim = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.7)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(0);
    scrim.setAlpha(0);
    this.tweens.add({ targets: scrim, alpha: 0.7, duration: 200, ease: 'Linear' });

    // ── Winner line (32px Display, tinted winner-team color; gold DRAW for null). ──
    let winnerText: string;
    let winnerTint: number;
    if (payload.winningTeam === 0) {
      winnerText = 'TEAM A WINS';
      winnerTint = TEAM_COLORS[0];
    } else if (payload.winningTeam === 1) {
      winnerText = 'TEAM B WINS';
      winnerTint = TEAM_COLORS[1];
    } else {
      winnerText = 'DRAW';
      winnerTint = GOLD;
    }
    this.add
      .bitmapText(CENTER_X, WINNER_Y, 'press_start_2p', winnerText, 32)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1)
      .setTint(winnerTint);

    // ── Table header (8px, dim/white). ──
    this.add
      .bitmapText(COL_NAME_X, TABLE_HEADER_Y, 'press_start_2p', 'PLAYER', 8)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(1)
      .setTint(DIM);
    this.add
      .bitmapText(COL_K_X, TABLE_HEADER_Y, 'press_start_2p', 'K', 8)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1)
      .setTint(DIM);
    this.add
      .bitmapText(COL_D_X, TABLE_HEADER_Y, 'press_start_2p', 'D', 8)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1)
      .setTint(DIM);

    // ── Player rows: sort by team, then kills desc. One row per player, team-tinted. ──
    const rows = [...payload.stats].sort((a, b) => {
      if (a.team !== b.team) return a.team - b.team;
      return b.kills - a.kills;
    });

    rows.forEach((stat, i) => {
      const rowY = TABLE_FIRST_ROW_Y + i * ROW_PITCH;
      const tint = this.#teamTint(stat.team);
      const isMvp = payload.mvpPlayerId !== null && stat.playerId === payload.mvpPlayerId;

      // MVP highlight (D-06): thin gold underline rect behind the row + a gold ★ MVP tag.
      if (isMvp) {
        this.add
          .rectangle(CENTER_X, rowY + 7, 320, 1, GOLD)
          .setScrollFactor(0)
          .setDepth(1);
        this.add
          .bitmapText(COL_NAME_X - 36, rowY, 'press_start_2p', '* MVP', 8)
          .setOrigin(0, 0.5)
          .setScrollFactor(0)
          .setDepth(2)
          .setTint(GOLD);
      }

      this.add
        .bitmapText(COL_NAME_X, rowY, 'press_start_2p', stat.name, 8)
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(2)
        .setTint(tint);
      this.add
        .bitmapText(COL_K_X, rowY, 'press_start_2p', String(stat.kills), 8)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(2)
        .setTint(tint);
      this.add
        .bitmapText(COL_D_X, rowY, 'press_start_2p', String(stat.deaths), 8)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(2)
        .setTint(tint);
    });

    // ── RETURN TO LOBBY button — copy the main-menu hover pattern verbatim (D-06). ──
    const button = this.add
      .bitmapText(CENTER_X, BUTTON_Y, 'press_start_2p', 'RETURN TO LOBBY', 16)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2)
      .setTint(WHITE)
      .setInteractive({ useHandCursor: true });

    button.on('pointerover', () => {
      this.tweens.add({ targets: button, scaleX: 1.05, scaleY: 1.05, duration: 100, ease: 'Quad.Out' });
      button.setTint(GOLD);
    });
    button.on('pointerout', () => {
      button.setTint(WHITE);
      this.tweens.add({ targets: button, scaleX: 1, scaleY: 1, duration: 100, ease: 'Quad.Out' });
    });
    button.on('pointerup', () => this.#returnToLobby());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // No EVENT_BUS listeners here (payload arrives via scene data, not a bus
      // subscription). GameObjects + tweens are torn down by the scene lifecycle.
    });
  }

  /**
   * Full reset back to the lobby/rematch flow. A hard reload is the established
   * full-reset navigation in this codebase (game-over "Quit" path) — it tears down the
   * WebRTC mesh + all stale match/network singletons cleanly and re-enters the
   * splash → menu → lobby connect flow, which is the only safe way to start a fresh
   * lobby/rematch after a match has ended.
   */
  #returnToLobby(): void {
    window.location.reload();
  }

  /** Resolve a player's row tint from its team, falling back to a neutral tint. */
  #teamTint(team: number): number {
    if (team === 0 || team === 1) return TEAM_COLORS[team];
    return NEUTRAL_TEAM_TINT;
  }

  /**
   * Defensive normalization (UI-SPEC error state): a missing/partial ENDED payload must
   * never error or blank-screen. Coerce missing fields to safe defaults so the screen
   * always renders something sensible.
   */
  #normalizePayload(data: MatchEndedPayload | undefined): MatchEndedPayload {
    const stats: TdmPlayerStat[] = Array.isArray(data?.stats)
      ? data!.stats.map((s) => ({
          playerId: s?.playerId ?? '',
          name: s?.name ?? '???',
          team: typeof s?.team === 'number' ? s.team : -1,
          kills: typeof s?.kills === 'number' ? s.kills : 0,
          deaths: typeof s?.deaths === 'number' ? s.deaths : 0,
        }))
      : [];
    return {
      winningTeam: data?.winningTeam ?? null,
      teamScores: data?.teamScores ?? [0, 0],
      mvpPlayerId: data?.mvpPlayerId ?? null,
      stats,
    };
  }
}
