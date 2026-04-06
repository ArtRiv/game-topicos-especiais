# Technology Stack — Mages v2.0 PvP Multiplayer

**Project:** Mages — competitive wizard PvP game
**Milestone:** v2.0 — Internet-accessible PvP event server
**Researched:** March 26, 2026
**Confidence:** HIGH (all versions verified against npm registry on this date)

---

## Recommended Stack Summary

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **HTTP Framework** | Express | 5.2.1 | REST API + socket.io host |
| **Real-time** | socket.io (server) | 4.8.3 | PvP game loop, lobbies, events |
| **Real-time (client)** | socket.io-client | 4.8.3 | Phaser scene → server bridge |
| **Authentication** | better-auth | 1.5.6 | Google OAuth, sessions, user records |
| **Database** | SQLite via better-sqlite3 | 12.8.0 | All persistence (accounts, rank, XP) |
| **ORM** | drizzle-orm | 0.45.1 | Schema-safe queries, TypeScript types |
| **Migrations** | drizzle-kit | 0.31.10 | Schema generation and push |
| **CORS** | cors | 2.8.6 | Allow Vite dev origin + prod origin |
| **JWT** | jsonwebtoken | 9.0.3 | Socket handshake token after login |
| **Ranking** | Custom Elo (no library) | — | Post-match score updates |

**Total new runtime dependencies: 7 packages** added to a new `server/` project.
**Client change: 1 package** (`socket.io-client`) added to the existing Phaser repo.

---

## 1. Authentication — Google OAuth

### Recommendation: `better-auth@1.5.6`

better-auth is a TypeScript-first, framework-agnostic auth library published to npm as a single package. It ships a handler function that mounts directly on any Node.js HTTP server — Express, Fastify, or plain `http` — with no framework lock-in. It has first-class support for Google as a social provider, manages user sessions via cookies, and includes a Drizzle ORM adapter that auto-generates and migrates the required `user`, `session`, `account`, and `verification` tables.

**Verified capabilities** (HIGH confidence — official docs at better-auth.com):
- Google OAuth redirect flow via `socialProviders.google`
- Cookie-based sessions with server-side validation
- TypeScript schema auto-generated via `betterAuthDrizzleAdapter`
- `prompt: "select_account"` forces the Google account picker — critical for event machines where multiple people may be using the same browser
- `idToken` bypass for Google One Tap (optional, useful for kiosks)

```ts
// server/src/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL, // e.g. https://mages.example.com
  database: drizzleAdapter(db, { provider: "sqlite" }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      prompt: "select_account",
    },
  },
});

// Server: mount all /api/auth/* routes
app.all("/api/auth/*", (req, res) => auth.handler(req, res));
```

### Auth Comparison Matrix

| Library | Version | Last Publish | Google OAuth | TS-first | Framework tie-in | Event-safe |
|---------|---------|-------------|-------------|---------|-----------------|-----------|
| **better-auth** | **1.5.6** | **4 days ago** | ✅ Built-in | ✅ | None (handler fn) | ✅ Self-hosted |
| Passport.js + google strategy | 2.0.0 | **7 years ago** | ⚠️ Extra package | ❌ (needs @types) | Connect/Express | ⚠️ Unmaintained |
| Firebase Auth | cloud SDK | Managed | ✅ Built-in | ✅ | Firebase ecosystem | ❌ Cloud-dependent |
| Auth.js (NextAuth v5) | 5.x | Recent | ✅ Built-in | ✅ | Next.js optimized | ⚠️ Express adapter experimental |

**Why NOT Passport.js:**
`passport-google-oauth20` is at v2.0.0 and was last published in **2018 — 7 years ago**. It still works but is effectively abandoned: no TypeScript declarations without a separate `@types` package, no maintained session management (you hand-wire `express-session` or JWTs yourself), and no active bug fixes. The strategy package has no published updates to support modern OAuth2 consent screen requirements. The boilerplate burden is entirely on the developer.

