// Tijolinhos award — credits Feira de Jogos platform currency after a match.
//
// Ported from the friend's Expelled game (MOHG-Enterprises/Expelled,
// src/scenes/PostGameScene.ts `_initFeira` + src/game/rewards.ts), adapted to:
//   - fetch instead of axios (no new dependency)
//   - a dev/unset no-op guard so localhost runs and missing product ids never fire
//     a guaranteed-403 request (FRIDAY-SHIP-PLAN smoke-test expects the no-op log)
//   - our TDM stats shape (kills + winningTeam) instead of Expelled's role/outcome
//
// Flow (same as Expelled): Google Identity Services One Tap prompts on the results
// screen; its callback receives a Google ID token; we POST { product, value } to
// /api/v2/credit with `Authorization: Bearer <token>`. The platform credits the
// logged-in feira account. Note the ~4h per-user/product cooldown on repeat credits.

import {
  TIJOLINHOS_PRODUCT_ID,
  TIJOLINHOS_GSI_CLIENT_ID,
  TIJOLINHOS_CREDIT_URL,
  TIJOLINHOS_PARTICIPATION,
  TIJOLINHOS_WIN_BONUS,
  TIJOLINHOS_LOSS_BONUS,
  TIJOLINHOS_DRAW_BONUS,
  TIJOLINHOS_PER_KILL,
  TIJOLINHOS_MAX,
} from '../common/config';

export type TijolinhosStatus = 'skipped' | 'pending' | 'done' | 'error';

// Minimal GSI surface used by this module — read off globalThis instead of adding
// @types/google.accounts + a tsconfig `types` override (which would suppress the
// project's default ambient-type resolution). The script tag in index.html provides it.
// One Tap "moment" notification — reports when the prompt fails to display (e.g. the page
// origin isn't authorized for the client id) so the caller can stop waiting on the callback.
type PromptMoment = {
  isNotDisplayed(): boolean;
  getNotDisplayedReason(): string;
  isSkippedMoment(): boolean;
  getSkippedReason(): string;
};
type GoogleAccountsId = {
  initialize(config: { client_id: string; callback: (res: { credential?: string }) => void }): void;
  prompt(momentListener?: (notification: PromptMoment) => void): void;
};

function getGsi(): GoogleAccountsId | undefined {
  const g = (globalThis as { google?: { accounts?: { id?: GoogleAccountsId } } }).google;
  return g?.accounts?.id;
}

/**
 * Pure reward calculation for one player's match result.
 * Same economy shape as Expelled's calculateReward (participation + outcome + per-action, capped);
 * if the platform product has a fixed price the value is ignored server-side anyway.
 */
export function calculateTijolinhos(stat: { team: number; kills: number }, winningTeam: number | null): number {
  let total = TIJOLINHOS_PARTICIPATION;
  if (winningTeam === null) {
    total += TIJOLINHOS_DRAW_BONUS;
  } else if (stat.team === winningTeam) {
    total += TIJOLINHOS_WIN_BONUS;
  } else {
    total += TIJOLINHOS_LOSS_BONUS;
  }
  total += stat.kills * TIJOLINHOS_PER_KILL;
  return Math.min(total, TIJOLINHOS_MAX);
}

/**
 * Fires the GSI One Tap prompt and, on credential, POSTs the credit.
 * `onStatus` drives the results-screen status line. Reports 'skipped' (with a
 * console no-op log) when off-platform, when the product id is unset, or when
 * the GSI script didn't load — never throws, never blocks the scene.
 */
