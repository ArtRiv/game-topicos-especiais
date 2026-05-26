import * as Phaser from 'phaser';
import { CustomGameObject, Direction, Position } from '../../common/types';
import { InputComponent } from '../../components/input/input-component';
import { ControlsComponent } from '../../components/game-object/controls-component';
import { StateMachine } from '../../components/state-machine/state-machine';
import { SpeedComponent } from '../../components/game-object/speed-component';
import { DirectionComponent } from '../../components/game-object/direction-component';
import { AnimationComponent, AnimationConfig } from '../../components/game-object/animation-component';
import { InvulnerableComponent } from '../../components/game-object/invulnerable-component';
import { CHARACTER_STATES } from '../../components/state-machine/states/character/character-states';
import { LifeComponent } from '../../components/game-object/life-component';
import { DataManager } from '../../common/data-manager';
import { WeaponComponent } from '../../components/game-object/weapon-component';

export type CharacterConfig = {
  scene: Phaser.Scene;
  position: Position;
  assetKey: string;
  frame?: number;
  inputComponent: InputComponent;
  animationConfig: AnimationConfig;
  speed: number;
  id?: string;
  isPlayer: boolean;
  isInvulnerable?: boolean;
  invulnerableAfterHitAnimationDuration?: number;
  maxLife: number;
  currentLife?: number;
};

export abstract class CharacterGameObject extends Phaser.Physics.Arcade.Sprite implements CustomGameObject {
  protected _controlsComponent: ControlsComponent;
  protected _speedComponent: SpeedComponent;
  protected _directionComponent: DirectionComponent;
  protected _animationComponent: AnimationComponent;
  protected _invulnerableComponent: InvulnerableComponent;
  protected _lifeComponent: LifeComponent;
  protected _stateMachine: StateMachine;
  protected _isPlayer: boolean;
  protected _isDefeated: boolean;
  // ── Movement-control effects ──────────────────────────────────────────────
  // Slow multiplier — multiplied into body.velocity each tick. 1 = no slow,
  // 0.5 = half speed, 0 = effectively snared (but snare uses the timestamp
  // below instead so it auto-clears). Sources (mud puddles etc.) recompute
  // this each frame in GameScene — they DON'T accumulate, the value is
  // overwritten — so just reset to 1 when no source applies.
  #movementMultiplier: number = 1;
  // Snare deadline — scene.time.now must be < this to be snared. Zero means
  // no snare. Driven by `applyMovementSnare(durationMs)`; auto-expires by
  // time check, no explicit cleanup needed (no timer = nothing to leak on
  // destroy). Snare only zeroes movement velocity; casting still works.
  #snareUntilMs: number = 0;
  // True while the character is mid-air (e.g. Player.dashSuper). Read by
  // GameScene's hazard-puddle scanner to skip mud/lava slow + lava tick
  // damage — the mage is jumping over them. Player owns the flag; remote
  // players + enemies leave it at false.
  public isFlying: boolean = false;

  constructor(config: CharacterConfig) {
    const {
      scene,
      position,
      assetKey,
      frame,
      speed,
      animationConfig,
      inputComponent,
      id,
      isPlayer,
      invulnerableAfterHitAnimationDuration,
      isInvulnerable,
      maxLife,
      currentLife,
    } = config;
    const { x, y } = position;
    super(scene, x, y, assetKey, frame || 0);

    // add object to scene and enable phaser physics
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // add shared components
    this._controlsComponent = new ControlsComponent(this, inputComponent);
    this._speedComponent = new SpeedComponent(this, speed);
    this._directionComponent = new DirectionComponent(this);
    this._animationComponent = new AnimationComponent(this, animationConfig);
    this._invulnerableComponent = new InvulnerableComponent(
      this,
      isInvulnerable || false,
      invulnerableAfterHitAnimationDuration,
    );
    this._lifeComponent = new LifeComponent(this, maxLife, currentLife);

    // create state machine
    this._stateMachine = new StateMachine(id);

    // general config
    this._isPlayer = isPlayer;
    this._isDefeated = false;
    if (!this._isPlayer) {
      this.disableObject();
    }
  }

  get isDefeated(): boolean {
    return this._isDefeated;
  }

  get isEnemy(): boolean {
    return !this._isPlayer;
  }

  get controls(): InputComponent {
    return this._controlsComponent.controls;
  }

  get speed(): number {
    return this._speedComponent.speed;
  }

  get direction(): Direction {
    return this._directionComponent.direction;
  }

  set direction(value: Direction) {
    this._directionComponent.direction = value;
  }

  get animationComponent(): AnimationComponent {
    return this._animationComponent;
  }

  get invulnerableComponent(): InvulnerableComponent {
    return this._invulnerableComponent;
  }

  get stateMachine(): StateMachine {
    return this._stateMachine;
  }

  // Phase 9.3 (Plan 03): exposed so the host-authoritative damage pipeline can apply
  // confirmed damage / full restore to both local + remote players without subclassing.
  get lifeComponent(): LifeComponent {
    return this._lifeComponent;
  }

