# Feature Landscape: PvP Multiplayer (v2.0)

**Domain:** Browser-based competitive PvP — top-down wizard arena game
**Researched:** 2026-03-26
**Confidence:** HIGH (established multiplayer game design patterns, well-documented across industry)

> **Scope note:** Research focuses on NEW multiplayer features only. Existing single-player systems
> (spell casting, movement, health/mana, state machine, Phaser 3 rendering) are already built and out of scope.

---

## Feature 1: Lobby System

### How It Works

A lobby is a pre-match waiting room. Players gather before a match starts, see who is present, and the host controls when the match begins. The two dominant join models are: **invite code** (players share a short alphanumeric code) and **session list** (players browse open sessions). For a closed college event, invite code is simpler and more reliable — no need to browse a list.

Lobby state machine: `OPEN → PLAYERS_JOINING → ALL_READY → COUNTDOWN → MATCH_START`

The host (lobby creator) holds special powers: kick players, change game mode, start the match. On host disconnect, host must be transferred to another player or the lobby is destroyed.

### Table Stakes

| Feature | Why Expected | Complexity |
|---------|--------------|------------|
| Lobby code / shareable link | Players need to find each other without manual matchmaking | Low |
| Player list showing all members | Everyone sees who joined | Low |
| Ready state toggle per player | Prevents match starting before everyone is set | Low |
| Host can kick players | Remove AFKs or wrong players | Low |
| Game mode selector (host-only) | Mode chosen before match | Low |
| Lobby auto-destroys when empty | Prevents orphan sessions in DB on disconnect | Low |
| Transfer host on host disconnect | Lobby survives if host leaves | Medium |
| Minimum player enforcement | Can't start 1v1 Battle Royale | Low |

### Differentiators

| Feature | Value | Complexity |
|---------|-------|------------|
| Lobby countdown with cancel window (5s) | Prevents accidental starts | Low |
| Show player element preference (cosmetic) | Builds anticipation | Low |
| Host can lock lobby to prevent new joins | Prevents late joiners after setup | Low |

### Anti-Features

| Feature | Why Avoid |
|---------|-----------|
| Ranked auto-matchmaking queue | Requires large active player base; college event is a controlled group — invite codes suffice |
| Lobby chat | Real people are in the same room at a college event; chat adds complexity for no gain |
| Password-protected lobbies | Invite code already provides exclusion; double protection is friction |

### Edge Cases to Handle

- Host disconnects mid-lobby → transfer host to earliest-joined player; if no other players, destroy lobby
- Player joins after mode is set → show them the already-selected mode (no re-selection)
- Player clicks "start" before others are ready → enforce minimum players, block if not all ready
- Lobby code collision → retry with new code on conflict (probability negligible with 6-char codes)

### Dependencies

- Requires Auth (player identity to show names)
- Feeds Match Lifecycle (lobby state transitions to match start)

---

## Feature 2: Battle Royale Mode

### How It Works

All players spawn in the same arena and fight until one remains. The defining mechanic is the **shrinking safe zone** — a visible boundary ring that contracts over time, dealing damage to players outside it. This forces engagements and prevents camping. In small-scale BR (< 16 players), match duration should be 3–8 minutes with fast zone timing. No respawns.

Zone mechanics: Start with full arena safe, begin contracting after ~60s, emit periodic tick damage (e.g., 1 HP/s) to players outside. The zone radius should contract in 2–3 stages with visual countdown per stage.

Player count is displayed as a HUD element counting down. When only 1 player remains, match ends immediately.

### Table Stakes

| Feature | Why Expected | Complexity |
|---------|--------------|------------|
| No respawn after elimination | Defining BR rule | Low |
| Shrinking safe zone that deals damage outside | Pacing and anti-camping mechanic | Medium |
| Remaining-player count HUD | "X players remain" is genre-standard | Low |
| Zone visual (colored warning ring on map) | Player must see boundary | Medium |
| Winner announcement when 1 remains | Match end condition | Low |
| Placement tracking (1st, 2nd, 3rd...) | Needed for ranked scoring | Low |
| Spectate eliminated players (observe only) | Players who die early don't stare at a black screen | Medium |

### Differentiators

| Feature | Value | Complexity |
|---------|-------|------------|
| Zone stage announcements ("Zone closing in 15s") | Tension-building warning | Low |
| Kill announcement in HUD ("ArthurMage was eliminated by XFireMage") | Social visibility, crowd engagement | Low |
| Final-circle rage mode (all stats boosted inside zone for last 3 players) | Climactic endgame | High |

### Anti-Features

