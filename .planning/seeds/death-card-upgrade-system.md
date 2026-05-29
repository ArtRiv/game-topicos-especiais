---
title: Death-card upgrade system (pick-1-of-3 on death, losing-team rubber-banding)
trigger_condition: After Core Team Deathmatch is playable end-to-end (scoring + respawn + intro working in a real 2+ client playtest)
planted_date: 2026-05-29
status: dormant
---

## The idea

Each time a player **dies**, they choose **1 of 3 randomly-drawn cards** to upgrade one of their spells/stats. Purpose: **rubber-banding** — a team that's dying a lot keeps getting stronger, so they can fight back instead of getting steamrolled. Upgrades persist for the rest of the match.

Example cards the user named:
- Firebolt: **cooldown reduction + damage up** (combined on one card)
- Tornado: **stronger pull**
- Player: **more mana regeneration**

## Why it's a seed, not a phase (yet)

It's the most architecturally invasive idea — it requires:
1. **Per-player mutable spell stats.** Today spell tuning lives in `config.ts` / `RUNTIME_CONFIG` as global constants. This needs per-player overrides layered on top (a per-player "modifiers" map the spell-casting / damage path reads).
2. A **card pool** definition (each card = which spell/stat, what delta) as a single source of truth.
3. A **pick-1-of-3 UI** that appears during the respawn window (slots into the existing death overlay / respawn countdown).
4. **Network sync** of who has which upgrades — damage is host-authoritative, so the server must know each player's modified damage/cooldown to validate hits (ties into `applyDamage` / `MAX_SPELL_DAMAGE` cap, which would need to become per-player).

## Suggested first move when triggered

`/gsd-spike` the riskiest unknown first: make ONE spell's damage + cooldown **per-player mutable and host-authoritative-synced**, prove it works on 2 clients, THEN decide the full phase. The card pool + pick UI are comparatively easy once the mutable-stat plumbing exists.

## Related
- Builds on Core Team Deathmatch (respawn flow, death overlay) and the host-authoritative damage pipeline (Phase 9.3).