**Why NOT Firebase Auth:**
Firebase Auth is a cloud service. At a college venue event, if the internet connection degrades or drops, players cannot log in because Google's ID-token verification endpoint (`googleapis.com`) becomes unreachable. All game state — accounts, rank, XP — must live on the local server. Splitting auth to the cloud and game data locally creates a fragile dependency. Additionally: Firebase Admin SDK adds ~200KB to the server package, requires firebase credentials separate from Google OAuth credentials, and introduces an entirely new API surface to learn on a 3-month deadline.

**Why NOT Auth.js (NextAuth v5):**
Despite the rebrand from "NextAuth" to "Auth.js", v5 is still architecturally centered on Next.js. The generic Express/Fastify framework adapters are documented as experimental, with significantly less community coverage than the Next.js path. The added migration risk is not worth it when better-auth handles the same use case more cleanly for a plain Node.js server.

---

## 2. HTTP Framework

### Recommendation: `express@5.2.1`

Express 5 (stable release, published ~4 months ago) resolves async error handling, aligns with Node 18+ semantics, and is a drop-in upgrade from Express 4. With 75M weekly downloads and the largest Node.js HTTP framework ecosystem, every major socket.io integration tutorial uses Express — the official socket.io documentation shows Express integration as its primary example.

At event scale (at most ~100 simultaneous players, making dozens of HTTP requests per minute), the performance delta vs Fastify is entirely irrelevant. The productivity advantage — familiar API, abundant examples, minimal setup — is the deciding factor for a 2-dev, 3-month delivery.

**Why NOT Fastify 5.8.4:**
Fastify benchmarks at ~77K req/s vs Express's ~14K on synthetic "hello world" tests. This means nothing for a game server handling at most 50 concurrent matches with simple REST calls for lobby management. Fastify's plugin encapsulation system is more opinionated and has meaningfully fewer real-world examples for the socket.io + auth + session combination. A team hitting an unfamiliar Fastify plugin registration problem the night before an event is a preventable risk.

---

## 3. Real-Time Transport — PvP Gameplay + Lobby

### Recommendation: `socket.io@4.8.3` (server) + `socket.io-client@4.8.3` (client)

socket.io 4.8.3 was published 3 months ago. The client and server are version-locked at 4.8.3 by design — they must match major version.

**Features that map directly to game requirements:**

- **Rooms = lobbies.** `socket.join(lobbyCode)` groups all players in a lobby. `io.to(lobbyCode).emit("playerJoined", data)` broadcasts to everyone in that room. The lobby layer requires no custom routing code.
- **Namespaces = separation of concerns.** Use `/lobby` namespace for pre-match browsing/creation and `/game` namespace for active match play. Different auth middleware and lifecycle rules per namespace.
- **Acknowledgements = reliable state transitions.** Server confirms match start, slot assignment, spell resolution to the initiating client before broadcasting to others. Critical events do not silently drop.
- **Auto-reconnect.** Handles venue wifi hiccups without breaking the game session. Exponential back-off with configurable retry limit.

**Integration with Phaser 3 + Vite:**

socket.io-client ships with built-in TypeScript declarations and is imported as an ESM module — no configuration required in the existing Vite + ESM setup.

```ts
// In a Phaser Scene (e.g., GameScene.ts)
import { io, Socket } from "socket.io-client";

const socket: Socket = io("/game", {
  auth: { token: localStorage.getItem("game_token") },
  transports: ["websocket"], // skip long-polling at an event venue
});

socket.on("spell_hit", ({ caster, target, damage }) => {
  this.applySpellHit(target, damage);
});
```

`transports: ["websocket"]` skips the HTTP long-poll → WebSocket upgrade handshake. All modern browsers at a college event support WebSocket natively; skipping the upgrade shaves ~200ms off connection time.

### Game Architecture: Server-Authoritative

