# Phase 1: Auth + Server Scaffold - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up the Node.js back-end server with Google OAuth login and persistent player accounts. Phaser client boots only after a valid session is confirmed. This phase delivers: server scaffold, DB schema, OAuth flow, login page, session validation, and logout.

New capabilities (lobby, matchmaking, socket sync) belong in Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Database
- **D-01:** SQLite as the database engine — file-based, zero ops, no managed instance needed
- **D-02:** Drizzle ORM for type-safe queries and schema management

### Server Structure
- **D-03:** Node.js server lives in `/server` directory within this repository — single repo, no monorepo tooling
- **D-04:** Client (`src/`) and server (`server/`) are separate build targets; shared types copied manually if needed

### Login UX
- **D-05:** Separate `login.html` page is the entry point — "Sign in with Google" button triggers Google OAuth redirect
- **D-06:** After successful OAuth callback, server sets session cookie and redirects browser to `index.html`
- **D-07:** `index.html` (Phaser) validates session on load — if no valid session exists, redirects back to `login.html`
- **D-08:** Logout from main menu returns player to `login.html`

### Token / Session Storage
- **D-09:** httpOnly cookie — server sets it via `Set-Cookie` header, JS never reads it directly
- **D-10:** `better-auth` (referenced in AUTH-01) handles the session cookie lifecycle natively
- **D-11:** Phaser boot is gated on a `/api/me` (or equivalent) endpoint response — if 401, redirect to `login.html`

### Agent's Discretion
- HTTP framework choice for the server (Express vs Fastify vs Hono) — agent picks what integrates most cleanly with `better-auth`
- Port configuration and dev/prod environment variable handling
- Exact Drizzle schema column types for rank, level, upgrade points

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — AUTH-01, AUTH-02, AUTH-03 are the three requirements for this phase
- `.planning/ROADMAP.md` — Phase 1 success criteria (4 items)

### Auth Library
- `better-auth` npm package — referenced in REQUIREMENTS.md AUTH-01 as the chosen auth library for Google OAuth

### No external specs — requirements fully captured in decisions above

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main.ts` — current Phaser entry point; will need a session check injected before `new Phaser.Game(...)` boots
- `index.html` — existing game shell; Phaser boot will be gated here

### Established Patterns
- Pure client-side Phaser 3 + TypeScript — no existing server, no networking, no auth
- Vite build configured in `config/vite.config.js` — server will be a separate Node process, not served by Vite in production

### Integration Points
- `index.html` → adds session-check fetch before Phaser init; redirects to `login.html` if 401
- New `login.html` → served statically; standalone OAuth flow page
- `server/` → new directory; Node.js + better-auth + Drizzle + SQLite

</code_context>

<specifics>
## Specific Ideas

- The `login.html` page does not need to be pixel-art or Phaser-rendered — a clean, minimal HTML/CSS page with a "Sign in with Google" button is sufficient for Phase 1
- Player display name should come from their Google profile on first login and be stored in the DB (AUTH-02, AUTH-03)

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- "Pivot game to PvP event multiplayer with Google accounts and ranking" — this todo captures the original pivot idea; the milestone IS that pivot. Already fully captured in PROJECT.md and ROADMAP.md. Not folded — no action needed.

</deferred>

---

*Phase: 01-auth-server-scaffold*
*Context gathered: 2026-03-26*
