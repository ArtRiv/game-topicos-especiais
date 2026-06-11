import { GameObject } from '../../common/types';
import { BaseGameObjectComponent } from './base-game-object-component';

export class SpeedComponent extends BaseGameObjectComponent {
  #speed: number;
  // TDM death-card upgrades (Sprint / Gale Stride): server-synced multiplier on top of the base
  // speed. Kept separate from #speed so snapshot overwrites are idempotent (never compounds).
  #multiplier: number = 1;

  constructor(gameObject: GameObject, speed: number) {
    super(gameObject);
    this.#speed = speed;
  }

  get speed(): number {
    return this.#speed * this.#multiplier;
  }

  set multiplier(value: number) {
    this.#multiplier = value;
  }
}