  public update(): void {
    this._stateMachine.update();
    // Keep depth in sync with Y so entities lower on screen render in front
    this.setDepth(this.y);

    // Apply movement-control effects (snare > slow) AFTER the state machine
    // has set velocity for this frame. Doing it here means every state
    // benefits without having to bake the multiplier into individual states'
    // velocity-setting code. Snare wins over slow — a snared character is
    // pinned, not just slow.
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      // Knockback wins over snare/slow — overrides any velocity the state
      // machine just wrote (e.g. HurtState's reset + smaller pushback).
      if (this.isKnockedBack()) {
        body.setVelocity(this.#knockbackVx, this.#knockbackVy);
      } else if (this.isMovementSnared()) {
        body.setVelocity(0, 0);
      } else if (this.#movementMultiplier !== 1) {
        body.setVelocity(
          body.velocity.x * this.#movementMultiplier,
          body.velocity.y * this.#movementMultiplier,
        );
      }
    }
  }

  /** Set the per-frame movement multiplier. Anything ≠1 scales `body.velocity`
   *  in `update()`. Call once per frame from the slow-source detection loop
   *  (e.g. GameScene's mud-puddle overlap check): pass the strongest applicable
   *  multiplier, or `1` to clear. */
  public setMovementMultiplier(m: number): void {
    this.#movementMultiplier = m;
  }

  public getMovementMultiplier(): number {
    return this.#movementMultiplier;
  }

  /** Root the character in place for `durationMs`. Stacks LONGER — if a
   *  fresh snare's deadline is earlier than the existing one, the existing
   *  one wins (keeps the player's "worst case" snare time). Casting and
   *  other actions are unaffected — only movement velocity is zeroed. */
  public applyMovementSnare(durationMs: number): void {
    const until = this.scene.time.now + durationMs;
    if (until > this.#snareUntilMs) this.#snareUntilMs = until;
  }

  public isMovementSnared(): boolean {
    return this.scene.time.now < this.#snareUntilMs;
  }

  /** Force-clear any active snare. Use sparingly — normally the timestamp
   *  expires on its own. Useful for state transitions (e.g. respawn) where
   *  lingering snare from a prior life shouldn't carry over. */
  public clearMovementSnare(): void {
    this.#snareUntilMs = 0;
  }

  // Active knockback state — read every frame in update() so the velocity
  // survives HurtState's _resetObjectVelocity() / move-state writes. Without
  // this, the bigger knockback was being clobbered by HurtState's smaller
  // pushback the instant damage:confirmed arrived, so EarthBump looked like
  // it only ever did damage.
  #knockbackUntilMs: number = 0;
  #knockbackVx: number = 0;
  #knockbackVy: number = 0;

  /**
   * Apply a directional knockback to this character. Pins body velocity in the
   * given direction every frame until `durationMs` elapses. Survives any
   * intermediate state-machine writes to velocity (e.g. HurtState's tiny
   * pushback that would otherwise clobber the bigger force). Independent of
   * HurtState's pushback — does NOT change state machine state, so the
   * character can still cast / move once the timer expires. Stacks longest:
   * a longer-running knockback overrides a shorter one mid-flight.
   */
  public applyKnockback(direction: Direction, force: number, durationMs: number): void {
    if (this._isDefeated) return;
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    let vx = 0;
    let vy = 0;
    switch (direction) {
      case 'LEFT':  vx = -force; break;
      case 'RIGHT': vx = force;  break;
      case 'UP':    vy = -force; break;
      case 'DOWN':
      default:      vy = force;
    }
    const newUntil = this.scene.time.now + durationMs;
    // Stack-longest: keep the later deadline if a longer knockback fires mid-flight.
    if (newUntil > this.#knockbackUntilMs) {
      this.#knockbackUntilMs = newUntil;
      this.#knockbackVx = vx;
      this.#knockbackVy = vy;
    }
    body.setVelocity(vx, vy);
  }

  /** True iff a knockback applied via applyKnockback is still active. */
  public isKnockedBack(): boolean {
    return this.scene.time.now < this.#knockbackUntilMs;
  }

  public hit(direction: Direction, damage: number): void {
    if (this._isDefeated) {
      return;
    }

    // Star Shield: total damage immunity while the bubble is active. The
    // Player subclass owns the flag; checked via duck-typing so this base
    // class doesn't have to import Player.
    if ((this as unknown as { isStarShieldActive?: boolean }).isStarShieldActive) {
      return;
    }

    // check if character is invulnerable, if not update state to be hurt
    if (this._invulnerableComponent.invulnerable) {
      return;
    }

    // have character take damage and see if the character has died
    this._lifeComponent.takeDamage(damage);
    if (this._isPlayer) {
      DataManager.instance.updatePlayerCurrentHealth(this._lifeComponent.life);
    }
    if (this._lifeComponent.life === 0) {
      this._isDefeated = true;
      this._stateMachine.setState(CHARACTER_STATES.DEATH_STATE, direction);
      return;
    }

    this._stateMachine.setState(CHARACTER_STATES.HURT_STATE, direction);
  }

  public disableObject(): void {
    // disable body on game object so we stop triggering the collision
    (this.body as Phaser.Physics.Arcade.Body).enable = false;

    // make not active and not visible until player re-enters room
    this.active = false;
    if (!this._isPlayer) {
      this.visible = false;
    }

    const weaponComponent = WeaponComponent.getComponent<WeaponComponent>(this);
    if (weaponComponent !== undefined && weaponComponent.weapon !== undefined && weaponComponent.weapon.isAttacking) {
      weaponComponent.weapon.onCollisionCallback();
    }
  }

  public enableObject(): void {
    if (this._isDefeated) {
      return;
    }

    (this.body as Phaser.Physics.Arcade.Body).enable = true;
    this.active = true;
    this.visible = true;
  }
}
