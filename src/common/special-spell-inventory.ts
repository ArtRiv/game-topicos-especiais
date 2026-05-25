import { CUSTOM_EVENTS, EVENT_BUS, SpecialSpellChargesChangedData } from './event-bus';

/**
 * Tracks the player's CURRENT special spell — pickup-granted spells that aren't
 * bound to any element (e.g. VoidOrb, DarkBolt). The player can only hold ONE
 * special at a time; walking over a new pickup REPLACES whatever was active
 * (charges and all).
 *
 * Singleton because the slot is per-local-player and persists across scene
 * restarts (e.g. dungeon → world transition).
 */
export class SpecialSpellInventory {
  static #instance: SpecialSpellInventory;

  #activeSpellId: string | null = null;
  #charges: number = 0;

  private constructor() { /* pickups set the slot at runtime */ }

  public static get instance(): SpecialSpellInventory {
    if (!SpecialSpellInventory.#instance) {
      SpecialSpellInventory.#instance = new SpecialSpellInventory();
    }
    return SpecialSpellInventory.#instance;
  }

  /** What special spell is currently equipped (null if none). */
  public get activeSpellId(): string | null {
    return this.#activeSpellId;
  }

  /** Charges left on the current spell (0 if no spell). */
  public get charges(): number {
    return this.#charges;
  }

  /**
   * Set the active spell, REPLACING whatever was previously equipped. Called by
   * a pickup when collected. Always emits SPECIAL_SPELL_CHARGES_CHANGED so the
   * HUD swaps its icon to match.
   */
  public setActive(spellId: string, charges: number): void {
    this.#activeSpellId = spellId;
    this.#charges = Math.max(0, charges);
    this.#emit();
  }

  /** Try to spend one charge of the active spell. Returns false if nothing equipped
   *  or no charges left. When the LAST charge is spent the slot self-clears. */
  public tryConsume(): boolean {
    if (this.#activeSpellId === null || this.#charges <= 0) return false;
    this.#charges -= 1;
    if (this.#charges === 0) this.#activeSpellId = null;
    this.#emit();
    return true;
  }

  /** Wipe the slot (e.g. on round reset / new match). */
  public reset(): void {
    if (this.#activeSpellId === null && this.#charges === 0) return;
    this.#activeSpellId = null;
    this.#charges = 0;
    this.#emit();
  }

  #emit(): void {
    const data: SpecialSpellChargesChangedData = {
      spellId: this.#activeSpellId,
      charges: this.#charges,
    };
    EVENT_BUS.emit(CUSTOM_EVENTS.SPECIAL_SPELL_CHARGES_CHANGED, data);
  }
}
