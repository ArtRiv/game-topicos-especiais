import { InputComponent } from '../input/input-component.js';
import type { PlayerUpdateBroadcast } from '../../networking/types.js';

export type RemotePlayerSnapshot = {
  x: number;
  y: number;
  direction: string;
  state: string;
  element: string;
  flipX: boolean;
};

/**
 * RemoteInputComponent — drives a remote player's CharacterGameObject from
 * server-delivered position snapshots.
 *
 * Movement is ALWAYS locked (no local keyboard input).
 * The GameScene reads `getSnapshot()` and applies x/y directly on the sprite
 * each frame, reconciling with the state machine animation.
 */
export class RemoteInputComponent extends InputComponent {
  #snapshot: RemotePlayerSnapshot | null = null;
  #targetX = 0;
  #targetY = 0;
  #targetDirection = '';
  #targetState = '';
  #targetFlipX = false;
  #hasTarget = false;

  constructor() {
    super();
    this.isMovementLocked = true;
  }

  /** Called by NetworkManager when a game:player-update arrives for this player */
  applySnapshot(data: Pick<PlayerUpdateBroadcast, 'x' | 'y' | 'direction' | 'state' | 'element' | 'flipX'>): void {
    this.#snapshot = {
      x: data.x,
      y: data.y,
      direction: data.direction,
      state: data.state,
      element: data.element,
      flipX: data.flipX ?? false,
    };
    this.#targetX = data.x;
    this.#targetY = data.y;
    this.#targetDirection = data.direction;
    this.#targetState = data.state;
    this.#targetFlipX = data.flipX ?? false;
    this.#hasTarget = true;
  }

  /** Returns the last received snapshot, or null if none received yet */
  getSnapshot(): RemotePlayerSnapshot | null {
    return this.#snapshot;
  }

  /** Returns interpolation target for per-frame lerp in GameScene.update() */
  getTarget(): { x: number; y: number; direction: string; state: string; flipX: boolean; hasTarget: boolean } {
    return {
      x: this.#targetX,
      y: this.#targetY,
      direction: this.#targetDirection,
      state: this.#targetState,
      flipX: this.#targetFlipX,
      hasTarget: this.#hasTarget,
    };
  }
}
