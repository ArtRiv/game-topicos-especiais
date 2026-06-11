import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { CUSTOM_EVENTS, EVENT_BUS } from '../common/event-bus';
import { NetworkManager } from '../networking/network-manager';
import type {
  CardRarity,
  OfferedCard,
  RespawnPayload,
  UpgradeAppliedPayload,
  UpgradeOfferPayload,
} from '../networking/types';

/**
 * TDM death-card upgrades: "pick 1 of 3" overlay launched by GameScene while the local player
 * waits out the respawn countdown. PURE PRESENTATION — the scene only renders the cards the
 * server offered and echoes the chosen cardId back; it never rolls cards or computes values.
 *
 * Lifecycle (all server-driven):
 *  - launch: GameScene.#onUpgradeOffer with the UpgradeOfferPayload as scene data
 *  - pick:   key 1/2/3 or click → sendUpgradeSelect → wait for the server's confirmation
 *  - close:  local NETWORK_UPGRADE_APPLIED (pick confirmed OR server auto-picked),
 *            local NETWORK_RESPAWN (deadline passed; auto-pick broadcast may have raced ahead),
 *            NETWORK_MATCH_ENDED (don't float over the results screen)
 */

const GAME_W = 480;
const GAME_H = 320;

const CARD_W = 132;
const CARD_H = 168;
const CARD_Y = 178; // card centre — leaves the top strip for the countdown + title
const CARD_GAP = 22;

const RARITY_COLORS: Record<CardRarity, number> = {
  BRONZE: 0xcd7f32,
  SILVER: 0xc0c0c0,
  GOLD: 0xffd700,
  PRISMATIC: 0xff66ff, // base; animated cycle below
};

/** Hue cycle for prismatic borders/title — stepped through on a timer. */
const PRISMATIC_CYCLE = [0xff66ff, 0x66ffff, 0xffff66, 0x66ff66, 0x9966ff];

const CATEGORY_LABELS: Record<OfferedCard['category'], string> = {
  FIREBALL: 'FIREBALL',
  FIRE_AREA: 'FIRE RING',
  LIGHTNING: 'LIGHTNING',
  WATER_TORNADO: 'TORNADO',
  WATER_SPIKE: 'WATER SPIKE',
  EARTH_WALL: 'EARTH WALL',
  EARTH_BUMP: 'EARTH BUMP',
  WIND: 'WIND',
  DASH: 'DASH',
  PLAYER: 'WIZARD',
};

type CardVisual = {
  card: OfferedCard;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  zone: Phaser.GameObjects.Zone;
};

export class CardPickerScene extends Phaser.Scene {
  #offer!: UpgradeOfferPayload;
  #visuals: CardVisual[] = [];
  #hoveredIndex: number | null = null;
  #pickedIndex: number | null = null;
  #prismaticStep = 0;
  #prismaticTimer: Phaser.Time.TimerEvent | undefined;
  #titleText!: Phaser.GameObjects.BitmapText;

  constructor() {
    super({ key: SCENE_KEYS.CARD_PICKER_SCENE });
  }

  public init(data: UpgradeOfferPayload): void {
    this.#offer = data;
  }

  public create(): void {
    // Defensive: a malformed/empty offer just closes (server only sends 1..3 cards).
    if (!this.#offer || !Array.isArray(this.#offer.cards) || this.#offer.cards.length === 0) {
      this.scene.stop();
      return;
    }
    // Phaser reuses scene instances across stop/launch — reset per-run state.
    this.#visuals = [];
    this.#hoveredIndex = null;
    this.#pickedIndex = null;
    this.#prismaticStep = 0;

    // Light scrim on top of GameScene's death overlay (which is already dark) — just enough to
    // push the frozen battlefield further back without losing it entirely.
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.35).setOrigin(0);

