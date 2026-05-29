# Phase 14: Core Team Deathmatch Mode - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-29
**Phase:** 14-core-team-deathmatch-mode
**Areas discussed:** Win target & match end, Spawnpoint assignment, Respawn invulnerability, Score HUD display

---

## Win target & match end

### Win target (kills)
| Option | Description | Selected |
|--------|-------------|----------|
| 30 kills (proposal default) | First team to 30; tunable config constant | ✓ |
| Lower number (10–15) | Shorter playtest rounds | |
| Tunable, default 30 | Same 30 but surfaced first in debug panel | |

**User's choice:** 30 kills (proposal default), as a tunable constant.

### Match-end / win moment
| Option | Description | Selected |
|--------|-------------|----------|
| Win banner + lock, then lobby | ENDED → win banner → auto return to lobby | |
| Win banner only (stay in scene) | Banner + lock, no auto return | |
| Full results screen | New results scene w/ per-player stats + MVP | ✓ |

**User's choice:** Full results screen → narrowed to **minimal** results screen (see follow-up).

### Time cap / tiebreaker
| Option | Description | Selected |
|--------|-------------|----------|
| No time cap (kill target only) | Runs until target reached | ✓ |
| Time cap + damage tiebreaker | Match timer, highest kills then damage | |

**User's choice:** No time cap.

### Follow-up — results scope
| Option | Description | Selected |
|--------|-------------|----------|
| Keep it, but minimal | Lean results scene: winner + kills/deaths + MVP + return-to-lobby | ✓ |
| Win banner now, results next phase | Defer results to a dedicated phase | |
| Full rich results screen | Damage, MVP, polished layout (likely splits phase) | |

**User's choice:** Minimal results scene this phase.

### Follow-up — per-player stats tracked
| Option | Description | Selected |
|--------|-------------|----------|
| Kills per player | Attribute eliminations to caster | ✓ |
| Deaths per player | Count eliminations suffered | ✓ |
| Damage dealt per player | Sum capped damage | |
| MVP (most kills) | Top fragger highlight | ✓ |

**User's choice:** Kills, Deaths, MVP. No damage tracking.

---

## Spawnpoint assignment

### Spawn source of truth
| Option | Description | Selected |
|--------|-------------|----------|
| config.ts constant per map (roadmap) | SPAWNPOINTS[mapId] → {teamA,teamB}; debug-tunable | ✓ |
| Tiled object layer per map | Authored in Tiled; not live-tunable | |
| Config now, Tiled later | Config this phase, migrate later | |

**User's choice:** config.ts constant per map.

### Assignment rule
| Option | Description | Selected |
|--------|-------------|----------|
| Farthest-from-enemy (proposal) | Pick team spawn farthest from living enemy | ✓ |
| Round-robin per team | Cycle list in order | |
| Random from team list | Random pick each time | |

**User's choice:** Farthest-from-enemy.

### Overflow (fewer spawns than players)
| Option | Description | Selected |
|--------|-------------|----------|
| Reuse/cycle spawnpoints | Wrap list, players may share | ✓ |
| Require enough spawns (validate) | Config error if too few | |

**User's choice:** Reuse/cycle.

---

## Respawn invulnerability

### Invuln end condition
| Option | Description | Selected |
|--------|-------------|----------|
| Cancel on move/cast + time cap | First of move, cast, or ~2–3s cap | ✓ |
| Cancel on move/cast only | No cap (roadmap literal) | |
| Time cap only | Fixed window regardless of action | |

**User's choice:** Cancel on move/cast OR time cap, whichever first.

### Invuln VFX
| Option | Description | Selected |
|--------|-------------|----------|
| Blink/flash (reuse hurt i-frame) | Existing alpha pulse | ✓ |
| Colored tint / aura | Distinct shield tint | |
| Blink + brief shield sprite | Blink + bubble overlay | |

**User's choice:** Reuse hurt i-frame blink.

### Invuln authority
| Option | Description | Selected |
|--------|-------------|----------|
| Server-authoritative | Host rejects hits on invuln targets | ✓ |
| Client-side only | Local gating only | |

**User's choice:** Server-authoritative.

---

## Score HUD display

### Position
| Option | Description | Selected |
|--------|-------------|----------|
| Top-center | Classic scoreboard position | |
| Top-left / corner | Compact, out of the way | |
| Top-center, you decide exact placement | Top-center region, exact coords at discretion | ✓ |

**User's choice:** Top-center, exact placement at Claude's discretion.

### Style
| Option | Description | Selected |
|--------|-------------|----------|
| Colored: [A] 12 – 8 [B] | Two team-tinted scores + dash | ✓ |
| Scores + target (12 – 8 / 30) | Same plus win target | |
| Your-team vs them emphasis | Personalized framing | |

**User's choice:** Colored `[A] 12 – 8 [B]`.

### Update behavior
| Option | Description | Selected |
|--------|-------------|----------|
| Live on every kill + pop | Update + scale-pop tween | ✓ |
| Live, no animation | Plain text swap | |

**User's choice:** Live on every kill with a scale-pop tween.

---

## Claude's Discretion

- Intro cinematic tween durations/easings and camera pan/zoom values.
- Exact score-plate coordinates, font sizes, spacing.
- MVP tie-break rule.
- Team-score broadcast payload shape (new field vs new event).
- ENDED payload shape carrying per-player stats to the results screen.

## Deferred Ideas

- Damage-dealt stat tracking + rich/animated results layout.
- Time cap + damage tiebreaker mode.
- Tiled object-layer spawnpoint authoring.
- Death-card upgrade system (existing seed).
- Special-spell pickups (Phase 15).

## Notes

- Intro cinematic was NOT a selected gray area — it is fully specified in ROADMAP success criterion 5 + `.planning/notes/tdm-intro-cinematic-and-banner-bug.md`, captured directly as D-18..D-20.
- The `gameplay-direction-proposal.md` referenced throughout predates the roadmap reorg (it says "fold into Phase 10"); that work is now Phase 14.
