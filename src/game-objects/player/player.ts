import * as Phaser from 'phaser';
import { GameObject, Position } from '../../common/types';
import { InputComponent } from '../../components/input/input-component';
import { IdleState } from '../../components/state-machine/states/character/idle-state';
import { CHARACTER_STATES } from '../../components/state-machine/states/character/character-states';
import { MoveState } from '../../components/state-machine/states/character/move-state';
import {
  PLAYER_HURT_PUSH_BACK_SPEED,
  PLAYER_INVULNERABLE_AFTER_HIT_DURATION,
  PLAYER_SPEED,
  PLAYER_MAX_MANA,
  PLAYER_MANA_REGEN_RATE,
} from '../../common/config';
import { AnimationConfig } from '../../components/game-object/animation-component';
import { ASSET_KEYS, PLAYER_ANIMATION_KEYS } from '../../common/assets';
import { CharacterGameObject } from '../common/character-game-object';
import { DIRECTION } from '../../common/common';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { HurtState } from '../../components/state-machine/states/character/hurt-state';
import { flash } from '../../common/juice-utils';
import { DeathState } from '../../components/state-machine/states/character/death-state';
import { CollidingObjectsComponent } from '../../components/game-object/colliding-objects-component';
import { LiftState } from '../../components/state-machine/states/character/lift-state';
import { OpenChestState } from '../../components/state-machine/states/character/open-chest-state';
import { IdleHoldingState } from '../../components/state-machine/states/character/idle-holding-state';
import { MoveHoldingState } from '../../components/state-machine/states/character/move-holding-state';
import { HeldGameObjectComponent } from '../../components/game-object/held-game-object-component';
import { ThrowState } from '../../components/state-machine/states/character/throw-state';
import { CastingState } from '../../components/state-machine/states/character/casting-state';
import { ManaComponent } from '../../components/game-object/mana-component';
import { SpellCastingComponent } from '../../components/game-object/spell-casting-component';

export type PlayerConfig = {
  scene: Phaser.Scene;
  position: Position;
  controls: InputComponent;
  maxLife: number;
  currentLife: number;
  /** Optional hex color tint. 0xffffff = untinted (default). */
  tintColor?: number;
};

export class Player extends CharacterGameObject {
  #collidingObjectsComponent: CollidingObjectsComponent;
  #manaComponent: ManaComponent;
  #spellCastingComponent: SpellCastingComponent;

  // Phase 9.3 — Dash state (D-13/14, RESEARCH.md §3)
  public iFrameUntil: number = 0;
  public isDashing: boolean = false;
  #lastDashTime: number = -Infinity;