Every spell cast, position update, and elimination is processed on the server. The client sends *intent*, the server sends *truth*.

```
Client → server: CAST_SPELL { element: "fire", direction: { x, y } }
Server validates: alive? has mana? cooldown expired?
Server computes: hit detection against all players in room
Server → all clients in room: SPELL_RESULT { caster, targets: [{ id, damage }] }
Clients: animate the result they receive
```

This is non-negotiable for PvP integrity. Never trust clients to report their own hit detection. The existing Phaser spell logic can be extracted into a shared `spell-engine` module and run on the server for authoritative computation.

---

## 4. Database

### Recommendation: `better-sqlite3@12.8.0` (SQLite)

SQLite is a file-based embedded database — zero server process, zero configuration, single `.db` file. Backup = `cp game.db game.db.bak`. Published 13 days ago.

**Scale analysis for this use case:**
- Expected concurrent players: 10–100 (college event)
- DB write pattern: match-end score writes (~every 5–10 minutes per match)
- DB read pattern: player stats on lobby join (~every 30 seconds)
- better-sqlite3 documented throughput: **2000+ queries/second** with 5-way joins
- Verdict: SQLite handles this load with 2 orders of magnitude headroom

Enable WAL mode immediately on startup — it allows concurrent reads while a write is in progress:

```ts
const db = new Database("game.db");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
```

### Database Schema Design

better-auth manages its own tables via Drizzle adapter (auto-migrated on startup):

```
users          — better-auth: id, email, name, emailVerified, image, createdAt, updatedAt
sessions       — better-auth: session tokens + expiry
accounts       — better-auth: googleId linking (OAuth account → user)
```

Game-owned tables:

```sql
player_stats (
  userId        TEXT PRIMARY KEY REFERENCES users(id),
  rankScore     INTEGER DEFAULT 1000,
  xp            INTEGER DEFAULT 0,
  level         INTEGER DEFAULT 0,
  upgradePoints INTEGER DEFAULT 0,
  spellUpgrades TEXT DEFAULT '{}' -- JSON: { maxHp, maxMana, cooldownMult }
)

matches (
  id         TEXT PRIMARY KEY,  -- UUID
  mode       TEXT,              -- "battle_royale" | "2v2" | "3v3" | "4v4"
  createdAt  INTEGER,           -- Unix timestamp
  endedAt    INTEGER
)

match_players (
  matchId    TEXT REFERENCES matches(id),
  userId     TEXT REFERENCES users(id),
  team       INTEGER,           -- 0 = BattleRoyale (no team)
  placement  INTEGER,           -- 1st, 2nd, etc.
  kills      INTEGER DEFAULT 0,
  ratingDelta INTEGER           -- Elo change this match
)
```

### DB Alternatives Rejected

