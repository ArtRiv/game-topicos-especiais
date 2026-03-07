import { CharacterGameObject } from '../../../../game-objects/common/character-game-object';
import { SpellCastingComponent } from '../../../game-object/spell-casting-component';
import { BaseCharacterState } from './base-character-state';
import { CHARACTER_STATES } from './character-states';

export class CastingState extends BaseCharacterState {
  #spellSlotIndex: number;
  #castComplete: boolean;

  constructor(gameObject: CharacterGameObject) {
    super(CHARACTER_STATES.CASTING_STATE, gameObject);
    this.#spellSlotIndex = 0;
    this.#castComplete = false;
  }

  public onEnter(args: unknown[]): void {
    this._resetObjectVelocity();

    // args[0] is the spell slot index, args[1] is targetX, args[2] is targetY
    this.#spellSlotIndex = (args[0] as number) ?? 0;
    const targetX = args[1] as number;
    const targetY = args[2] as number;
    this.#castComplete = false;

    // play idle animation while casting (instantaneous cast per spec)
    this._gameObject.animationComponent.playAnimation(`IDLE_${this._gameObject.direction}`);

    const spellComponent = SpellCastingComponent.getComponent<SpellCastingComponent>(this._gameObject);
    if (spellComponent === undefined) {
      this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);
      return;
    }

    const spell = spellComponent.castSpell(
      this.#spellSlotIndex,
      this._gameObject.x,
      this._gameObject.y,
      targetX,
      targetY,
    );

    if (spell === undefined) {
      // cast failed (not enough mana, on cooldown)
      this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);
      return;
    }

    this.#castComplete = true;
  }

  public onUpdate(): void {
    // instantaneous cast — go right back to idle
    if (this.#castComplete) {
      this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);
      return;
    }
    this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);
  }
}
