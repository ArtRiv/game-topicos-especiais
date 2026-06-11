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

  // TDM death-card upgrades (Tough Skin / Titan Heart): raise/lower the max. Current life is
  // clamped to the new max but NOT auto-healed — healing comes from the server's authoritative
  // HP values (respawn restores to the new full; damage:confirmed carries targetHp/maxHp).
  public setMaxLife(value: number): void {
    this.#maxLife = Math.max(1, value);
    this.#currentLife = Math.min(this.#currentLife, this.#maxLife);
  }

  // Phase 14 bugfix (TDM server-authoritative HP): hard-set current life to an absolute value,
  // clamped to [0, maxLife]. Unlike takeDamage()/heal() this neither subtracts nor respects the
  // "already dead" guard — it mirrors the server's authoritative post-hit HP onto the client so
  // the two never drift (the cause of the "stuck at half a heart" desync). Reviving from 0 is
  // allowed; the respawn flow still uses resetToFull().
  public setLife(value: number): void {
    this.#currentLife = Math.max(0, Math.min(this.#maxLife, value));
  }
}
