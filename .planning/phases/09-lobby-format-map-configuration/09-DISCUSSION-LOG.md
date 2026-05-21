# Phase 9: Lobby Format & Map Configuration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 09-lobby-format-map-configuration
**Areas discussed:** Config schema & event, Host UI controls, Capacity downshift, Map pool & list visibility

---

## Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Config schema & event | Shape of GameRoom.config + how changes broadcast | ✓ |
| Host UI controls | Format selector + map picker + capacity display | ✓ |
| Capacity downshift | What happens when format shrinks below current count | ✓ |
| Map pool & list visibility | Map pool source + lobby browser row content | ✓ |

**User's choice:** All four areas.

---

## Config Schema & Event

### Q1: Where should the config object live?
| Option | Description | Selected |
|--------|-------------|----------|
| On Lobby (Recommended) | Add `config` to existing Lobby type; reuse `lobby:updated` plumbing | ✓ |
| On GameRoom | Literal LBC-05 reading; forces two-place storage | |
| Both (mirrored) | Lobby edits; GameRoom receives snapshot at LOBBY→LOADING | |

**User's choice:** On Lobby (Recommended)

### Q2: How should config changes reach clients?
| Option | Description | Selected |
|--------|-------------|----------|
| Reuse `lobby:updated` (Recommended) | Config part of Lobby; full lobby re-emitted on every edit | ✓ |
| New `lobby:config-updated` event | Dedicated diff event; second source of truth | |

**User's choice:** Reuse `lobby:updated` (Recommended)

### Q3: What shape for the config object?
| Option | Description | Selected |
|--------|-------------|----------|
| Flat record (Recommended) | `{ format, mapId, maxPlayers }` with optional future fields | ✓ |
| Nested by category | `{ match: {...}, map: {...}, rules: {...} }` | |
| Versioned envelope | `{ version, data }` for migrations | |

**User's choice:** Flat record (Recommended)

### Q4: How should `format` be typed on the wire?
| Option | Description | Selected |
|--------|-------------|----------|
| String literal (Recommended) | `'1v1'..'10v10'` union; maxPlayers derived | ✓ |
| teamSize number | `teamSize: 1..10`; maxPlayers = teamSize*2 | |
| Explicit {teams, perTeam} | Future-flexible for asymmetric/BR modes | |

**User's choice:** String literal (Recommended)

---

## Host UI Controls

### Q1: How does the host pick the format?
| Option | Description | Selected |
|--------|-------------|----------|
| Compact dropdown (Recommended) | DOM `<select>` with 10 options | ✓ |
| 10-button grid | Row of styled buttons | |
| +/- stepper | `< 3v3 >` arrows | |

**User's choice:** Compact dropdown (Recommended)

### Q2: How does the host pick the map?
| Option | Description | Selected |
|--------|-------------|----------|
| Preview cards (Recommended) | Side-by-side cards with thumbnail | ✓ |
| Dropdown only | Plain `<select>` of map names | |
| Carousel | Big preview with prev/next arrows | |

**User's choice:** Preview cards (Recommended)

### Q3: How is capacity / player count shown to everyone?
| Option | Description | Selected |
|--------|-------------|----------|
| Header line: 'Players 3/6 — 3v3 on WORLD' (Recommended) | Single subtitle visible to all | ✓ |
| Per-area split | Capacity above list, format+map elsewhere | |
| Just the player list | No explicit cap | |

**User's choice:** Header line (Recommended)

### Q4: What can non-host players see/do with the controls?
| Option | Description | Selected |
|--------|-------------|----------|
| Read-only labels (Recommended) | Plain text `Format: 3v3`, `Map: WORLD` | ✓ |
| Same controls but disabled | Greyed-out dropdown/cards | |

**User's choice:** Read-only labels (Recommended)

---

## Capacity Downshift

### Q1: Host has 8 players, picks 2v2 (cap=4) — what should the server do?
| Option | Description | Selected |
|--------|-------------|----------|
| Block the change (Recommended) | Reject with inline error; host removes players or picks bigger format | ✓ |
| Allow over-capacity, gate Start | Format change succeeds; Start disabled until cap met | |
| Auto-kick last-joined | Server removes most-recent players | |
| Warn-and-confirm | Modal confirmation before kick | |

**User's choice:** Block the change (Recommended)

### Q2: Should the host get a way to remove individual players in this phase?
| Option | Description | Selected |
|--------|-------------|----------|
| Defer to Phase 10 (Recommended) | Generalize Phase 10's LBC-11 AFK-kick to any player | ✓ |
| Add minimal host-kick now | Per-row 'X' button | |

**User's choice:** Defer to Phase 10 (Recommended)

---

## Map Pool & List Visibility

### Q1: Where does the map pool come from?
| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded MAP_POOL constant (Recommended) | Mirrored client/server const | ✓ |
| Server manifest at startup | Scan asset dir, expose via socket event | |

**User's choice:** Hardcoded MAP_POOL constant (Recommended)

### Q2: What does each MAP_POOL entry carry?
| Option | Description | Selected |
|--------|-------------|----------|
| id + displayName + thumbnailKey (Recommended) | Full UI metadata in the constant | ✓ |
| Just id (string) | Wire carries id only; client maps to name/thumb | |

**User's choice:** id + displayName + thumbnailKey (Recommended)

### Q3: Should the lobby browser show format + map per row?
| Option | Description | Selected |
|--------|-------------|----------|
| Yes — 'Host's lobby — 3v3 • WORLD • 3/6' (Recommended) | Joiners pick informed | ✓ |
| No — keep list minimal | Config only after joining waiting room | |

**User's choice:** Yes (Recommended)

---

## Claude's Discretion

- Exact DOM/CSS styling within the existing FONT/BTN palette
- Thumbnail asset dimensions and exact path conventions
- Waiting-room layout positioning of host controls
- Whether to extend `MatchConfig` or add a separate `config` field on the `lobby:started` payload

## Deferred Ideas

- Host-kick of arbitrary players (Phase 10)
- Team auto-balance / auto-fill at 5v5+
- Mid-LOADING / mid-COUNTDOWN config changes
- Server-discovered map manifest
- `timeLimit` / `friendlyFire` / `spellModifiers` modes (schema only, not modes)
- Versioned config envelope