export function awardTijolinhos(value: number, onStatus: (status: TijolinhosStatus, message: string) => void): void {
  const isBrowser = typeof window !== 'undefined' && !!window.location;
  const onLocalhost =
    !isBrowser || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (onLocalhost || TIJOLINHOS_PRODUCT_ID <= 0) {
    console.log(
      `[tijolinhos] DEV no-op (host=${isBrowser ? window.location.hostname : 'node'}, product=${TIJOLINHOS_PRODUCT_ID}, value=${value})`,
    );
    onStatus('skipped', '');
    return;
  }

  const gsi = getGsi();
  if (!gsi) {
    console.warn('[tijolinhos] GSI script not loaded — skipping credit');
    onStatus('skipped', '');
    return;
  }

  gsi.initialize({
    client_id: TIJOLINHOS_GSI_CLIENT_ID,
    callback: (res) => {
      if (!res.credential) {
        onStatus('error', 'ERRO AO CREDITAR :(');
        return;
      }
      onStatus('pending', 'ENVIANDO TIJOLINHOS...');
      fetch(TIJOLINHOS_CREDIT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${res.credential}`,
        },
        body: JSON.stringify({ product: TIJOLINHOS_PRODUCT_ID, value }),
      })
        .then((response) => {
          if (!response.ok) throw new Error(`credit failed: ${response.status}`);
          onStatus('done', `+${value} TIJOLINHOS!`);
        })
        .catch((err) => {
          console.error('[tijolinhos] credit error', err);
          onStatus('error', 'ERRO AO CREDITAR :(');
        });
    },
  });

  gsi.prompt();
}

/** Decode a JWT's payload segment (no verification — display only). */
function decodeJwtPayload(jwt: string): { email?: string; name?: string; sub?: string; [k: string]: unknown } | null {
  try {
    const seg = jwt.split('.')[1];
    const json = atob(seg.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * DEV-ONLY: test JUST the Google login (the same GSI One Tap the credit flow uses),
 * BYPASSING the localhost no-op guard and WITHOUT POSTing to the platform. Confirms the
 * One Tap prompt shows and returns an ID token, then decodes it so the caller can display
 * which Google account came back (the account that WOULD be credited).
 *
 * Requires this page's origin to be an AUTHORIZED JS ORIGIN for TIJOLINHOS_GSI_CLIENT_ID —
 * that's owned by the platform, not this repo. If it isn't, GSI logs "The given origin is
 * not allowed for the given client ID" to the console and no prompt appears.
 */
export function testGoogleLogin(onStatus: (status: TijolinhosStatus, message: string) => void): void {
  const gsi = getGsi();
  if (!gsi) {
    console.warn('[tijolinhos:test] GSI script not loaded — is the accounts.google.com script in index.html?');
    onStatus('error', 'GSI NAO CARREGOU');
    return;
  }

  onStatus('pending', 'ABRINDO LOGIN GOOGLE...');
  gsi.initialize({
    client_id: TIJOLINHOS_GSI_CLIENT_ID,
    callback: (res) => {
      if (!res.credential) {
        console.warn('[tijolinhos:test] callback fired with no credential');
        onStatus('error', 'SEM CREDENCIAL :(');
        return;
      }
      const claims = decodeJwtPayload(res.credential);
      console.log('[tijolinhos:test] login OK — ID token claims:', claims);
      console.log('[tijolinhos:test] raw credential (JWT):', res.credential);
      const who = claims?.email ?? claims?.name ?? claims?.sub ?? 'conta google';
      onStatus('done', `LOGADO: ${who}`);
    },
  });

  // Surface a non-displayed/skipped One Tap instead of hanging on 'pending' forever. The
  // most common cause on localhost is an unauthorized JS origin for the client id — GSI
  // also logs "The given origin is not allowed for the given client ID" to the console.
  gsi.prompt((n) => {
    if (n.isNotDisplayed()) {
      const reason = n.getNotDisplayedReason();
      console.warn('[tijolinhos:test] One Tap NOT displayed — reason:', reason);
      onStatus('error', `ONE TAP FALHOU: ${reason || 'origem nao autorizada?'}`);
    } else if (n.isSkippedMoment()) {
      const reason = n.getSkippedReason();
      console.warn('[tijolinhos:test] One Tap skipped — reason:', reason);
      onStatus('error', `ONE TAP PULADO: ${reason}`);
    }
  });
}