    const rarityColor = this.#rarityColor(this.#offer.rarity);
    this.#titleText = this.add
      .bitmapText(GAME_W / 2, 44, 'press_start_2p', `CHOOSE AN UPGRADE - ${this.#offer.rarity}`, 8)
      .setOrigin(0.5)
      .setTint(rarityColor);
    this.add
      .bitmapText(GAME_W / 2, 58, 'press_start_2p', 'PRESS 1 / 2 / 3 OR CLICK', 6)
      .setOrigin(0.5)
      .setTint(0x888899);

    this.#buildCards();

    // Prismatic shimmer — cheap stepped tint cycle (no per-frame tween needed at pixel scale).
    if (this.#offer.rarity === 'PRISMATIC' || this.#offer.cards.some((c) => c.rarity === 'PRISMATIC')) {
      this.#prismaticTimer = this.time.addEvent({
        delay: 160,
        loop: true,
        callback: () => {
          this.#prismaticStep = (this.#prismaticStep + 1) % PRISMATIC_CYCLE.length;
          if (this.#offer.rarity === 'PRISMATIC') this.#titleText.setTint(this.#rarityColor('PRISMATIC'));
          this.#visuals.forEach((v, i) => this.#drawCardBg(v, i));
        },
      });
    }

    // Keyboard: 1/2/3 map to card slots. Registered on this scene's keyboard plugin, so they
    // don't leak into GameScene (whose own digit handling is dead-locked anyway while we're up).
    this.input.keyboard?.on('keydown-ONE', () => this.#pick(0));
    this.input.keyboard?.on('keydown-TWO', () => this.#pick(1));
    this.input.keyboard?.on('keydown-THREE', () => this.#pick(2));

    // Server-driven closes.
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_UPGRADE_APPLIED, this.#onUpgradeApplied, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_RESPAWN, this.#onRespawn, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_MATCH_ENDED, this.#close, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_UPGRADE_APPLIED, this.#onUpgradeApplied, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_RESPAWN, this.#onRespawn, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_MATCH_ENDED, this.#close, this);
      this.#prismaticTimer?.remove(false);
      this.#prismaticTimer = undefined;
    });
  }

  #buildCards(): void {
    const cards = this.#offer.cards;
    const totalW = cards.length * CARD_W + (cards.length - 1) * CARD_GAP;
    const firstCx = GAME_W / 2 - totalW / 2 + CARD_W / 2;

    cards.forEach((card, i) => {
      const cx = firstCx + i * (CARD_W + CARD_GAP);
      const container = this.add.container(cx, CARD_Y);
      const bg = this.add.graphics();
      container.add(bg);

      // Key hint (1/2/3) pinned to the card's top edge.
      container.add(
        this.add
          .bitmapText(0, -CARD_H / 2 + 10, 'press_start_2p', `${i + 1}`, 10)
          .setOrigin(0.5)
          .setTint(0xffffff),
      );
      // Category strip + name + level + description.
      container.add(
        this.add
          .bitmapText(0, -CARD_H / 2 + 28, 'press_start_2p', CATEGORY_LABELS[card.category] ?? card.category, 6)
          .setOrigin(0.5)
          .setTint(0x8888aa),
      );
      container.add(
        this.add
          .bitmapText(0, -CARD_H / 2 + 46, 'press_start_2p', card.name.toUpperCase(), 8)
          .setOrigin(0.5)
          .setMaxWidth(CARD_W - 12)
          .setCenterAlign()
          .setTint(this.#rarityColor(card.rarity)),
      );
      container.add(
        this.add
          .bitmapText(0, -CARD_H / 2 + 78, 'press_start_2p', card.description.toUpperCase(), 6)
          .setOrigin(0.5, 0)
          .setMaxWidth(CARD_W - 16)
          .setCenterAlign()
          .setTint(0xddddee),
      );
      container.add(
        this.add
          .bitmapText(0, CARD_H / 2 - 16, 'press_start_2p', `LV ${card.currentLevel + 1}/${card.maxLevel}`, 6)
          .setOrigin(0.5)
          .setTint(0xaaaacc),
      );

      // Interactive zone (containers aren't interactive themselves at this size cheaply).
      const zone = this.add
        .zone(cx, CARD_Y, CARD_W, CARD_H)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => {
        if (this.#pickedIndex !== null) return;
        this.#hoveredIndex = i;
        this.#visuals.forEach((v, j) => this.#drawCardBg(v, j));
      });
      zone.on('pointerout', () => {
        if (this.#pickedIndex !== null) return;
        if (this.#hoveredIndex === i) this.#hoveredIndex = null;
        this.#visuals.forEach((v, j) => this.#drawCardBg(v, j));
      });
      zone.on('pointerdown', () => this.#pick(i));

      const visual: CardVisual = { card, container, bg, zone };
      this.#visuals.push(visual);
      this.#drawCardBg(visual, i);

      // Deal-in: cards pop from slightly below, staggered left → right.
      container.setScale(0.6).setAlpha(0);
      container.y = CARD_Y + 14;
      this.tweens.add({
        targets: container,
        scale: 1,
        alpha: 1,
        y: CARD_Y,
        duration: 180,
        delay: i * 70,
        ease: Phaser.Math.Easing.Back.Out,
      });
    });
  }

  #drawCardBg(visual: CardVisual, index: number): void {
    const { bg, card } = visual;
    const isHovered = this.#hoveredIndex === index && this.#pickedIndex === null;
    const isPicked = this.#pickedIndex === index;
    const borderColor = this.#rarityColor(card.rarity);
    bg.clear();
    bg.fillStyle(isHovered || isPicked ? 0x2a2a3e : 0x1c1c2a, 0.95);
    bg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 6);
    bg.lineStyle(isHovered || isPicked ? 3 : 2, borderColor, isPicked ? 1 : isHovered ? 0.95 : 0.7);
    bg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 6);
  }

  #rarityColor(rarity: CardRarity): number {
    if (rarity === 'PRISMATIC') return PRISMATIC_CYCLE[this.#prismaticStep];
    return RARITY_COLORS[rarity];
  }

  #pick(index: number): void {
    if (this.#pickedIndex !== null) return; // one pick only
    const visual = this.#visuals[index];
    if (!visual) return; // key 3 on a 2-card thin-pool offer

    let nm: NetworkManager | null = null;
    try {
      nm = NetworkManager.getInstance();
    } catch {
      this.#close();
      return;
    }
    if (!nm?.isConnected) {
      this.#close();
      return;
    }

    this.#pickedIndex = index;
    nm.sendUpgradeSelect({ offerId: this.#offer.offerId, cardId: visual.card.cardId });

    // Selection feedback while we wait for the server's upgrade:applied confirmation:
    // chosen card pops, the rest fall back. The scene closes on the confirmation broadcast
    // (or on respawn, which is the guaranteed fallback if the select packet is lost).
    this.#visuals.forEach((v, j) => {
      v.zone.disableInteractive();
      this.#drawCardBg(v, j);
      if (j === index) {
        this.tweens.add({ targets: v.container, scale: 1.08, duration: 120, ease: Phaser.Math.Easing.Back.Out });
      } else {
        this.tweens.add({ targets: v.container, alpha: 0.25, scale: 0.92, duration: 120 });
      }
    });
  }

  /** Close once OUR pick (or the server's auto-pick for us) is confirmed. */
  #onUpgradeApplied = (payload: UpgradeAppliedPayload): void => {
    if (payload.playerId !== this.#localPlayerId()) return;
    // Brief beat so the player reads the confirmed card before the overlay drops.
    this.time.delayedCall(150, () => this.#close());
  };

  /** Our respawn fired — the offer is resolved server-side no matter what. Hard close. */
  #onRespawn = (payload: RespawnPayload): void => {
    if (payload.playerId !== this.#localPlayerId()) return;
    this.#close();
  };

  #localPlayerId(): string | null {
    try {
      return NetworkManager.getInstance().localPlayerId;
    } catch {
      return null;
    }
  }

  #close = (): void => {
    if (this.scene.isActive(SCENE_KEYS.CARD_PICKER_SCENE)) {
      this.scene.stop();
    }
  };
}
