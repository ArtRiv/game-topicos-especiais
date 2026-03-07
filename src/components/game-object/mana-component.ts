import { GameObject } from '../../common/types';
import { CUSTOM_EVENTS, EVENT_BUS } from '../../common/event-bus';
import { BaseGameObjectComponent } from './base-game-object-component';

export type ManaUpdatedData = {
  currentMana: number;
  maxMana: number;
};

export class ManaComponent extends BaseGameObjectComponent {
  #maxMana: number;
  #currentMana: number;
  #regenRate: number; // per second
  #regenAccumulator: number;

  constructor(gameObject: GameObject, maxMana: number, regenRate: number, currentMana?: number) {
    super(gameObject);
    this.#maxMana = maxMana;
    this.#currentMana = currentMana ?? maxMana;
    this.#regenRate = regenRate;
    this.#regenAccumulator = 0;
  }

  get mana(): number {
    return this.#currentMana;
  }

  get maxMana(): number {
    return this.#maxMana;
  }

  get manaPercent(): number {
    return this.#currentMana / this.#maxMana;
  }

  public consume(amount: number): boolean {
    if (this.#currentMana < amount) {
      return false;
    }
    this.#currentMana -= amount;
    this.#emitUpdate();
    return true;
  }

  public restore(amount: number): void {
    this.#currentMana = Math.min(this.#currentMana + amount, this.#maxMana);
    this.#emitUpdate();
  }

  public update(deltaMs: number): void {
    if (this.#currentMana >= this.#maxMana) {
      return;
    }
    this.#regenAccumulator += deltaMs;
    const regenInterval = 1000; // regen every second
    if (this.#regenAccumulator >= regenInterval) {
      const ticks = Math.floor(this.#regenAccumulator / regenInterval);
      this.#regenAccumulator -= ticks * regenInterval;
      const amount = this.#regenRate * ticks;
      this.#currentMana = Math.min(this.#currentMana + amount, this.#maxMana);
      this.#emitUpdate();
    }
  }

  #emitUpdate(): void {
    const data: ManaUpdatedData = {
      currentMana: this.#currentMana,
      maxMana: this.#maxMana,
    };
    EVENT_BUS.emit(CUSTOM_EVENTS.MANA_UPDATED, data);
  }
}
