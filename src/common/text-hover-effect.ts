import * as Phaser from 'phaser';
import { TextLightningEffect } from './text-lightning-effect';
import { TextFireEffect } from './text-fire-effect';
import { TextWaterEffect } from './text-water-effect';
import { TextEarthEffect } from './text-earth-effect';

// ---------------------------------------------------------------------------
// TextHoverEffect — random-pick dispatcher for the element-themed hover
// effects (lightning today; fire/water/earth coming). Each effect implements
// the same minimal interface so the menu doesn't care which one rolled.
//
// Usage:
//   const fx = attachRandomHoverEffect(this, item);
//   item.on('pointerover', () => fx.reroll().start());
//   item.on('pointerout', () => fx.stop());
//   item.once(Phaser.GameObjects.Events.DESTROY, () => fx.destroy());
//
// `reroll()` picks a fresh random effect — call it on each pointerover so
// re-hovering the same item gets a different element. Skip the reroll if you
// want the effect to stay locked to its first roll for the item's lifetime.
// ---------------------------------------------------------------------------

export interface HoverEffect {
  start(): void;
  stop(): void;
  destroy(): void;
}

// Registry of available effects. The four elementals are all wired up;
// add more here to extend the dispatcher.
type EffectKind = 'lightning' | 'fire' | 'water' | 'earth';
type EffectFactory = (scene: Phaser.Scene, text: Phaser.GameObjects.BitmapText) => HoverEffect;

const FACTORIES: Record<EffectKind, EffectFactory> = {
  lightning: (scene, text) => new TextLightningEffect(scene, text),
  fire: (scene, text) => new TextFireEffect(scene, text),
  water: (scene, text) => new TextWaterEffect(scene, text),
  earth: (scene, text) => new TextEarthEffect(scene, text),
};

// Per-effect weights. Higher weight = picked more often. Equal weights right
// now → each hover is a uniform 1-in-N pick across the registered effects.
const WEIGHTS: Record<EffectKind, number> = {
  lightning: 1,
  fire: 1,
  water: 1,
  earth: 1,
};

// Module-level memo: the last kind picked by any dispatcher in this scene
// session. Used to avoid repeating the same element across DIFFERENT texts
// — if you just hovered "ENTRAR EM LOBBY" and saw fire, hovering "CRIAR
// LOBBY" next won't roll fire again. Combined with each dispatcher's own
// kind exclude, the result is "never the same element twice in a row,
// anywhere."
let lastGlobalPick: EffectKind | undefined;

// Weighted random pick. Any number of kinds can be excluded from the pool.
// If the exclusion would empty the pool, we fall back to picking from the
// full set so the function never fails. With 4 effects registered and at
// most 2 excludes (own last + global last), there's always ≥2 options.
function pickKind(...excludes: (EffectKind | undefined)[]): EffectKind {
  const all = Object.keys(FACTORIES) as EffectKind[];
  const excluded = new Set(excludes.filter((e): e is EffectKind => e !== undefined));
  let kinds = all.filter((k) => !excluded.has(k));
  if (kinds.length === 0) kinds = all;
  const total = kinds.reduce((s, k) => s + WEIGHTS[k], 0);
  let roll = Math.random() * total;
  for (const k of kinds) {
    roll -= WEIGHTS[k];
    if (roll <= 0) {
      lastGlobalPick = k;
      return k;
    }
  }
  const fallback = kinds[0];
  lastGlobalPick = fallback;
  return fallback;
}

// Handle returned to callers. Wraps the currently-active effect and exposes
// reroll() so re-hovering a menu item can pick a different element.
export interface HoverEffectHandle extends HoverEffect {
  reroll(): HoverEffectHandle;
  // Force a specific kind. Useful for debugging / locking one item to a fixed
  // effect (e.g. the "OPCOES" entry always being water once those exist).
  force(kind: EffectKind): HoverEffectHandle;
}

class HoverEffectDispatcher implements HoverEffectHandle {
  readonly #scene: Phaser.Scene;
  readonly #text: Phaser.GameObjects.BitmapText;
  #current: HoverEffect;
  #currentKind: EffectKind;
  #destroyed = false;

  constructor(scene: Phaser.Scene, text: Phaser.GameObjects.BitmapText, initial: EffectKind) {
    this.#scene = scene;
    this.#text = text;
    this.#currentKind = initial;
    this.#current = FACTORIES[initial](scene, text);
  }

  start(): void {
    if (this.#destroyed) return;
    this.#current.start();
  }

  stop(): void {
    if (this.#destroyed) return;
    this.#current.stop();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#current.destroy();
  }

  // Pick a fresh effect avoiding (a) this dispatcher's own last kind and
  // (b) the last kind any dispatcher picked anywhere. So consecutive
  // hovers — same text OR different texts — always land on a new element.
  reroll(): HoverEffectHandle {
    return this.force(pickKind(this.#currentKind, lastGlobalPick));
  }

  force(kind: EffectKind): HoverEffectHandle {
    if (this.#destroyed) return this;
    // Hard-swap: stop + destroy the current effect, build the new one. We
    // don't bother trying to cross-fade because the menu's own setTint runs
    // on the same event and the cutover is invisible during normal use.
    this.#current.stop();
    this.#current.destroy();
    this.#currentKind = kind;
    this.#current = FACTORIES[kind](this.#scene, this.#text);
    return this;
  }
}

export function attachRandomHoverEffect(
  scene: Phaser.Scene,
  text: Phaser.GameObjects.BitmapText,
): HoverEffectHandle {
  return new HoverEffectDispatcher(scene, text, pickKind());
}
