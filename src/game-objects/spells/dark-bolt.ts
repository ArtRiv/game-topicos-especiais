import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE, DIRECTION } from '../../common/common';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { LIGHTNING_BURST_COMBO_BODY_RADIUS } from '../../common/config';
import { registerSpell } from './spell-registry';
import type { CharacterGameObject } from '../common/character-game-object';

/**
 * DarkBolt — DARKNESS-element ground orb. Sits on the ground for DARK_BOLT_ORB_HOLD_MS,
 * tick-damages anything inside it, then dissipates.
 *
 * Animation lifecycle (all frames are lightning_burst_003_0..9, tinted dark):
 *   1. Build-up:  0 → HIGH                                   (plays once)
 *   2. Hold loop: HIGH-1 → … → LOW → … → HIGH               (ping-pong, repeats)
 *   3. Dissipate: HIGH+1 → … → 9                            (plays once, hides on complete)
 *
 * LOW and HIGH come from RUNTIME_CONFIG so they can be tuned live via the debug panel.
 * The two per-orb anim keys encode LOW/HIGH so different settings each cache separately
 * in Phaser's anim system — no rebuild cost on subsequent casts with the same range.
 */
type Phase = 'buildup' | 'hold' | 'dissipate';

const LB3 = ASSET_KEYS.LIGHTNING_BURST_003;
const lb3Frame = (i: number): Phaser.Types.Animations.AnimationFrame => ({ key: `${LB3}_${i}` });

/** Lazily creates the per-cast anims for the given LOW/HIGH range. Idempotent. */
function ensureOrbAnims(scene: Phaser.Scene, low: number, high: number): {
  buildup: string;
  loop: string;
  dissipate: string;
} {
  const buildupKey = `DARK_BOLT_BUILDUP_${high}`;
  const loopKey = `DARK_BOLT_LOOP_${low}_${high}`;
  const dissipateKey = `DARK_BOLT_DISSIPATE_${high}`;

  if (!scene.anims.exists(buildupKey)) {
    const frames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = 0; i <= high; i++) frames.push(lb3Frame(i));
    scene.anims.create({ key: buildupKey, frames, frameRate: 18, repeat: 0 });
  }

  if (!scene.anims.exists(loopKey)) {
    // Ping-pong without duplicates: HIGH-1 → LOW (descending), then LOW+1 → HIGH
    // (ascending). When the anim loops, it picks up at HIGH-1 again — seamlessly
    // continuing the bounce. Cycle length is 2*(HIGH-LOW).
    const frames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = high - 1; i >= low; i--) frames.push(lb3Frame(i));
    for (let i = low + 1; i <= high; i++) frames.push(lb3Frame(i));
    scene.anims.create({ key: loopKey, frames, frameRate: 18, repeat: -1 });
  }

  if (!scene.anims.exists(dissipateKey)) {
    const frames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = high + 1; i <= 9; i++) frames.push(lb3Frame(i));
    // If HIGH=9 there are no dissipate frames — anim is a single-frame no-op so the
    // animationcomplete handler still fires and tears the orb down.
    if (frames.length === 0) frames.push(lb3Frame(9));
    scene.anims.create({ key: dissipateKey, frames, frameRate: 12, repeat: 0, hideOnComplete: true });
  }

  return { buildup: buildupKey, loop: loopKey, dissipate: dissipateKey };
}

