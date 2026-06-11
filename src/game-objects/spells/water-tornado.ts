import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE, DIRECTION } from '../../common/common';
import {
  WATER_TORNADO_MANA_COST,
  WATER_TORNADO_COOLDOWN,
  WATER_TORNADO_DURATION,
  WATER_TORNADO_BODY_RADIUS,
  WATER_TORNADO_TICK_INTERVAL,
  WATER_TORNADO_SPIN_CENTER_Y_OFFSET,
  WATER_TORNADO_SPIN_RADIUS_PADDING,
  WATER_TORNADO_SPIN_OMEGA,
  WATER_TORNADO_SPIN_TARGET_ORBIT,
  WATER_TORNADO_SPIN_PULL_RATE,
} from '../../common/config';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { CharacterGameObject } from '../common/character-game-object';
import type { Player } from '../player/player';
import { Puddle } from './puddle';
import type { GameScene } from '../../scenes/game-scene';
import type { VoidOrb } from './void-orb';

type WaterTornadoPhase = 'startup' | 'loop' | 'end';

export class WaterTornado extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.WATER;
  readonly spellId: SpellId = SPELL_ID.WATER_TORNADO;
  readonly spellType: SpellType = SPELL_TYPE.AREA;
  readonly manaCost: number = WATER_TORNADO_MANA_COST;
  readonly cooldown: number = WATER_TORNADO_COOLDOWN;

  #phase: WaterTornadoPhase = 'startup';
  #durationTimer: Phaser.Time.TimerEvent | undefined;
  #tickTimer: Phaser.Time.TimerEvent | undefined;
  #enemiesInArea: Set<CharacterGameObject> = new Set();
  #isDying: boolean = false;
  // Self-only silhouette shown above the funnel while the local player is inside,
  // so the user can still see roughly where they are even though the tornado fully
  // covers them. Only ever mirrors the LOCAL player (each client renders its own).
  #playerGhost: Phaser.GameObjects.Sprite | undefined;
  // VoidOrb combo portal: a BitmapMask with invertAlpha that punches a HOLE in
  // the funnel where the orb's center is, so the tornado looks like it's being
  // sucked into the vortex. The orb that owns the mask source is tracked so we
  // can: (a) auto-clear the mask if the orb dies before us (avoids a phantom
  // hole in the funnel), and (b) the orb can clear our mask if it's being
  // destroyed mid-combo (it calls back into clearVoidPortalMask).
  #darkPortalMask: Phaser.Display.Masks.BitmapMask | undefined;
  #voidPortalSourceOrb: VoidOrb | undefined;
  #pullMult: number = 1;
  #durationMult: number = 1;

  get baseDamage(): number {
    return RUNTIME_CONFIG.WATER_TORNADO_DAMAGE_PER_TICK;
  }

  get isDamageActive(): boolean {
    return this.#phase === 'loop' && !this.#isDying;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, caster?: { spellModifiers?: { tornadoPullMult?: number; tornadoSizeMult?: number; tornadoDurationMult?: number } }) {
    // Offset y slightly if needed so it sits on the ground.
    // The frames are 128x128. Let's offset by half height (64px).
    super(scene, x, y - 48, ASSET_KEYS.WATER_TORNADO_STARTUP_LOOP);
    const mods = caster?.spellModifiers;
    this.#pullMult = mods?.tornadoPullMult ?? 1;
    this.#durationMult = mods?.tornadoDurationMult ?? 1;
    const sizeMult = mods?.tornadoSizeMult ?? 1;
    if (sizeMult !== 1) this.setScale(sizeMult);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Y-based depth: characters use `depth = this.y` so any character whose center Y is
    // less than the spell's depth renders BEHIND. The cast-target y (the ground point
    // where the tornado's base sits) is `this.y + 48`; offsetting by the body radius
    // ensures every character physically overlapping the tornado is hidden by it —
    // they're standing INSIDE the funnel.
    this.setDepth(y + WATER_TORNADO_BODY_RADIUS);

    const body = this.body as Phaser.Physics.Arcade.Body;
    // Circle centred horizontally, placed near the bottom of the 128px bounding box
    const radius = WATER_TORNADO_BODY_RADIUS;
    body.setCircle(radius, 64 - radius, 128 - radius * 2 - 10);
    body.setImmovable(true);
    body.setAllowGravity(false);
    body.enable = false;
    // Hide the disabled body from the Arcade debug overlay during the startup spin-up.
    // Without this, Phaser still draws the (disabled) body at the texture's top-left
    // origin coordinate, which read as a phantom "first hitbox" up and to the left of
    // the visible tornado. Re-enabled in #startLoop when the body activates.
    body.debugShowBody = false;

    // Start with the startup animation
    this.#startStartup();
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  /** Per-frame spin: any player whose center sits inside the funnel gets rotated
   *  around the tornado's base. Position-additive (same pattern as VoidOrb's pull
   *  in GameScene) so Arcade's body→sprite sync still resolves collisions normally.
   *  Applies to both the local player and remote players visible on this client —
   *  each client spins its own local player, and remote-player positions on other
   *  clients sync via the normal P2P position stream. */
  public preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    // Safety net: if the orb that owns our mask source has died (expired, was
    // consumed by a counter-combo, or scene shutdown), clear the mask BEFORE
    // rendering this frame — otherwise the funnel renders a phantom hole.
    if (this.#darkPortalSourceIsDead()) {
      this.clearVoidPortalMask();
    }
    if (!this.isDamageActive) {
      this.#playerGhost?.setVisible(false);
      return;
    }
    const dt = delta / 1000;
    const centerX = this.x;
    const centerY = this.y + WATER_TORNADO_SPIN_CENTER_Y_OFFSET;
    const spinRadius = WATER_TORNADO_BODY_RADIUS + WATER_TORNADO_SPIN_RADIUS_PADDING;

    const scene = this.scene as GameScene;
    const localPlayer: Player | undefined = scene.player?.active ? scene.player : undefined;

    if (localPlayer && !localPlayer.isStarShieldActive) {
      const dx = localPlayer.x - centerX;
      const dy = localPlayer.y - centerY;
      const distSq = dx * dx + dy * dy;
      if (distSq <= spinRadius * spinRadius) {
        const dist = Math.sqrt(distSq);
        // Pull the orbit radius toward the target each frame instead of
        // using the player's entry distance as their orbit. Frame-rate
        // independent exponential lerp: k = 1 - e^(-rate*dt).
        const k = 1 - Math.exp(-WATER_TORNADO_SPIN_PULL_RATE * this.#pullMult * dt);
        const orbit = dist + (WATER_TORNADO_SPIN_TARGET_ORBIT - dist) * k;
        const angle = (dist > 0.001 ? Math.atan2(dy, dx) : 0) + WATER_TORNADO_SPIN_OMEGA * dt;
        localPlayer.x = centerX + Math.cos(angle) * orbit;
        localPlayer.y = centerY + Math.sin(angle) * orbit;
        this.#updatePlayerGhost(localPlayer);
      } else {
        this.#playerGhost?.setVisible(false);
      }
    } else {
      this.#playerGhost?.setVisible(false);
    }
  }

  /** Mirror the local player as a faded silhouette one depth above the funnel so
   *  the user can still locate themselves inside the spell. Created lazily on
   *  first use; destroyed in destroy(). */
  #updatePlayerGhost(player: Player): void {
    if (!this.#playerGhost || !this.#playerGhost.scene) {
      this.#playerGhost = this.scene.add.sprite(player.x, player.y, player.texture.key);
      this.#playerGhost.setTint(0x88ccff);
      this.#playerGhost.setAlpha(0.55);
    }
    const g = this.#playerGhost;
    g.setTexture(player.texture.key, player.frame.name);
    g.setPosition(player.x, player.y);
    g.setFlipX(player.flipX);
    g.setOrigin(player.originX, player.originY);
    g.setScale(player.scaleX, player.scaleY);
    g.setDepth(this.depth + 1);
    g.setVisible(true);
  }

  /** Punch a hole in the funnel using `orb`'s soft mask source. Idempotent — if
   *  we're already masked by THIS orb, no-op; if another orb tries to mask us
   *  while one is active, we ignore (one combo at a time). The orb is recorded
   *  so we can mutually clear on either side's destruction. */
  public applyVoidPortalMask(orb: VoidOrb, maskSource: Phaser.GameObjects.GameObject): void {
    if (this.#darkPortalMask) return;
    const bm = new Phaser.Display.Masks.BitmapMask(this.scene, maskSource);
    bm.invertAlpha = true;
    this.setMask(bm);
    this.#darkPortalMask = bm;
    this.#voidPortalSourceOrb = orb;
    orb.registerMaskedSpell(this);
  }

  public clearVoidPortalMask(): void {
    if (!this.#darkPortalMask) return;
    this.clearMask();
    this.#darkPortalMask.destroy();
    this.#darkPortalMask = undefined;
    const orb = this.#voidPortalSourceOrb;
    this.#voidPortalSourceOrb = undefined;
    // Notify the orb AFTER nulling our own refs so re-entrant callbacks don't loop.
    if (orb?.active) orb.unregisterMaskedSpell(this);
  }

  /** True iff our mask source's owning orb is gone — used in preUpdate as a
   *  safety net for cases where the GameScene combo loop didn't get a chance
   *  to clean up (e.g. orb destroyed mid-frame before its next combo tick). */
  #darkPortalSourceIsDead(): boolean {
    if (!this.#darkPortalMask) return false;
    const orb = this.#voidPortalSourceOrb;
    if (!orb || !orb.active || !orb.scene) return true;
    return false;
  }

  public addEnemyInArea(enemy: CharacterGameObject): void {
    if (!this.#isDying) {
      this.#enemiesInArea.add(enemy);
    }
  }

  public removeEnemyFromArea(enemy: CharacterGameObject): void {
    this.#enemiesInArea.delete(enemy);
  }

  // ── PvP tick damage (see TickAoeSpell) ──────────────────────────────────────
  #pvpTickSeq = 0;
  get pvpTickSeq(): number { return this.#pvpTickSeq; }
  get isPvpDamageActive(): boolean { return this.isDamageActive; }

  #applyTickDamage(): void {
    if (!this.isDamageActive) return;
    this.#pvpTickSeq += 1;
    for (const enemy of this.#enemiesInArea) {
      if (enemy.active && !enemy.isDefeated) {
        enemy.hit(DIRECTION.DOWN, this.baseDamage);
      }
    }
  }

  #startStartup(): void {
    this.#phase = 'startup';
    this.play(`${ASSET_KEYS.WATER_TORNADO_STARTUP_LOOP}_START`);
    this.once(`animationcomplete-${ASSET_KEYS.WATER_TORNADO_STARTUP_LOOP}_START`, () => {
      if (this.active) this.#startLoop();
    });
  }

  #startLoop(): void {
    if (!this.active) return;
    this.#phase = 'loop';

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.debugShowBody = true;

    // Drop puddles around the tornado's base RIGHT when the loop begins — the water is
    // visibly on the ground while the tornado is still spinning, not magically after.
    // Cluster spawn → 7 small puddles within ~48px of the base merge into a natural
    // 2-3 larger pool footprint matching the tornado's reach.
    //
    // Multiplayer determinism: derive the seed from the tornado's spawn
    // position (rounded to int pixels for cross-client agreement) so every
    // browser computes the SAME puddle positions for the same tornado. Without
    // this each client ran Math.random() independently → the user could see a
    // puddle that the opponent's client didn't render, breaking the "I'm
    // standing in water" feedback parity.
    const seed = ((this.x | 0) * 73856093) ^ ((this.y | 0) * 19349663);
    Puddle.spawnCluster(
      this.scene,
      this.x,
      this.y + 48, // tornado base (sprite origin sits 48px above the cast target)
      RUNTIME_CONFIG.WATER_TORNADO_PUDDLE_COUNT,
      RUNTIME_CONFIG.WATER_TORNADO_PUDDLE_SPREAD,
      RUNTIME_CONFIG.WATER_TORNADO_PUDDLE_AMOUNT_EACH,
      undefined, // lifetimeMs — use default
      RUNTIME_CONFIG.WATER_TORNADO_PUDDLE_STAGGER_MS, // drip in gradually over the loop
      'water',
      seed >>> 0,
    );

    this.play(`${ASSET_KEYS.WATER_TORNADO_STARTUP_LOOP}_LOOP`);

    // Tick damage every WATER_TORNADO_TICK_INTERVAL ms
    this.#tickTimer = this.scene.time.addEvent({
      delay: WATER_TORNADO_TICK_INTERVAL,
      callback: this.#applyTickDamage,
      callbackScope: this,
      loop: true,
    });

    // Handle duration
    this.#durationTimer = this.scene.time.delayedCall(WATER_TORNADO_DURATION * this.#durationMult, () => {
      if (this.active) this.#startFade();
    });
  }

  /** Force the tornado into its end animation immediately. Used by the
   *  WindBolt+Tornado combo where the bolt is absorbed and the funnel
   *  releases a forward cone burst — we want the tornado gone right away.
   *  No-op if already dying. */
  public forceEnd(): void {
    this.#startFade();
  }

  #startFade(): void {
    if (!this.active || this.#isDying) return;
    this.#isDying = true;
    this.#phase = 'end';

    this.#tickTimer?.destroy();
    this.#tickTimer = undefined;
    this.#enemiesInArea.clear();

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;

    // Play end animation
    this.play(`${ASSET_KEYS.WATER_TORNADO_END}_END`);
    this.once(`animationcomplete-${ASSET_KEYS.WATER_TORNADO_END}_END`, () => {
      // Puddles already laid during #startLoop — nothing extra here.
      this.destroy();
    });
  }

  public destroy(fromScene?: boolean): void {
    this.#durationTimer?.destroy();
    this.#tickTimer?.destroy();
    this.#playerGhost?.destroy();
    this.#playerGhost = undefined;
    this.clearVoidPortalMask();
    this.#enemiesInArea.clear();
    super.destroy(fromScene);
  }
}

import { registerSpell } from './spell-registry';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
registerSpell(SPELL_ID.WATER_TORNADO, (scene, _x, _y, tx, ty, _el, caster) => new WaterTornado(scene, tx, ty, caster as any));
