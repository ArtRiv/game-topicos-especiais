import { GameObject } from '../../common/types';
import { BaseGameObjectComponent } from './base-game-object-component';

export class LifeComponent extends BaseGameObjectComponent {
  #maxLife: number;
  #currentLife: number;

  constructor(gameObject: GameObject, maxLife: number, currentLife = maxLife) {
    super(gameObject);
    this.#maxLife = maxLife;
    this.#currentLife = currentLife;
  }

  get life(): number {
    return this.#currentLife;
  }

  get maxLife(): number {
    return this.#maxLife;
  }

  public takeDamage(damage: number): void {
    if (this.#currentLife === 0) {
      return;
    }
    this.#currentLife -= damage;
    if (this.#currentLife < 0) {
      this.#currentLife = 0;
    }
  }

  // Phase 9.3 (Plan 03): partial heal capped at maxLife.
  public heal(amount: number): void {
    this.#currentLife = Math.min(this.#maxLife, this.#currentLife + amount);
  }

  // Phase 9.3 (Plan 03, D-08): full restore used by respawn flow.
  // Bypasses takeDamage's "already dead" guard so we can revive from 0 HP.
  public resetToFull(): void {
    this.#currentLife = this.#maxLife;
  }
}
