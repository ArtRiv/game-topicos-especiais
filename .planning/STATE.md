# GSD Project State

## Project
- **Name:** Mages Co-op
- **Engine:** Phaser 3.87.0 + TypeScript 5.7.3
- **Build:** Vite 6.0.7 (pnpm)
- **Milestone:** v1.0 — College Event Build

## Phases
| # | Title | Status |
|---|-------|--------|
| 1 | LAN Foundation | not-started |
| 2 | Two Players Playing | not-started |
| 3 | Spell Sync & Cross-Player Combos | not-started |
| 4 | Puzzle Rooms | not-started |
| 5 | Bosses, NPCs & Narrative | not-started |

## Active Phase
None. Roadmap complete — begin with `/gsd-discuss-phase 1`.

## Key Decisions
- **Networking:** socket.io 4.x (server) + socket.io-client (browser); Node.js 20 dedicated server
- **Sync model:** Full state broadcast at 20 Hz; server-authoritative for enemies and combo events
- **Element split:** P1 = Fire + Earth + Water | P2 = Ice + Wind + Thunder
- **Combo trigger:** Automatic on server-confirmed spell collision
- **Puzzle failure:** Spawns a hard enemy wave (timer reaches zero)
- **Architecture:** `NetworkManager` singleton, `RemoteInputComponent`, avoid polluting `GameScene` further

## GSD Workflow Config
- mode: yolo
- granularity: standard
- model_profile: balanced
- agents: research=true, plan_check=true, verifier=true
- commit_docs: true

## Initialized
<!-- set by gsd-tools on project creation -->
true