| Feature | Why Avoid |
|---------|-----------|
| Respawn mechanic in BR | Breaks the mode's core identity |
| Gradual loot drops / pickups | Adds system complexity without value in a spell-based game where kit is element-determined |
| Large maps with multiple zones | Overkill for < 16 players; one arena, one zone |

### Edge Cases to Handle

- Two players die simultaneously → both placed at same finishing position; both receive same ranking points
- Player disconnects during match → treat as eliminated at that moment (don't leave ghost player)
- Zone contracts to zero area → kill all remaining players (failsafe for draw at equal HP)
- Last two players both die from zone simultaneously → draw; split ranking points

### Dependencies

- Requires Match Lifecycle (match start/end FSM)
- Requires Ranking System (placement → ELO delta calculation)

---

## Feature 3: Team vs Team Modes (2v2, 3v3, 4v4)

### How It Works

Players are split into two teams. Teams fight until all players on one team are eliminated. Win condition is last team standing. Team assignment happens in the lobby: the host assigns teams manually OR players self-sort by joining Team A/Team B slots.

For a college event where friend groups come to play together, **manual team assignment in lobby** is fastest and most intuitive. Random auto-assignment is an acceptable fallback.

Teams are color-coded (e.g., blue vs red) in the arena — both for player character tinting and HUD display. Friendly fire OFF by default for clarity.

Team sizes: 2v2, 3v3, 4v4 — lobby must enforce equal team sizes before allowing match start.

### Table Stakes

| Feature | Why Expected | Complexity |
|---------|--------------|------------|
| Team color coding on player characters | Instant visual identification | Low |
| Team roster display in lobby | See who's on which team | Low |
| Last-team-standing win condition | Standard team elimination mode | Low |
| Friendly fire OFF | Prevents accidents; clarity for new players | Low |
| Elimination shows "X's team eliminated Y" | Kill feed with team attribution | Low |
| Living allies visible on minimap / overlay | Team coordination | Medium |
| Win screen showing team result (WIN / LOSE) | Clear outcome presentation | Low |
| Equal team size enforcement before match start | Prevents unfair imbalanced starts | Low |

### Differentiators

| Feature | Value | Complexity |
|---------|-------|------------|
| Team HP bar aggregate in HUD (total team remaining HP) | Team awareness without overcrowding | Medium |
| Host assigns teams in lobby | Fast and social for event | Low |
| "Ally" name shown above player heads | Quick identification in chaotic fights | Low |

### Anti-Features

| Feature | Why Avoid |
|---------|-----------|
| In-game team text chat | Same room at college event; overhead and distraction |
| Asymmetric team sizes (3v4) | Creates fairness complaints; not worth the design complexity |
| Team respawn / revival mechanic | Extends match too long; muddles elimination clarity |

### Edge Cases to Handle

- All members of one team disconnect → surviving team wins immediately
- Player disconnects mid-match → count as eliminated; team continues with remaining members
- Uneven team assignment in lobby → enforce equal sizes before host can start
- All players on both teams eliminated simultaneously → draw; both teams receive partial ranking points
- 2v2 where one player disconnects → 2v1; surviving player continues (no auto-forfeit)

### Dependencies

- Requires Lobby System (team assignment in pre-match)
- Requires Match Lifecycle (team-based win condition detection)
- Requires Ranking System (team win/loss → individual ELO update)

---

## Feature 4: Match Lifecycle

### How It Works

A match progresses through well-defined states. Each state has entry conditions and exit conditions. Both server and client must agree on current state via socket events.

```
LOBBY
  ↓ (host starts, minimum players met, all ready)
LOADING        ← clients load arena assets
  ↓ (all clients signal ready)
COUNTDOWN      ← 3-2-1 displayed, players can't move
  ↓ (countdown complete)
ACTIVE         ← game running, full play
  ↓ (win condition met OR timeout)
ENDED          ← no more gameplay actions accepted
  ↓ (results tallied, rankings updated)
RESULTS        ← results screen shown
  ↓ (return to lobby or new lobby)
LOBBY / DISBANDED
```

Match data stored server-side: participant IDs, team assignments, elimination order, duration. This feeds ranking calculation and progression XP.

### Table Stakes

| Feature | Why Expected | Complexity |
|---------|--------------|------------|
| 3-2-1 countdown before match starts | Build tension, prevent unfair early kills | Low |
| Match state synced via server (authoritative) | Prevents desync between clients | Medium |
| Server validates win condition | Can't cheat match end from client | Medium |
| Results screen with placements / team outcome | Players see how they did | Low |
| Disconnect = auto-elimination (not forfeit for whole team) | Clean handling of drops | Low |
| Return to lobby after match ends | Fast replay loop | Low |
| Match timeout (e.g., 10-minute hard limit) | Prevents infinite stalemates | Low |

### Differentiators

| Feature | Value | Complexity |
|---------|-------|------------|
| Auto-rematch vote from results screen | Keeps the group playing together | Low |
| Kill feed summary on results screen | Post-game engagement, crowd review | Low |
| Observer slot (admins can watch without playing) | Event organizer oversight | Medium |

### Anti-Features

| Feature | Why Avoid |
|---------|-----------|
| Mid-match joins (late entry into active match) | Unfair advantage/disadvantage; state sync complexity is high |
| Pause mechanic | Multiplayer pause is complex; event matches should be short enough to finish |
| Match surrender vote | Extends complexity; event matches are short enough to finish |

### Edge Cases to Handle

- All players disconnect during ACTIVE → server marks match as abandoned, no ranking changes
- Only 1 player remains in BR before countdown finishes → impossible (countdown is pre-game), handle server-side guard
- Network partition: client never receives ACTIVE signal → server emits full state on reconnect, client re-syncs
- Match ends with 0 players (everyone died in zone simultaneously) → emit ENDED with "draw" outcome; all players receive consolation ranking points

### Dependencies

- Requires Lobby System (lobby state feeds into LOADING)
- Is required by Ranking System (match result is the input)
- Is required by Spell Progression (XP granted on match ENDED event)

---

## Feature 5: Ranking System

### How It Works

**Recommendation: ELO with K=32, base 1000, placement-weighted for BR.**

For a college event with 50–100 players and sequential short matches, ELO is ideal:
- Simple to implement, transparent to players
- Self-correcting: new players converge quickly toward their true rating
- No hidden MMR factors that feel arbitrary
- Works for both 1vMany (BR) and team matches

**ELO formula:**

$$E_A = \frac{1}{1 + 10^{(R_B - R_A)/400}}$$

$$R'_A = R_A + K \cdot (S_A - E_A)$$

Where K=32 and S_A = actual score (1 = win, 0 = loss, scaled by placement).

**BR placement scoring:** Convert placement to win probability:
- 1st place: S = 1.0
- 2nd place: S = 0.75
- 3rd place: S = 0.5
- 4th–last: S = 0.1 (small positive, rewards participation)
- Opponent is treated as "average of all other players in match"

**Team match:** Win = S = 1.0, Loss = S = 0.0. Every player on winning team gains ELO vs every player on losing team (averaged opponent ELO).

### Table Stakes

| Feature | Why Expected | Complexity |
|---------|--------------|------------|
| Single ELO score per account | Standard competitive ranking | Low |
| ELO updates after every match | Immediate feedback loop | Low |
| Global leaderboard (top N players) | Social competition, event display | Low |
| Player's own rank and score visible | Self-reference feedback | Low |
| Disconnect handling: no change if match abandoned server-side | Prevents manipulation | Low |

### Differentiators

| Feature | Value | Complexity |
|---------|-------|------------|
| Rank tier names (e.g., Apprentice 0-999, Mage 1000-1199, Archmage 1200+) | Emotional progression beyond raw number | Low |
| Match history (last 10 matches with outcome and delta) | Transparency, engagement | Medium |
| Provisional period (first 5 matches have K=64 for faster calibration) | New players converge faster | Low |

### Anti-Features

| Feature | Why Avoid |
|---------|-----------|
| Hidden MMR (separate from displayed rank) | Overengineered for 50-100 players; breeds distrust |
| Decay (lose ELO for not playing) | Event is time-limited; decay serves no purpose |
| Season resets | Event is a single session/day; no seasons needed |
| Per-element separate rankings | Too granular; fragments the small player base |

### Balance Notes

- **K=32** gives meaningful movement per match (~16-32 points) while not being volatile. A player who wins 5/5 matches from 1000 starts at ~1100–1150, clearly above baseline.
- **Event-scale:** With 50–100 players, if the top 3 players play each other repeatedly, ELO converges meaningfully within the event day.
- **No protection from "first match" ELO drop** — this is fine at an event. Everyone starts equal.

### Dependencies

- Requires Match Lifecycle (match result data)
- Requires Auth (ELO stored per account)

---

## Feature 6: Spell Progression / Leveling

### How It Works

Players earn XP after each match. Accumulating XP levels up their account. Each level grants one upgrade point. Points are spent on stat upgrades that persist across all subsequent matches.

**Core design rule:** Upgrades must be **additive stat bonuses, never qualitative unlocks.** A 10% cooldown reduction is acceptable. Unlocking a new spell exclusively at level 5 is unacceptable (creates a pay-to-win feeling even in a free context).

**XP formula (recommended):**
- Win: 100 XP base + 10 XP per kill
- Loss (BR): 50 XP base + 10 XP per kill + 5 XP per placement position survived past 5th
- Level thresholds: flat 200 XP per level (simple, predictable), max level 5

**Max 5 upgrade points total.** Each upgrade is capped:
- Cooldown Reduction: max -15% (spread over 3 levels at -5% each)
- Max HP: max +20% (spread over 2 levels at +10% each)
- Max Mana: max +15% (spread over 2 levels at +7.5% each)

This ensures the max stat delta between a level-0 and level-5 player is meaningful but not dominant — a skilled new player still beats an unskilled max-level player.

### Table Stakes

| Feature | Why Expected | Complexity |
|---------|--------------|------------|
| XP earned after each match | Core feedback loop | Low |
| Level number displayed on profile / in lobby | Visual progression signal | Low |
| Upgrade point allocation UI | Player agency in progression | Medium |
| Upgraded stats applied in-match | Progression has visible effect | Medium |
| XP and level persisted server-side | Cross-session persistence | Low |

### Differentiators

| Feature | Value | Complexity |
|---------|-------|------------|
| XP gain summary in results screen ("You earned 130 XP") | Immediate reward signal | Low |
| Level-up animation/notification | Celebration moment | Low |
| Per-element upgrade specialization (e.g., Fire spells only) | Higher strategic depth | High |

### Anti-Features

| Feature | Why Avoid |
|---------|-----------|
| Damage multiplier upgrades | Creates hard stat snowball; level-5 players 2-shot where new players need 4 hits — unfun |
| Qualitative unlocks (new spells at level X) | P2W feeling; new players lack access to full kit |
| Health steal / lifesteal upgrade | Too mechanically complex to balance in short dev time |
| XP reset or wipe | Progression should persist for the entire event duration |

### Balance Concerns

| Risk | Level | Mitigation |
|------|-------|------------|
| Day-1 grinders stomp late joiners | Medium | Cap at level 5; 15% stat delta max is tolerable in a skill game |
| All players rush cooldown reduction (dominant strategy) | Low | With flat XP, reaching level 5 takes ~10 matches; event play time is limited |
| Level-5 player in BR vs four level-0 players | Medium | BR eliminates players by skill; 15% HP advantage matters less than positioning vs 4 opponents |
| Exploit: farming XP by creating and abandoning matches | Low | Server-side: minimum match duration before XP is awarded (e.g., must survive 30s or deal damage) |

### Dependencies

- Requires Auth (XP and level stored per account)
- Requires Match Lifecycle (ENDED event triggers XP calculation)
- Affects PvP Gameplay (upgraded stats injected into player at match start)

---

## Feature Dependency Map

```
Auth / Accounts
  ↓ enables
  Lobby System  ──────────────────────→  Match Lifecycle
  (player identity, team assignment)          ↓
                                         Ranking System  (ELO update)
                                              ↓
                                         Spell Progression  (XP grant)
                                              ↓
                                         PvP Gameplay  (upgraded stats in match)
```

**Critical path:** Auth → Lobby → Match Lifecycle must be fully working before Ranking or Progression can be tested end-to-end.

---

## MVP Recommendation

**Must-have for event launch:**
1. Lobby system with invite code and ready state (without this nothing else works)
2. Match Lifecycle FSM with disconnect handling (core stability)
3. Battle Royale mode with shrinking zone (most visually exciting mode for a crowd)
4. Team vs Team (2v2 minimum) — friend groups expect to play together
5. ELO ranking + global leaderboard (event needs a stakes mechanism)
6. XP + leveling with CDR/HP/mana upgrades (gives players reason to play multiple matches)

**Defer if time is tight:**
- Spectate eliminated players (would enhance experience but not required)
- Auto-rematch vote (nice-to-have; players can just re-create lobby)
- Provisional K-factor period (pure ELO with K=32 is fine for event scale)
- Per-element upgrade specialization (medium-high complexity, low urgency)

---

## Sources

- ELO system: well-documented in FIDE chess and adapted across competitive games (League of Legends, Overwatch era-1 documented public formulas) — HIGH confidence
- BR zone mechanic: standard since PUBG/Fortnite; canonical top-down implementation in games like ZombsRoyale.io — HIGH confidence
- Lobby patterns: socket.io room-based lobby is the industry standard for browser multiplayer — HIGH confidence
- Progression balance: derived from Overwatch (stat unlocks vs cosmetics), documented in GDC talks on competitive integrity — MEDIUM confidence on exact stat percentages (these are opinionated recommendations, not industry mandates)
