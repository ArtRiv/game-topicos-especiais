import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Direction, Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { DIRECTION, ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import {
  LIGHTNING_BEAM_ANGLE_JITTER_RAD,
  LIGHTNING_BEAM_DAMAGE_PER_TICK,
  LIGHTNING_BEAM_DISPLAY_HEIGHT_PX,
  LIGHTNING_BEAM_FLIP_CHANCE,
  LIGHTNING_BEAM_FORK_ANGLE_RAD,
  LIGHTNING_BEAM_FORK_CHANCE,
  LIGHTNING_BEAM_FORK_LENGTH_RATIO,
  LIGHTNING_BEAM_HAND_FORWARD_PX,
  LIGHTNING_BEAM_HAND_PERP_PX,
  LIGHTNING_BEAM_HEIGHT_PX,
  LIGHTNING_BEAM_JITTER_INTERVAL_MS,
  LIGHTNING_BEAM_LENGTH_PX,
  LIGHTNING_BEAM_MANA_PER_TICK,
  LIGHTNING_BEAM_TICK_INTERVAL_MS,
  LIGHTNING_BEAM_TURN_SPEED_RAD_PER_SEC,
} from '../../common/config';
import { registerSpell } from './spell-registry';
import type { ManaComponent } from '../../components/game-object/mana-component';
import type { SpellCastingComponent } from '../../components/game-object/spell-casting-component';
import { NetworkManager } from '../../networking/network-manager';

/**
 * LightningBeam — channeled / held lightning beam from the caster's hand to the cursor.
 * Replaces ThunderSplash on THUNDER right-click (slot 1). Self-destructs when right
 * mouse is released or mana hits zero.
 *
 * Visual chaos: every JITTER_INTERVAL_MS the visuals re-roll — random sprite flips on
 * both layers, small angle jitter on the secondary layer, and a chance to fork a
 * smaller secondary sub-beam off the main beam (forked lightning effect).
 *
 * Hitbox: rotated rectangle (LENGTH × HEIGHT) anchored at the caster's hand, applied
 * by GameScene via isPointInBeam. No physics body — the manual test is cheaper than a
 * rotated Arcade body (which Arcade doesn't really support anyway).
 */
export class LightningBeam extends Phaser.GameObjects.Container implements ActiveSpell {
  readonly element: Element = ELEMENT.THUNDER;
  readonly spellId: SpellId = SPELL_ID.LIGHTNING_BEAM;
  readonly spellType: SpellType = SPELL_TYPE.CHANNELED;
  readonly manaCost: number = LIGHTNING_BEAM_MANA_PER_TICK;
  readonly cooldown: number = 0;

  get baseDamage(): number {
    return LIGHTNING_BEAM_DAMAGE_PER_TICK;
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  #beamSprite1: Phaser.GameObjects.Sprite;
  #beamSprite2: Phaser.GameObjects.Sprite;
  #forkSprite: Phaser.GameObjects.Sprite;
  #debugGfx: Phaser.GameObjects.Graphics;
  #caster: (Phaser.GameObjects.GameObject & { x: number; y: number }) | null;
  #manaComponent: ManaComponent | undefined;
  #spellCastingComponent: SpellCastingComponent | undefined;
  #drainTimer: Phaser.Time.TimerEvent;
  #jitterTimer: Phaser.Time.TimerEvent;
  #angle: number = 0;          // current aim angle — tweens toward the cursor
  #angleInitialized: boolean = false;
  #length: number = 0;
  #hitThisTick: Set<unknown> = new Set();
  // Remote-mode aim point (set by caller for replicas). When isRemote = true,
  // the beam ignores the local mouse pointer and instead tracks this aim.
  #remoteAimX: number = 0;
  #remoteAimY: number = 0;
  /** True for replica beams spawned from a remote caster's SPELL_CAST — the
   *  beam must NOT self-destroy from the local viewer's mouse state, and
   *  reads aim from setRemoteAim() (driven by NETWORK_BEAM_UPDATE) instead
   *  of from the local pointer. */
  public readonly isRemote: boolean;

  constructor(
    scene: Phaser.Scene,
    casterX: number,
    casterY: number,
    targetX: number,
    targetY: number,
    _direction: Direction,
    caster?: Phaser.GameObjects.GameObject,
    isRemote: boolean = false,
  ) {
    void _direction;
    // Container starts at the raw caster position; #tick re-anchors using the rotated
    // hand offset each frame, so the literal starting coords here only matter for the
    // single frame before the first scene.update.
    super(scene, casterX, casterY);
    this.isRemote = isRemote;
    this.#remoteAimX = targetX;
    this.#remoteAimY = targetY;
    scene.add.existing(this);
    this.setDepth(3.5);

    this.#caster = (caster ?? null) as (Phaser.GameObjects.GameObject & { x: number; y: number }) | null;
    const maybeMana = (caster as { manaComponent?: ManaComponent } | undefined)?.manaComponent;
    this.#manaComponent = maybeMana;
    // Capture the caster's SpellCastingComponent so we can re-start the slot-1 cooldown
    // from the moment the beam ENDS (see DESTROY handler below). Remote casts won't
    // have one and that's fine — the remote client owns its own cooldown bookkeeping.
    this.#spellCastingComponent = (caster as { spellCastingComponent?: SpellCastingComponent } | undefined)?.spellCastingComponent;

    // Two stacked beam sprites. Origin (0, 0.5) anchors the beam at the container's
    // pivot point — when the container rotates, the beam extends out from that pivot.
    this.#beamSprite1 = scene.add.sprite(0, 0, ASSET_KEYS.LIGHTNING_BEAM_VFX1).setOrigin(0, 0.5);
    this.#beamSprite2 = scene.add.sprite(0, 0, ASSET_KEYS.LIGHTNING_BEAM_VFX2).setOrigin(0, 0.5);
    this.#beamSprite1.play(ASSET_KEYS.LIGHTNING_BEAM_VFX1);
    this.#beamSprite2.play(ASSET_KEYS.LIGHTNING_BEAM_VFX2);
    this.#beamSprite2.setBlendMode(Phaser.BlendModes.ADD);

    // Forked sub-beam — VFX1 frames, smaller, branches off at a random angle. Hidden
    // unless a roll passes in #onJitterTick.
    this.#forkSprite = scene.add.sprite(0, 0, ASSET_KEYS.LIGHTNING_BEAM_VFX1).setOrigin(0, 0.5);
    this.#forkSprite.play(ASSET_KEYS.LIGHTNING_BEAM_VFX1);
    this.#forkSprite.setBlendMode(Phaser.BlendModes.ADD);
    this.#forkSprite.setVisible(false);

    // Debug overlay — only visible when arcade physics debug is on (P key). Drawn in
    // the container's local frame so it rotates with the beam.
    this.#debugGfx = scene.add.graphics();

    this.add([this.#beamSprite1, this.#beamSprite2, this.#forkSprite, this.#debugGfx]);

    // Initial aim (so the first rendered frame isn't off-axis at world origin).
    this.#aimAt(targetX, targetY);

    this.#drainTimer = scene.time.addEvent({
      delay: LIGHTNING_BEAM_TICK_INTERVAL_MS,
      loop: true,
      callback: this.#onDrainTick,
      callbackScope: this,
    });
    this.#jitterTimer = scene.time.addEvent({
      delay: LIGHTNING_BEAM_JITTER_INTERVAL_MS,
      loop: true,
      callback: this.#onJitterTick,
      callbackScope: this,
    });

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.#tick, this);

    // Local beams broadcast a start event on the next frame (spellId is set
    // by SpellCastingComponent AFTER construction). Remote beams skip — they
    // were created in response to a beam-start they don't need to re-emit.
    if (!isRemote) {
      scene.time.delayedCall(0, () => {
        if (!this.active || !this.#caster) return;
        const sid = this.getData('spellId') as string | undefined;
        if (!sid) return;
        try {
          NetworkManager.getInstance().sendBeamStart({
            spellId: sid,
            x: this.#caster.x,
            y: this.#caster.y,
            targetX: this.#remoteAimX,
            targetY: this.#remoteAimY,
          });
        } catch { /* offline */ }
      });
    }

    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.#tick, this);
      this.#drainTimer.destroy();
      this.#jitterTimer.destroy();
      // Re-start the cooldown clock at end-of-channel — slot 1 is THUNDER's right click.
      // Without this the cooldown would run while the beam is active and any held cast
      // longer than COOLDOWN_MS would be instantly recastable on release.
      this.#spellCastingComponent?.refreshCooldown(1);
      // Local beams: tell the mesh the channel is over so remote replicas can
      // tear themselves down promptly. Without this, remote beams would only
      // expire when the caster disconnects.
      if (!isRemote) {
        const sid = this.getData('spellId') as string | undefined;
        if (sid) {
          try { NetworkManager.getInstance().sendBeamEnd({ spellId: sid }); } catch { /* offline */ }
        }
      }
    });
  }

  #tick(_time: number, delta: number): void {
    if (!this.active) return;
    if (!this.#caster || !this.#caster.active) {
      this.destroy();
      return;
    }
    // LOCAL beam: gated by the local viewer's right-mouse button. REMOTE beam:
    // gated by an explicit NETWORK_BEAM_END event handled by GameScene — we
    // can't peek at the caster's mouse from another client.
    if (!this.isRemote && !this.scene.input.activePointer.rightButtonDown()) {
      this.destroy();
      return;
    }

    let aimX: number;
    let aimY: number;
    if (this.isRemote) {
      aimX = this.#remoteAimX;
      aimY = this.#remoteAimY;
    } else {
      const cam = this.scene.cameras.main;
      const ptr = this.scene.input.activePointer;
      const world = cam.getWorldPoint(ptr.x, ptr.y);
      aimX = world.x;
      aimY = world.y;
    }
    this.#aimAt(aimX, aimY, delta);

    // Local-only: stream aim updates so remote replicas can track the cursor.
    // Throttled to ~30 Hz to avoid swamping the unreliable channel.
    if (!this.isRemote && this.#caster) {
      const now = this.scene.time.now;
      if (now - this.#lastAimBroadcastMs >= 33) {
        this.#lastAimBroadcastMs = now;
        const sid = this.getData('spellId') as string | undefined;
        if (sid) {
          try {
            NetworkManager.getInstance().sendBeamUpdate({
              spellId: sid,
              x: this.#caster.x,
              y: this.#caster.y,
              targetX: aimX,
              targetY: aimY,
            });
          } catch { /* offline */ }
        }
      }
    }

    // Refresh the debug rectangle if arcade debug is currently on. Keep it cheap by
    // only redrawing when the flag is set; clear it otherwise.
    this.#updateDebugOverlay();
  }

  #lastAimBroadcastMs: number = 0;

  /** Update the remote-mode aim point. Called by GameScene from
   *  NETWORK_BEAM_UPDATE events. No-op for local beams. */
  public setRemoteAim(targetX: number, targetY: number): void {
    if (!this.isRemote) return;
    this.#remoteAimX = targetX;
    this.#remoteAimY = targetY;
  }

  /** Compute the rotated hand pivot, then aim/stretch the beam toward the cursor.
   *  The actual aim angle tweens toward the cursor at TURN_SPEED rad/s so the player
   *  can't spin the beam around instantly — it has to "drag" with their cursor. */
  #aimAt(worldX: number, worldY: number, deltaMs: number = 0): void {
    if (!this.#caster) return;

    // Target angle from caster → cursor.
    const dx = worldX - this.#caster.x;
    const dy = worldY - this.#caster.y;
    const targetAngle = Math.atan2(dy, dx);

    if (!this.#angleInitialized) {
      // First aim — snap to target so the beam doesn't sweep in from angle 0 on cast.
      this.#angle = targetAngle;
      this.#angleInitialized = true;
    } else {
      // Shortest-path angular delta (wrapped to [-π, π]).
      let diff = targetAngle - this.#angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      // Maximum angular step this frame, in radians.
      const maxStep = LIGHTNING_BEAM_TURN_SPEED_RAD_PER_SEC * (deltaMs / 1000);
      if (Math.abs(diff) <= maxStep) {
        this.#angle = targetAngle;
      } else {
        this.#angle += Math.sign(diff) * maxStep;
      }
    }

    // Hand offset in beam-local space: rotate (FORWARD, PERP) by the aim angle, then
    // add to the caster position. Result: the pivot is always at the same "hand point"
    // relative to the character no matter which direction they aim.
    const cos = Math.cos(this.#angle);
    const sin = Math.sin(this.#angle);
    const worldOffX = LIGHTNING_BEAM_HAND_FORWARD_PX * cos - LIGHTNING_BEAM_HAND_PERP_PX * sin;
    const worldOffY = LIGHTNING_BEAM_HAND_FORWARD_PX * sin + LIGHTNING_BEAM_HAND_PERP_PX * cos;
    this.setPosition(this.#caster.x + worldOffX, this.#caster.y + worldOffY);

    this.#length = LIGHTNING_BEAM_LENGTH_PX;
    this.setRotation(this.#angle);

    // Stretch both main sprites to beam dimensions.
    const sxScale = this.#length / this.#beamSprite1.width;
    const syScale = LIGHTNING_BEAM_DISPLAY_HEIGHT_PX / this.#beamSprite1.height;
    this.#beamSprite1.setScale(sxScale, syScale);
    this.#beamSprite2.setScale(sxScale, syScale);
  }

  /** Mana drain ticker. Also clears the per-tick hit dedupe set AND rotates
   *  the per-tick spellId so the server's dedupe-by-spellId logic doesn't
   *  collapse every tick into the same hit (channelled spells need a fresh
   *  spellId every tick for damage to land more than once). */
  #onDrainTick(): void {
    if (!this.active) return;
    if (this.#manaComponent) {
      if (this.#manaComponent.mana < LIGHTNING_BEAM_MANA_PER_TICK) {
        this.destroy();
        return;
      }
      this.#manaComponent.consume(LIGHTNING_BEAM_MANA_PER_TICK);
    }
    this.#hitThisTick.clear();
    // Rotate the tick spellId — same shape as electrified-puddle's per-strike id.
    // GameScene's cross-player lightning handler reads this via getData('spellId').
    const tickId = `lbeam-${Math.random().toString(36).slice(2, 10)}-${this.scene.time.now}`;
    this.setData('spellId', tickId);
  }

  /**
   * Re-roll the visual chaos: random flips on each layer, a small angle jitter on the
   * secondary layer (so the two beams don't move in lockstep), and an optional forked
   * sub-beam that branches off the main beam at a random angle.
   */
  #onJitterTick(): void {
    if (!this.active) return;

    // Random per-layer flips — flipping mirrors the sprite's content, which on these
    // sheets reads as a different bolt shape every roll.
    if (Math.random() < LIGHTNING_BEAM_FLIP_CHANCE) {
      this.#beamSprite1.setFlipY(Math.random() < 0.5);
    }
    if (Math.random() < LIGHTNING_BEAM_FLIP_CHANCE) {
      this.#beamSprite2.setFlipY(Math.random() < 0.5);
    }
    // Occasional X-flip on the secondary layer for extra desync.
    if (Math.random() < LIGHTNING_BEAM_FLIP_CHANCE * 0.5) {
      this.#beamSprite2.setFlipX(Math.random() < 0.5);
    }

    // Small angle jitter on the secondary layer only — keeps the dominant beam stable
    // while the secondary "crackles" around it.
    const jitter = (Math.random() - 0.5) * 2 * LIGHTNING_BEAM_ANGLE_JITTER_RAD;
    this.#beamSprite2.setRotation(jitter);

    // Forked sub-beam. Hide by default; reveal + reposition on a passed roll.
    if (Math.random() < LIGHTNING_BEAM_FORK_CHANCE) {
      const forkAngle = (Math.random() - 0.5) * 2 * LIGHTNING_BEAM_FORK_ANGLE_RAD;
      const forkLen = this.#length * LIGHTNING_BEAM_FORK_LENGTH_RATIO;
      // Fork origin: somewhere along the main beam (15%..70% out from the hand) so
      // it reads as branching off mid-beam rather than from the hand itself.
      const forkStartX = this.#length * (0.15 + Math.random() * 0.55);
      this.#forkSprite.setPosition(forkStartX, 0);
      this.#forkSprite.setRotation(forkAngle);
      this.#forkSprite.setScale(
        forkLen / this.#forkSprite.width,
        (LIGHTNING_BEAM_DISPLAY_HEIGHT_PX * 0.55) / this.#forkSprite.height,
      );
      this.#forkSprite.setFlipY(Math.random() < 0.5);
      this.#forkSprite.setVisible(true);
      this.#forkSprite.setAlpha(0.85);
    } else {
      this.#forkSprite.setVisible(false);
    }
  }

  /** Draw / clear the rotated-rectangle hitbox overlay based on arcade debug state. */
  #updateDebugOverlay(): void {
    this.#debugGfx.clear();
    if (!this.scene.physics?.world?.drawDebug) return;
    // Drawn in local container space: beam-aligned rect from (0, -H/2) to (LENGTH, H/2).
    // Container's rotation handles the world-space orientation.
    this.#debugGfx.lineStyle(1, 0x00ff00, 1);
    this.#debugGfx.strokeRect(0, -LIGHTNING_BEAM_HEIGHT_PX / 2, this.#length, LIGHTNING_BEAM_HEIGHT_PX);
    // Tiny pivot marker so you can visually confirm the hand offset alignment.
    this.#debugGfx.fillStyle(0xff0000, 1);
    this.#debugGfx.fillCircle(0, 0, 1.5);
  }

  /**
   * Rotated-rectangle hit test (world coords → beam-local frame). True iff (x, y)
   * lies inside the LENGTH × HEIGHT rectangle anchored at the beam's pivot and
   * pointing along the aim direction.
   */
  public isPointInBeam(x: number, y: number): boolean {
    const cos = Math.cos(this.#angle);
    const sin = Math.sin(this.#angle);
    const dx = x - this.x;
    const dy = y - this.y;
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;
    if (localX < 0 || localX > this.#length) return false;
    if (Math.abs(localY) > LIGHTNING_BEAM_HEIGHT_PX / 2) return false;
    return true;
  }

  public get hitThisTickSet(): Set<unknown> {
    return this.#hitThisTick;
  }

  public get aimDirection(): Direction {
    if (Math.abs(Math.cos(this.#angle)) >= Math.abs(Math.sin(this.#angle))) {
      return Math.cos(this.#angle) >= 0 ? DIRECTION.RIGHT : DIRECTION.LEFT;
    }
    return Math.sin(this.#angle) >= 0 ? DIRECTION.DOWN : DIRECTION.UP;
  }
}

registerSpell(SPELL_ID.LIGHTNING_BEAM, (scene, cx, cy, tx, ty, dir, caster) => {
  // Detect remote replicas: GameScene exposes `player` as the local Player; if
  // `caster` is anything else (a remote Player) the beam must skip the local
  // mouse gate and use externally-supplied aim updates instead.
  const localPlayer = (scene as unknown as { player?: unknown }).player;
  const isRemote = caster !== undefined && caster !== (localPlayer as unknown);
  return new LightningBeam(scene, cx, cy, tx, ty, dir, caster, isRemote);
});
