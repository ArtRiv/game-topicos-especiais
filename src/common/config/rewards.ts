// Feira de Jogos reward integration — config + tunables.
//
// The platform rewards players with "tijolinhos" at match end. Auth is Google OAuth 2.0
// (Google One Tap); credit is sent via POST https://feira-de-jogos.dev.br/api/v2/credit
// with a Bearer token (the Google credential JWT) and a body { product, value }.
//
// ── WHAT YOU MUST FILL IN (see the integration checklist) ─────────────────────────────────────
// FEIRA_PRODUCT_ID — the numeric product id the Feira assigns AFTER the game is registered on the
//                    platform. Placeholder `1` for now (the professor's reference example also uses 1);
//                    UPDATE to the real id once he registers the game. A wrong id just makes the credit
//                    POST fail with a clear inline error — it never blocks the player.
// GOOGLE_CLIENT_ID — the platform's PUBLIC OAuth 2.0 Web client id (feira-de-jogos.dev.br). Confirmed
//                    from the professor's reference repo (tes20261/game GameOver.ts) — the SAME id the
//                    Expelled game uses, i.e. it's the platform-wide client id, safe to commit.
export const FEIRA_PRODUCT_ID = 1;
export const GOOGLE_CLIENT_ID = '331191695151-ku8mdhd76pc2k36itas8lm722krn0u64.apps.googleusercontent.com';

// Master switch. When false, NO reward UI / Google SDK is touched at all (clean LAN/dev play).
// Both ids above are set (product id is a placeholder), so this can be turned on to test the flow.
export const FEIRA_REWARDS_ENABLED = true;

// The Feira credit endpoint. Pinned here so it's swappable if the platform ever versions the API.
export const FEIRA_CREDIT_URL = 'https://feira-de-jogos.dev.br/api/v2/credit';

// ── Reward formula tunables (Team Deathmatch) ─────────────────────────────────────────────────
// The TDM stats available at match end are per-player kills/deaths + whether the player's team
// won + whether the player is MVP (highest kills). The formula in src/game/rewards.ts maps those
// to tijolinhos. Values mirror the spirit of the reference integration (participation floor + a
// win bonus + per-kill, with an MVP bonus and a hard cap).
export const REWARD_PARTICIPATION = 15;   // base, just for finishing the match
export const REWARD_WIN_BONUS = 45;        // your team won
export const REWARD_LOSS_BONUS = 10;       // your team lost (consolation)
export const REWARD_PER_KILL = 4;          // × kills
export const REWARD_MVP_BONUS = 20;        // highest-kills player
export const REWARD_MAX = 200;             // hard cap on the total (matches the reference ceiling)
