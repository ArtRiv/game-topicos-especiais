# Morning Review — Autonomous Overnight Session

You left me running overnight to finish work for the Friday event. This file is your checklist for what I did, what to test, and what needs YOUR decisions/actions.

> Status legend: ✅ done & type-checked · 🧪 needs your playtest · ⏳ in progress · ❓ needs your decision/action

---

## Already done & verified BEFORE you slept (recap)
- ✅ HP scale fix (server 100→10 to match client) — spells now deal real damage
- ✅ HUD heart-crash guard — damage never silently aborts
- ✅ Match-end fix — one kill no longer shows the exit screen (isTeamDeathmatch defaults to TDM)
- ✅ Death/respawn visuals — hearts refill, corpse non-targetable + team-colored + death animation, respawn returns to normal sprite
- ✅ Intermittent death-anim bug — dead players gated from the interpolation loop + stop broadcasting while dead
- ✅ Combo nerfs (Lightning Burst 8→5, Strike 6→4, Earth+Fire 5→3, Molten 2.0→1.5)
- ✅ Platform connection (`resolveConnection()` + `GAME_SLUG`) — same-origin path on platform, LAN IP otherwise
- ✅ Vite subpath fix (`/assets` → `./assets` ×4) — no 404s under `feira-de-jogos.dev.br/<slug>/`
- ✅ Match-length lobby option (8/15/30 kills) — host cycle control + server-authoritative win target

## Done overnight ✅
All type-checked (client + server clean), 79 server tests pass, no new test failures introduced.

**FEATURE: Match-length lobby option (8/15/30 kills)**
- Host picks kill target in the lobby (`< value >` control under Format). Non-hosts see it as a label.
- Server-authoritative: rides the existing `lobby:set-config` round-trip → `room.winTarget` → win-check. Preserved across format/map changes.
- Files: both `types.ts`, `lobby-manager.ts`, `game-room.ts`, `server.ts`, `lobby-scene.ts`.

**FEATURE: Special-spell pickups (server-authoritative, FULL version with claim arbitration)**
- Server picks random positions + times (4 pickups, ~60s apart starting at 45s, ±10s jitter) and broadcasts `pickup:spawned` → every client renders the SAME pickup (fade-in) at the SAME spot. Each match has its own random layout.
- Walk over one → you get a special-spell charge (DarkBolt or VoidOrb). First-touch-wins arbitration (server resolves by socket identity) → `pickup:collected` removes it for everyone.
- **FEATURE FLAG:** set `PICKUPS_ENABLED = false` (or env `PICKUPS_ENABLED=false`) in `game-server/src/server.ts` to disable pickups entirely if anything misbehaves — the rest of the match is unaffected.
- New file: `src/game-objects/pickups/networked-special-pickup.ts`. Touches both `types.ts`, `event-bus.ts`, `network-manager.ts`, `game-room.ts`, `server.ts`, `game-scene.ts`.
- ⚠️ Note: DarkBolt grants 5 charges, VoidOrb 3 (existing config). If you want strict "1 use", lower `DARK_BOLT_PICKUP_CHARGES`/`VOID_ORB_PICKUP_CHARGES` to 1 — left as-is since the inventory holds one special at a time.
- ⚠️ Pickup spawn box is hand-coded for the current maps (WORLD/DUNGEON_1/STAGES). Don't swap maps without re-checking pickups land on walkable floor.

**Adversarial self-review (I ran a 4-agent review of all overnight changes)**
- Found 1 real blocker: the late-boot pickup replay handler existed server-side but the client never called it → a client that booted/reconnected mid-match wouldn't see early pickups. **FIXED** (`sendPickupRequest()` now called alongside scene-ready).
- Fixed cosmetic: death animation now faces the player's direction (was always DIE_DOWN).
- Added: one-shot claim guard (no claim spam), closed a ~ms dead-gate race window on respawn.
- Everything else reviewed clean: match-length, connection, balance, HP/HUD, tint cache, revive().

**Other**
- Wrote `.planning/REFACTOR-PLAN-game-scene.md` — your POST-EVENT plan to break up the 5,700-line god-file safely (do NOT do before the event).

---

## 🧪 WHAT TO PLAYTEST IN THE MORNING (2-client local)
Start: `cd game-server && npm run dev` + `pnpm start`, two browser tabs at localhost:5173.

1. **Match-length:** in lobby, set Match to 8, assign teams A/B, start. Confirm the match ENDS at 8 kills. Then test: set 8, change the MAP, start — confirm it still ends at 8 (config-preservation check).
2. **Pickups (NEW):** during a match, special-spell pickups should fade in at random spots, same place on both screens. Walk over one — you get a special-spell charge; it disappears for BOTH players. Two players touching ~same time: only one should keep it.
3. **Full death/respawn flow:** kill each other repeatedly — death anim always plays, corpse team-colored, respawn clean, hearts refill, can be killed again.
4. **Regression sweep:** cast every element, take damage, confirm hearts drop, no console errors (other than the known WATER_BALL spritesheet load warnings, which are pre-existing and harmless).

---

## 🔧 Git state + build note
- All overnight work is committed on branch **`event-prep-overnight`** (you were on `main`). To get back to the pre-overnight state: `git checkout main`. To keep the work: stay on the branch or merge it.
- **`pnpm build` FAILS — but only on pre-existing library type-noise** (vitest/vite/rollup/DOM TextDecoder `moduleResolution` errors in `node_modules`, documented in STATE.md as a known issue, NOT my code). **`npx vite build --config config/vite.config.js` succeeds (exit 0) and produces `dist/`** — that's your real deploy artifact. The font path fix verified working in the build output. For deployment, use `vite build` directly (or fix the `tsc` moduleResolution to `bundler` in tsconfig — a post-event cleanup).

## ❓ NEEDS YOUR ACTION (I can't do these)
1. **Send the PT-BR questions** to your friend (Expelled) + professor — in `.planning/FRIDAY-SHIP-PLAN.md`. The friend ones are the fastest unblock for deployment.
2. **Fill `GAME_SLUG`** in `src/common/config/network.ts` once the prof gives you the slug (currently `''` = LAN mode).
3. **Fill tijolinhos constants** (product id, GSI client id) once the prof answers — see FRIDAY-SHIP-PLAN.md.
4. **Decide the #1 deployment risk:** does the venue network allow browser-to-browser WebRTC (STUN), or do you need TURN? Ask the friend (their game sidesteps this — voice is server-relayed, not P2P).
5. **Before final platform build:** flip `NETWORK_DEBUG = false` in `src/common/config/network.ts` (I left it `true` so you can debug in the morning).