export class DarkBolt extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.DARKNESS;
  readonly spellId: SpellId = SPELL_ID.DARK_BOLT;
  readonly spellType: SpellType = SPELL_TYPE.AREA;
  readonly manaCost: number = RUNTIME_CONFIG.DARK_BOLT_MANA_COST;
  readonly cooldown: number = RUNTIME_CONFIG.DARK_BOLT_COOLDOWN;

  #phase: Phase = 'buildup';
  #holdTimer: Phaser.Time.TimerEvent | undefined;
  #tickTimer: Phaser.Time.TimerEvent | undefined;
  #enemiesInArea: Set<CharacterGameObject> = new Set();
  #animKeys: { buildup: string; loop: string; dissipate: string };

  get baseDamage(): number {
    return RUNTIME_CONFIG.DARK_BOLT_DAMAGE_PER_TICK;
  }

  get isDamageActive(): boolean {
    return this.#phase !== 'dissipate';
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, `${LB3}_0`);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(3);
    this.setOrigin(0.5, 0.5);
    // No tint: Phaser's setTint multiplies pixel colors by the tint, which collapses
    // the bright white core of the first frame and every white highlight on later
    // frames into the tint color. The lightning_burst_003 frames are already violet
    // on white — leaving them untinted preserves the white center + violet bleed,
    // which reads naturally as a darkness/shadow orb.

    // Clamp config values so misconfiguration can't crash the cast.
    const rawLow = RUNTIME_CONFIG.DARK_BOLT_LOOP_FRAME_LOW;
    const rawHigh = RUNTIME_CONFIG.DARK_BOLT_LOOP_FRAME_HIGH;
    const low = Math.max(0, Math.min(rawLow, 8));
    const high = Math.max(low + 1, Math.min(rawHigh, 9));
    this.#animKeys = ensureOrbAnims(scene, low, high);

    const r = LIGHTNING_BURST_COMBO_BODY_RADIUS;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(r);
    body.setOffset((this.width - r * 2) / 2, (this.height - r * 2) / 2);
    body.setImmovable(true);
    body.setAllowGravity(false);
    body.enable = true;
    body.debugShowBody = true;

    this.play(this.#animKeys.buildup);
    this.once(`animationcomplete-${this.#animKeys.buildup}`, () => this.#enterHold());

    this.#tickTimer = scene.time.addEvent({
      delay: RUNTIME_CONFIG.DARK_BOLT_TICK_INTERVAL,
      callback: this.#applyTickDamage,
      callbackScope: this,
      loop: true,
    });
  }

  /** Called from the GameScene overlap callback for each frame an enemy is inside. */
  public addEnemyInArea(enemy: CharacterGameObject): void {
    this.#enemiesInArea.add(enemy);
  }

  /** Kept for compatibility — legacy projectile collider in GameScene calls this. */
  public explode(): void { /* no-op: orb does not react to walls */ }

  #enterHold(): void {
    if (!this.active) return;
    this.#phase = 'hold';
    this.play(this.#animKeys.loop);

    this.#holdTimer = this.scene.time.delayedCall(RUNTIME_CONFIG.DARK_BOLT_ORB_HOLD_MS, () => {
      this.#enterDissipate();
    });
  }

  #enterDissipate(): void {
    if (!this.active) return;
    this.#phase = 'dissipate';

    this.#tickTimer?.destroy();
    this.#tickTimer = undefined;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    body.debugShowBody = false;

    const dKey = this.#animKeys.dissipate;
    this.play(dKey);
    this.once(`animationcomplete-${dKey}`, () => {
      if (this.active) this.destroy();
    });
  }

  #applyTickDamage(): void {
    if (this.#phase === 'dissipate') return;
    for (const enemy of this.#enemiesInArea) {
      if (!enemy.active || enemy.isDefeated) continue;
      if (this.scene.physics.overlap(this, enemy)) {
        enemy.hit(DIRECTION.DOWN, this.baseDamage);
      }
    }
    // Stale entries (enemies who walked out) accumulate but are filtered by the overlap
    // check each tick. Cleared on destroy.
  }

  public destroy(fromScene?: boolean): void {
    this.#holdTimer?.destroy();
    this.#tickTimer?.destroy();
    this.#enemiesInArea.clear();
    super.destroy(fromScene);
  }
}

registerSpell(SPELL_ID.DARK_BOLT, (scene, _cx, _cy, tx, ty) => new DarkBolt(scene, tx, ty));
