# Phase 1: Auth + Server Scaffold - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Session:** 2026-03-26
**Mode:** Interactive

---

## Area 1: Database Choice

**Question:** How should player accounts be stored?

| Option | Presented |
|--------|-----------|
| SQLite + Drizzle ORM | ✓ |
| PostgreSQL (managed) | ✓ |

**Selected:** SQLite + Drizzle ORM
**User response:** "we can use sqlite"

---

## Area 2: Server Project Structure

**Question:** Where should the Node.js server live?

| Option | Presented |
|--------|-----------|
| `/server` folder in this repo | ✓ |
| pnpm workspaces monorepo | ✓ |
| Separate repo | ✓ |

**Selected:** `/server` folder in this repo
**User response:** "server folder in this repository"

---

## Area 3: Login Page UX

**Question:** How should the login experience work?

| Option | Presented |
|--------|-----------|
| Separate `login.html` | ✓ |
| Phaser login scene | ✓ |
| Overlay on `index.html` | ✓ |

**Selected:** Separate `login.html`
**User response:** "lets make a separate login html"

---

## Area 4: Token Storage Strategy

**Question:** How should the JWT/session be stored on the client?

| Option | Presented |
|--------|-----------|
| httpOnly cookie (recommended) | ✓ |
| localStorage | ✓ |
| In-memory JS variable | ✓ |

**Selected:** httpOnly cookie
**User response:** "httpOnly cookie"

---

*Discussion completed: 2026-03-26*
