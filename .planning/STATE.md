# GSD Project State

## Project
- **Name:** Mages
- **Engine:** Phaser 3.87.0 + TypeScript 5.7.3
- **Build:** Vite 6.0.7 (pnpm)
- **Milestone:** v2.0 — PvP Event Multiplayer

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-27 — Milestone v2.0 PvP Event Multiplayer started

## Phases
*(to be defined by roadmapper)*

## Active Phase
None. Requirements and roadmap being defined.

## Key Decisions
- **Auth:** Google OAuth — players use Google email accounts
- **Server:** Internet-accessible Node.js + socket.io central server with persistent DB
- **Game modes:** Battle Royale, 2v2 / 3v3 / 4v4 team vs team
- **All 6 elements available to all players** — no asymmetric split in PvP
- **Ranking:** Persistent rank score updated after every match
- **Progression:** XP → levels → upgrade points for spell stats (cooldown, mana, HP)

## Pending Todos
- `2026-03-27-pivot-game-to-pvp-event-multiplayer-with-google-accounts-and-ranking.md` — Pivot game to PvP event multiplayer with Google accounts and ranking (area: planning) — *captured the original pivot idea; this milestone IS that pivot*

## GSD Workflow Config
- mode: yolo
- granularity: standard
- model_profile: balanced
- agents: research=true, plan_check=true, verifier=true
- commit_docs: true

## Initialized
<!-- set by gsd-tools on project creation -->
true