  constructor(config: PlayerConfig) {
    // create animation config for component
    const animationConfig: AnimationConfig = {
      WALK_DOWN: { key: PLAYER_ANIMATION_KEYS.WALK_DOWN, repeat: -1, ignoreIfPlaying: true },
      WALK_UP: { key: PLAYER_ANIMATION_KEYS.WALK_UP, repeat: -1, ignoreIfPlaying: true },
      WALK_LEFT: { key: PLAYER_ANIMATION_KEYS.WALK_SIDE, repeat: -1, ignoreIfPlaying: true },
      WALK_RIGHT: { key: PLAYER_ANIMATION_KEYS.WALK_SIDE, repeat: -1, ignoreIfPlaying: true },
      IDLE_DOWN: { key: PLAYER_ANIMATION_KEYS.IDLE_DOWN, repeat: -1, ignoreIfPlaying: true },
      IDLE_UP: { key: PLAYER_ANIMATION_KEYS.IDLE_UP, repeat: -1, ignoreIfPlaying: true },
      IDLE_LEFT: { key: PLAYER_ANIMATION_KEYS.IDLE_SIDE, repeat: -1, ignoreIfPlaying: true },
      IDLE_RIGHT: { key: PLAYER_ANIMATION_KEYS.IDLE_SIDE, repeat: -1, ignoreIfPlaying: true },
      HURT_DOWN: { key: PLAYER_ANIMATION_KEYS.HURT_DOWN, repeat: 0, ignoreIfPlaying: true },
      HURT_UP: { key: PLAYER_ANIMATION_KEYS.HURT_UP, repeat: 0, ignoreIfPlaying: true },
      HURT_LEFT: { key: PLAYER_ANIMATION_KEYS.HURT_SIDE, repeat: 0, ignoreIfPlaying: true },
      HURT_RIGHT: { key: PLAYER_ANIMATION_KEYS.HURT_SIDE, repeat: 0, ignoreIfPlaying: true },
      DIE_DOWN: { key: PLAYER_ANIMATION_KEYS.DIE_DOWN, repeat: 0, ignoreIfPlaying: true },
      DIE_UP: { key: PLAYER_ANIMATION_KEYS.DIE_UP, repeat: 0, ignoreIfPlaying: true },
      DIE_LEFT: { key: PLAYER_ANIMATION_KEYS.DIE_SIDE, repeat: 0, ignoreIfPlaying: true },
      DIE_RIGHT: { key: PLAYER_ANIMATION_KEYS.DIE_SIDE, repeat: 0, ignoreIfPlaying: true },
      IDLE_HOLD_DOWN: { key: PLAYER_ANIMATION_KEYS.IDLE_HOLD_DOWN, repeat: -1, ignoreIfPlaying: true },
      IDLE_HOLD_UP: { key: PLAYER_ANIMATION_KEYS.IDLE_HOLD_UP, repeat: -1, ignoreIfPlaying: true },
      IDLE_HOLD_LEFT: { key: PLAYER_ANIMATION_KEYS.IDLE_HOLD_SIDE, repeat: -1, ignoreIfPlaying: true },
      IDLE_HOLD_RIGHT: { key: PLAYER_ANIMATION_KEYS.IDLE_HOLD_SIDE, repeat: -1, ignoreIfPlaying: true },
      WALK_HOLD_DOWN: { key: PLAYER_ANIMATION_KEYS.WALK_HOLD_DOWN, repeat: -1, ignoreIfPlaying: true },
      WALK_HOLD_UP: { key: PLAYER_ANIMATION_KEYS.WALK_HOLD_UP, repeat: -1, ignoreIfPlaying: true },
      WALK_HOLD_LEFT: { key: PLAYER_ANIMATION_KEYS.WALK_HOLD_SIDE, repeat: -1, ignoreIfPlaying: true },
      WALK_HOLD_RIGHT: { key: PLAYER_ANIMATION_KEYS.WALK_HOLD_SIDE, repeat: -1, ignoreIfPlaying: true },
      LIFT_DOWN: { key: PLAYER_ANIMATION_KEYS.LIFT_DOWN, repeat: 0, ignoreIfPlaying: true },
      LIFT_UP: { key: PLAYER_ANIMATION_KEYS.LIFT_UP, repeat: 0, ignoreIfPlaying: true },
      LIFT_LEFT: { key: PLAYER_ANIMATION_KEYS.LIFT_SIDE, repeat: 0, ignoreIfPlaying: true },
      LIFT_RIGHT: { key: PLAYER_ANIMATION_KEYS.LIFT_SIDE, repeat: 0, ignoreIfPlaying: true },
    };

    super({
      scene: config.scene,
      position: config.position,
      assetKey: ASSET_KEYS.PLAYER,
      frame: 0,
      id: 'player',
      isPlayer: true,
      animationConfig,
      speed: PLAYER_SPEED,
      inputComponent: config.controls,
      isInvulnerable: false,
      invulnerableAfterHitAnimationDuration: PLAYER_INVULNERABLE_AFTER_HIT_DURATION,
      maxLife: config.maxLife,
      currentLife: config.currentLife,
    });

    // Apply team color tint for multiplayer remote players
    if (config.tintColor !== undefined && config.tintColor !== 0xffffff) {
      this.setTint(config.tintColor);
    }

    // add state machine
    this._stateMachine.addState(new IdleState(this));    this._stateMachine.addState(new MoveState(this));
    this._stateMachine.addState(
      new HurtState(this, PLAYER_HURT_PUSH_BACK_SPEED, () => {
        flash(this);
      }),
    );
    this._stateMachine.addState(new DeathState(this));
    this._stateMachine.addState(new LiftState(this));
    this._stateMachine.addState(new OpenChestState(this));
    this._stateMachine.addState(new IdleHoldingState(this));
    this._stateMachine.addState(new MoveHoldingState(this));
    this._stateMachine.addState(new ThrowState(this));
    this._stateMachine.addState(new CastingState(this));
    this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);

