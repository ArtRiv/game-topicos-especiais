import { Element } from './types';
import { ELEMENT } from './common';
import { CUSTOM_EVENTS, ElementChangedData, EVENT_BUS } from './event-bus';

export class ElementManager {
  static #instance: ElementManager;
  #activeElement: Element;

  private constructor() {
    this.#activeElement = ELEMENT.FIRE;
  }

  public static get instance(): ElementManager {
    if (!ElementManager.#instance) {
      ElementManager.#instance = new ElementManager();
    }
    return ElementManager.#instance;
  }

  get activeElement(): Element {
    return this.#activeElement;
  }

  public setElement(element: Element): void {
    if (this.#activeElement === element) return;
    this.#activeElement = element;
    const data: ElementChangedData = { element };
    EVENT_BUS.emit(CUSTOM_EVENTS.ELEMENT_CHANGED, data);
  }

  public reset(): void {
    this.#activeElement = ELEMENT.FIRE;
  }
}