| Database | Verdict | Reason |
|----------|---------|--------|
| PostgreSQL (self-hosted) | ❌ | Requires running a Postgres server process; adds ops complexity (user, password, pg_hba.conf) for a 2-dev team on event day. No scale advantage at <100 players. |
| MongoDB | ❌ | Schema-less is a liability for gaming data that needs consistency (rank can't be undefined, XP must be numeric). Learning curve for a team already on SQL path. |
| Firebase Firestore | ❌ | Cloud-dependent. Same internet-failure risk as Firebase Auth. All data must live on the event server. |
| PlanetScale / Neon / Turso | ❌ | Cloud-dependent. Match result writes fail if internet drops during a match. |

---

## 5. ORM + Migrations

### Recommendation: `drizzle-orm@0.45.1` + `drizzle-kit@0.31.10`

Drizzle is a TypeScript-first, lightweight ORM (~7.4kb minified+gzipped, 0 dependencies). It generates fully typed query results from schema declarations. Both packages were published within the last 3 days — actively maintained.

```ts
// schema.ts (game-owned tables)
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const playerStats = sqliteTable("player_stats", {
  userId:        text("user_id").primaryKey(),
  rankScore:     integer("rank_score").default(1000).notNull(),
  xp:            integer("xp").default(0).notNull(),
  level:         integer("level").default(0).notNull(),
  upgradePoints: integer("upgrade_points").default(0).notNull(),
  spellUpgrades: text("spell_upgrades").default("{}").notNull(),
});

// Fully typed: db.select().from(playerStats) returns PlayerStats[]
```

Migration workflow:
```bash
# During development: push schema directly (no migration files)
pnpm drizzle-kit push

# For production deploys: generate SQL migration files
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

**Why NOT Prisma:**
Prisma requires downloading a ~50MB binary during `npm install` (Prisma Engines). This `postinstall` download can fail or be slow on event-day internet. Prisma also requires a code-generation step (`prisma generate`) before the TypeScript compiler can resolve types, adding a build step that trips up first-time devs. Drizzle has no binary, no generation step, and is ~10x smaller.

---

## 6. CORS

### Recommendation: `cors@2.8.6`

Standard Express CORS middleware. Must be configured with specific origins (not `*`) and `credentials: true` because better-auth uses cookie-based sessions.

```ts
app.use(cors({
  origin: [
    "http://localhost:5173",       // Vite dev server
    process.env.CLIENT_ORIGIN!,    // e.g. "https://mages.example.com"
  ],
  credentials: true,               // required for cookie auth
}));
```

Security note: `credentials: true` with `origin: "*"` is rejected by browsers. Always specify exact origins.

---

## 7. Socket Authentication — Game Session Tokens

### Recommendation: `jsonwebtoken@9.0.3`

better-auth handles HTTP auth (login, session cookies). Socket.io needs a separate, stateless auth mechanism — passing cookies through socket.io is fragile and exposes them to JavaScript storage. The pattern is:

1. Player logs in via Google OAuth → better-auth issues session cookie
2. Player hits `GET /api/game-token` (REST endpoint, authenticated via cookie) → server issues a short-lived JWT (15 min), signed with `JWT_SECRET`
3. Phaser client stores JWT in memory (not localStorage — it expires quickly anyway)
4. Phaser passes JWT as `auth.token` on socket.io connection
5. Socket.io middleware on server verifies JWT on each namespace join

```ts
// Socket.io auth middleware
io.of("/game").use((socket, next) => {
  const token = socket.handshake.auth.token as string;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string };
    socket.data.userId = payload.sub;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});
```

**Security requirements:**
- `JWT_SECRET` must be randomly generated (at least 32 bytes of entropy), never hardcoded
- 15-minute expiry minimises the exposure window if a token is intercepted
- Client requests a fresh token before each match start (not per-message — just once per connection)
- Never validate tokens on the client side — only the server verifies JWTs

---

## 8. Ranking System

### Recommendation: Custom Elo implementation — **no library needed**

Elo is 5 lines of arithmetic. No library is warranted; it would add a versioned dependency for a trivial mathematical formula.

```ts
const K_FACTOR = 32;

