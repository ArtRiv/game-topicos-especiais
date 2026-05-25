import { BaseCharacterState } from './base-character-state';
import { CHARACTER_STATES } from './character-states';
import { CharacterGameObject } from '../../../../game-objects/common/character-game-object';
import { HeldGameObjectComponent } from '../../../game-object/held-game-object-component';
import { ThrowableObjectComponent } from '../../../game-object/throwable-object-component';
import { SPELL_SLOT_REGISTRY } from '../../../../game-objects/spells/spell-registry';
import { ElementManager } from '../../../../common/element-manager';

export class IdleState extends BaseCharacterState {
  constructor(gameObject: CharacterGameObject) {
    super(CHARACTER_STATES.IDLE_STATE, gameObject);
  }

  public onEnter(): void {
    // play idle animation based on game object direction
    this._gameObject.animationComponent.playAnimation(`IDLE_${this._gameObject.direction}`);

    // reset game object velocity
    this._resetObjectVelocity();

    const heldComponent = HeldGameObjectComponent.getComponent<HeldGameObjectComponent>(this._gameObject);
    if (heldComponent !== undefined && heldComponent.object !== undefined) {
      const throwObjectComponent = ThrowableObjectComponent.getComponent<ThrowableObjectComponent>(
        heldComponent.object,
      );
      if (throwObjectComponent !== undefined) {
        throwObjectComponent.drop();
      }
      heldComponent.drop();
    }
  }

  public onUpdate(): void {
    const controls = this._gameObject.controls;

    if (controls.isMovementLocked) {
      return;
    }

    // if spell 1 key was pressed, cast spell from slot 0 — but only if the active
    // element actually has a slot 0 spell. Skipping the transition when slot 0 is
    // null (e.g. EARTH, where left-click is owned by EarthWall draw-mode) avoids a
    // pointless CASTING→IDLE bounce on every click.
    const slots = SPELL_SLOT_REGISTRY[ElementManager.instance.activeElement];
    if (controls.isSpell1KeyJustDown && slots?.[0] != null) {
      this._stateMachine.setState(CHARACTER_STATES.CASTING_STATE, 0, controls.mouseWorldX, controls.mouseWorldY);
      return;
    }

    // if spell 2 key was pressed, cast spell from slot 1
    if (controls.isSpell2KeyJustDown && slots?.[1] != null) {
      this._stateMachine.setState(CHARACTER_STATES.CASTING_STATE, 1, controls.mouseWorldX, controls.mouseWorldY);
      return;
    }

    // Only read isSpell3KeyJustDown when the current element actually has a slot 2 spell.
    // Phaser's JustDown is "consumed" on first read — if idle-state polls it for an
    // element with slot 2 = null (FIRE/EARTH, whose key 3 is owned by GameScene's
    // FireBreath / EarthWall handlers), it eats the just-down event before those
    // handlers can see it. Gating on the slot map keeps the press available downstream.
    if (slots?.[2] != null && controls.isSpell3KeyJustDown) {
      this._stateMachine.setState(CHARACTER_STATES.CASTING_STATE, 2, controls.mouseWorldX, controls.mouseWorldY);
      return;
    }

    // if no other input is provided, do nothing
    if (!controls.isDownDown && !controls.isUpDown && !controls.isLeftDown && !controls.isRightDown) {
      return;
    }

    this._stateMachine.setState(CHARACTER_STATES.MOVE_STATE);
  }
}
