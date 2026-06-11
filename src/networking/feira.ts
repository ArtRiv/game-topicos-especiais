// Feira de Jogos credit flow — Google One Tap auth + the credit POST. Isolated from the results
// scene so the scene only deals with UI state. Mirrors the reference integration (Expelled):
// the Google credential JWT becomes the Bearer token, and { product, value } is the body.
//
// No external deps: uses fetch (not axios) and a minimal local declaration of the One Tap API
// (so we don't pull in @types/google.accounts). The full SDK is loaded from index.html.

import {
  FEIRA_PRODUCT_ID,
  FEIRA_CREDIT_URL,
  GOOGLE_CLIENT_ID,
  FEIRA_REWARDS_ENABLED,
} from '../common/config/rewards';

// ── Minimal Google Identity Services (One Tap) typing — only what we use. ─────────────────────
interface GoogleCredentialResponse {
  credential: string; // the ID-token JWT we forward as the Bearer token
}
interface GoogleIdConfig {
  client_id: string;
  callback: (res: GoogleCredentialResponse) => void;
}
interface GoogleAccountsId {
  initialize(config: GoogleIdConfig): void;
  prompt(): void;
}
// The SDK attaches `google.accounts.id` to window once the gsi/client script loads.
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

/** Reasons the claim flow can't run — surfaced to the UI so it can show a precise message. */
export type FeiraUnavailableReason =
  | 'disabled'        // FEIRA_REWARDS_ENABLED is false (LAN/dev build)
  | 'no-client-id'    // GOOGLE_CLIENT_ID not configured
  | 'no-product-id'   // FEIRA_PRODUCT_ID not configured
  | 'sdk-missing';    // the gsi/client script didn't load (offline / blocked)

/** Returns null if the claim flow CAN run, or a reason it cannot. Pure check — no side effects. */
export function feiraUnavailableReason(): FeiraUnavailableReason | null {
  if (!FEIRA_REWARDS_ENABLED) return 'disabled';
  if (!GOOGLE_CLIENT_ID) return 'no-client-id';
  if (!FEIRA_PRODUCT_ID) return 'no-product-id';
  if (!window.google?.accounts?.id) return 'sdk-missing';
  return null;
}

/**
 * Trigger Google One Tap, then POST the reward to the Feira on success. All outcomes are reported
 * through the callbacks so the caller (the scene) drives its own UI; this module never touches the DOM
 * beyond the Google SDK. Safe to call only when feiraUnavailableReason() returned null.
 *
 * @param amount    the tijolinhos total to credit (from calculateReward)
 * @param onPending called the moment the user authenticates and the POST is in flight
 * @param onSuccess called when the credit POST succeeds
 * @param onError   called on any failure (auth refused is silent — neither fires)
 */
export function claimFeiraReward(
  amount: number,
  handlers: { onPending: () => void; onSuccess: () => void; onError: (message: string) => void },
): void {
  const id = window.google?.accounts?.id;
  if (!id) {
    handlers.onError('Google indisponível');
    return;
  }

  id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (res: GoogleCredentialResponse) => {
      handlers.onPending();
      void fetch(FEIRA_CREDIT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${res.credential}`,
        },
        body: JSON.stringify({ product: FEIRA_PRODUCT_ID, value: amount }),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          handlers.onSuccess();
        })
        .catch(() => handlers.onError('Erro ao adicionar crédito'));
    },
  });

  // Shows the One Tap prompt. If the user dismisses it, neither callback fires (by design).
  id.prompt();
}
