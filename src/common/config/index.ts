// Config barrel — every existing `import { X } from '../common/config'` continues to
// work unchanged because TypeScript resolves the path to this index.ts.
//
// To tweak something specific, jump to the file that owns it:
//   debug.ts          — debug toggles, dev shortcut, spell-ghost telegraph
//   player.ts         — player movement, health, mana, aiming + cursor
//   enemies.ts        — spider, wisp, boss drow
//   combat-misc.ts    — hurt pushback, throw/lift, room transitions
//   network.ts        — netcode + host-authoritative damage caps
//   dash.ts           — dash mechanics + VFX
//   spells/fire.ts    — fire bolt / area / breath (+ combo multipliers)
//   spells/earth.ts   — earth bolt / bump / wall (+ lava-pool, earth-fire combo)
//   spells/water.ts   — water spike / ball / tornado (+ puddle, per-spell spawn shapes)
//   spells/thunder.ts — thunder strike / splash (+ lightning combos, elec puddle)
//   spells/ice.ts     — ice shard
//   spells/wind.ts    — wind bolt + air burst
//   spells/lightning-beam.ts — held-cast THUNDER right-click beam
//   spells/void-orb.ts      — pickup-granted darkness orb (Blood Mage visuals)
export * from './debug';
export * from './player';
export * from './enemies';
export * from './combat-misc';
export * from './network';
export * from './tdm';
export * from './rewards';
export * from './dash';
export * from './spells';