    // add components
    this.#collidingObjectsComponent = new CollidingObjectsComponent(this);
    new HeldGameObjectComponent(this);
    this.#manaComponent = new ManaComponent(this, PLAYER_MAX_MANA, PLAYER_MANA_REGEN_RATE);
    this.#spellCastingComponent = new SpellCastingComponent(this, this.#manaComponent);

    // enable auto update functionality
    config.scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    config.scene.events.once(
      Phaser.Scenes.Events.SHUTDOWN,
      () => {
        config.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
      },
      this,
    );

    // update physics body - aligned to bottom of 32x32 virtual frame (16x16 char at bottom)
    this.physicsBody.setSize(12, 14, true).setOffset(this.width / 2 - 6, this.height - 15);
  }

  get physicsBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  get manaComponent(): ManaComponent {
    return this.#manaComponent;
  }

  get spellCastingComponent(): SpellCastingComponent {
    return this.#spellCastingComponent;
  }

  public collidedWithGameObject(gameObject: GameObject): void {
    this.#collidingObjectsComponent.add(gameObject);
  }

  public update(): void {
    super.update();
    this.#collidingObjectsComponent.reset();
    // update mana regen
    const delta = this.scene.game.loop.delta;
    this.#manaComponent.update(delta);
  }

  /**
   * Phase 9.3 — Dash (D-13/14, RESEARCH.md §3).
   * Uses body.setVelocity + delayedCall (NOT a tween) so wall collisions interrupt the motion
   * naturally without tunneling. Direction = current WASD vector, fallback to last-faced direction.
   */
  public dash(): void {
    const cfg = RUNTIME_CONFIG;
    const now = this.scene.time.now;
    if (now - this.#lastDashTime < cfg.DASH_COOLDOWN_MS) return;

    // Direction vector (D-14): WASD first, fallback to last-faced direction.
    let dx = 0;
    let dy = 0;
    if (this.controls.isLeftDown) dx -= 1;
    if (this.controls.isRightDown) dx += 1;
    if (this.controls.isUpDown) dy -= 1;
    if (this.controls.isDownDown) dy += 1;

    if (dx === 0 && dy === 0) {
      if (this.direction === DIRECTION.LEFT) dx = -1;
      else if (this.direction === DIRECTION.RIGHT) dx = 1;
      else if (this.direction === DIRECTION.UP) dy = -1;
      else dy = 1;
    }

    const len = Math.hypot(dx, dy) || 1;

    // Cast-cancel (D-13): pressing Shift mid-cast aborts the cast.
    if (
      cfg.DASH_CANCELS_CAST &&
      this.stateMachine.currentStateName === CHARACTER_STATES.CASTING_STATE
    ) {
      this.stateMachine.setState(CHARACTER_STATES.IDLE_STATE);
    }

    // TILE_SIZE = 32 (project-wide; no exported constant).
    const TILE_SIZE = 32;
    const speed = (cfg.DASH_DISTANCE_TILES * TILE_SIZE) / (cfg.DASH_DURATION_MS / 1000);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity((dx / len) * speed, (dy / len) * speed);

    this.isDashing = true;
    // Gate MoveState velocity overwrite (RESEARCH.md §3 landmine 1).
    this.controls.isMovementLocked = true;
    this.#lastDashTime = now;

    if (cfg.DASH_IFRAMES_ENABLED) {
      this.iFrameUntil = now + cfg.DASH_IFRAMES_MS;
    }

    // End dash: zero velocity, unlock movement, clear dashing flag.
    this.scene.time.delayedCall(cfg.DASH_DURATION_MS, () => {
      // Guard against player being destroyed mid-dash (e.g. respawn).
      if (!this.active || !this.body) return;
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.isDashing = false;
      this.controls.isMovementLocked = false;
    });
  }
}