export function eloUpdate(winnerRating: number, loserRating: number) {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  return {
    winner: Math.round(winnerRating + K_FACTOR * (1 - expectedWinner)),
    loser:  Math.round(loserRating  + K_FACTOR * (0 - (1 - expectedWinner))),
  };
}
```

**Battle Royale Elo:** Apply pairwise against the player who eliminated you. 1st place is considered the "winner" against all other players for secondary Elo adjustments.

**Team mode Elo:** Average the Elo of each team, update team average, distribute proportionally per-player.

Starting Elo: 1000 for all new accounts. Displayed rank tier can be derived from score bands (e.g., Bronze < 1100, Silver 1100–1300, Gold 1300+).

---

## 9. Spell Progression & XP Leveling

### No additional library needed — pure DB schema + arithmetic

**XP formula:**
- Win: 100 XP + 10 × kills
- Loss: 25 XP + 10 × kills

**Level formula** (smooth growth curve):
```ts
level = Math.floor(Math.sqrt(xp / 50))
// Level 1 = 50 XP, Level 2 = 200 XP, Level 5 = 1250 XP, Level 10 = 5000 XP
```

**Upgrade points:** 1 point per level-up. Spent on stats stored in `player_stats.spellUpgrades` JSON:

```json
{
  "maxHp": 0,        // 0–3 upgrades, +10 HP each → max +30 HP
  "maxMana": 0,      // 0–3, +15 mana each → max +45 mana
  "cooldownMult": 0  // 0–3, −5% cooldown each → max −15%
}
```

Server reads `player_stats` at lobby join and factors upgraded stats into the authoritative game session. Clients receive their effective stats in the match-start event and display them in HUD.

---

## 10. What NOT to Add

| Technology | Decision | Reason |
|-----------|----------|--------|
| **Redis** | ❌ Skip | In-process `Map<lobbyCode, LobbyState>` in the Node.js server is sufficient for one process at event scale. No need for a separate cache/pubsub service. |
| **GraphQL** | ❌ Skip | REST is faster to implement, easier to debug, and the data access patterns are simple enough (player profile, match history, leaderboard). |
| **P2P / WebRTC** | ❌ Skip | Server-authoritative socket.io is required for PvP anti-cheat. All spell hit detection runs on the server. |
| **Firebase (any)** | ❌ Skip | Creates a cloud-dependent failure mode for a physical venue event. Self-host everything. |
| **PostgreSQL** | ❌ Skip | SQLite handles the load with headroom. Adding Postgres adds ops complexity with zero benefit at event scale. |
| **Prisma** | ❌ Skip | Binary download, code-generation step. Drizzle is simpler, smaller, and faster. |
| **Colyseus** | ❌ Skip | Adds a framework abstraction layer over socket.io that increases learning overhead without adding meaningful capabilities for 2 devs. |
| **NextAuth / Auth.js** | ❌ Skip | Better-auth covers the same ground with a cleaner non-Next.js integration story. |

---

## Installation Commands

### Server (new `server/` sub-project)

```bash
# Runtime
pnpm add express socket.io better-auth drizzle-orm better-sqlite3 jsonwebtoken cors

# Dev / types
pnpm add -D drizzle-kit tsx @types/express @types/node @types/cors @types/jsonwebtoken @types/better__sqlite3 typescript
```

### Client (existing Phaser repo root)

```bash
pnpm add socket.io-client
```

---

## Sources

All versions verified against npmjs.com on March 26, 2026.

| Library | Verified Version | Source | Confidence |
|---------|-----------------|--------|-----------|
| socket.io | 4.8.3 | npmjs.com/package/socket.io | HIGH |
| socket.io-client | 4.8.3 | npmjs.com/package/socket.io-client | HIGH |
| better-auth | 1.5.6 — published 4 days ago | npmjs.com/package/better-auth + better-auth.com/docs | HIGH |
| passport-google-oauth20 | 2.0.0 — published **7 years ago** | npmjs.com/package/passport-google-oauth20 | HIGH |
| better-sqlite3 | 12.8.0 — published 13 days ago | npmjs.com/package/better-sqlite3 | HIGH |
| drizzle-orm | 0.45.1 — published 3 days ago | npmjs.com/package/drizzle-orm | HIGH |
| drizzle-kit | 0.31.10 — published 3 days ago | npmjs.com/package/drizzle-kit | HIGH |
| express | 5.2.1 — published 4 months ago | npmjs.com/package/express | HIGH |
| fastify | 5.8.4 | npmjs.com/package/fastify | HIGH |
| jsonwebtoken | 9.0.3 | npmjs.com/package/jsonwebtoken | HIGH |
| cors | 2.8.6 | npmjs.com/package/cors | HIGH |
