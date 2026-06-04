# Friday Ship Plan

> Solo dev, Phaser multiplayer game, school event **TOMORROW (Friday)**. Match bugs are already fixed. This doc covers: deployment (WSS/HTTPS + Vite base path), tijolinhos currency, and balance. Work top-to-bottom — the first section unblocks everything else.

---

## Do this FIRST (blocks everything): send these messages now

You cannot finish deployment or tijolinhos without these answers. **Message the friend first** (fastest unblock — copy their working convention), then the professor. Paste verbatim.

### → MENSAGEM PARA O AMIGO (jogo dele já roda na plataforma com servidor Node)

> Atalho que economiza horas: se puder, me manda o **link do repositório** (ou um zip) do seu jogo + qualquer arquivo de config de deploy que você entregou. É mais rápido eu copiar sua convenção do que reconstruir do zero. Mesmo assim, as perguntas:
>
> 1. Como foi o deploy do servidor Node/Socket.io? Mandou o código-fonte, subiu num git, entregou um build, ou rodou de outro jeito?
> 2. Qual o **comando de start** e o runtime do servidor (`node`, `tsx`, `npm start`)? O meu roda com `tsx` (`game-server/`) — isso funciona na plataforma ou preciso compilar pra JS antes?
> 3. **A porta é fixa ou injetada por variável de ambiente?** O meu servidor lê `process.env.PORT` (cai pra 3000 se não existir). A plataforma define `PORT` pra gente?
> 4. O servidor fica atrás de proxy reverso (nginx) num caminho, ou abre porta direto? Qual a URL/host final que ele atende?
> 5. **Como o cliente alcança o servidor?** Mesma origem num caminho tipo `feira-de-jogos.dev.br/<seu-jogo>/socket.io`, ou host/porta separados? (No meu código a URL está **chumbada como `http://<ip>:3000`** e o jogador digita o IP num diálogo — quero saber se troco isso por uma URL fixa.)
> 6. Teve que usar **`https://`/`wss://`** na conexão do cliente? A página é HTTPS e o meu cliente conecta em `http://`/`ws://` — tomou erro de **mixed content**? Como resolveu?
> 7. **Como o jogo embutido pega o token do usuário** (pra creditar tijolinhos)? A plataforma injeta o token na página (variável global / `<meta>` / cookie), tem um endpoint mesma-origem tipo `/api/v2/me`, ou você inicializa o Google Identity Services (GSI) você mesmo? **Essa é a mais importante.**
> 8. Como tratou o **CORS** no servidor? Deixou `origin: '*'` (é o que tenho) ou liberou a origem da plataforma especificamente?
> 9. Usa **WebRTC**? Se sim, o **STUN do Google bastou na LAN da feira** ou precisou de TURN próprio? (O meu só tem `stun:stun.l.google.com:19302`.)
> 10. Qual o **comando e a pasta de build do cliente**? (O meu é `pnpm build` → `dist/`, com `base: './'` no Vite.) A plataforma serve estáticos de uma pasta específica?
> 11. Quais **arquivos exatamente** você entregou e tem estrutura de pastas obrigatória? Alguma **pegadinha** (env var, porta, timeout, WebSocket bloqueado no proxy)?

### → MENSAGEM PARA O PROFESSOR

> 1. Meu jogo precisa de um **backend Node com Socket.io** (igual ao do <amigo> que já roda aí). Consegue hospedar do mesmo jeito? Pode me passar **um exemplo concreto já no ar** pra eu seguir a convenção?
> 2. **Como o jogo embutido obtém o token de login do usuário** pra creditar tijolinhos? A plataforma injeta o token na página, tem endpoint mesma-origem, ou eu mesmo inicializo o Google Identity Services? **(prioridade #1 — define toda a integração de moeda.)**
> 3. Qual vai ser o **slug/URL** do meu jogo (`feira-de-jogos.dev.br/<slug>/`)? É servido **com barra final** (`/<slug>/`) e `/<slug>` redireciona pra ela?
> 4. **Por qual URL/porta o cliente acessa o backend?** Tem convenção (ex.: `/<slug>/socket.io` mesma origem)? Preciso da **URL exata e definitiva** porque hoje está chumbada no cliente.
> 5. A página é **HTTPS**? Então o Socket.io/WebSocket precisa ser **`wss://` mesma origem** pra não bloquear por mixed content? Confirma como o WebSocket passa pelo proxy.
> 6. Qual o **`product` id** (inteiro) do meu jogo pro sistema de tijolinhos, e ele já está cadastrado como **tipo `games`**? (Senão tomo **403** ao creditar.) Tem **preço fixo (`price > 0`)** ou o valor vai do meu lado?
> 7. Pra login usamos **Google Identity Services**. Consegue adicionar meu **`client_id` do Google OAuth na allowlist** e autorizar minha origem? O GSI funciona embutido em `feira-de-jogos.dev.br/<slug>/`? (Só preciso disso se o token **não** for injetado pela plataforma — ver pergunta 2.)
> 8. Existe **ambiente de staging** pra eu validar deploy + crédito de tijolinhos antes da feira? (O cooldown de ~4h por usuário/produto no `/api/v2/credit` dificulta testar repetido.)
> 9. A plataforma injeta **`PORT` por env var** ou uso porta fixa? E **WebRTC/UDP** entre jogadores na LAN funciona, ou só TCP/WebSocket passa? (Confirma que **não há client-isolation** no Wi-Fi do local — isso quebra o mesh WebRTC sem TURN.)
> 10. Qual o **prazo, formato e estrutura de pastas** pra entrega (build do cliente + servidor)? git, zip, outro?

---

## Code changes I can make now (no dependency on answers)

These produce a build that works same-origin under HTTPS at any subpath, with no instant-kill spells. **Every relative import in this repo uses an explicit `.js` extension** — match it.

### A. HTTPS/WSS-aware connection (same-origin default)

**`src/common/config/network.ts`** — append after line 7:

```ts
/**
 * Resolve the Socket.io server URL from a user-typed host and the page's protocol.
 *   - protocol ALWAYS mirrors window.location.protocol (https -> wss; http -> ws).
 *   - empty host  -> same origin (platform default; reverse-proxied under same domain).
 *   - host with ':' -> use verbatim (force page protocol).
 *   - bare host/IP -> append dev port (LAN-only branch).
 */
export function resolveServerUrl(host: string): string {
  const isBrowser = typeof window !== 'undefined' && !!window.location;
  const proto = isBrowser && window.location.protocol === 'https:' ? 'https' : 'http';
  const trimmed = host.trim();
  if (!trimmed) {
    return isBrowser ? `${proto}://${window.location.host}` : `${NETWORK_SERVER_URL}:${NETWORK_SERVER_PORT}`;
  }
  if (trimmed.includes(':')) return `${proto}://${trimmed}`;
  return `${proto}://${trimmed}:${NETWORK_SERVER_PORT}`;
}
```

**`src/scenes/lobby-scene.ts`** — add import (~line 9):
```ts
import { resolveServerUrl } from '../common/config/network.js';
```
Hoisted helper above the class:
```ts
/** Default server host: 'localhost' on a dev box, '' (same-origin) on the platform. */
function defaultServerHost(): string {
  if (typeof window === 'undefined') return 'localhost';
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '' ? 'localhost' : '';
}
```
- `lobby-scene.ts:631` field init: `ip: 'localhost'` → `ip: defaultServerHost()`
- `lobby-scene.ts:722` reset: `ip: 'localhost'` → `ip: defaultServerHost()`
- `lobby-scene.ts:998–1000` (`#skipToLobbyConnect`): replace the 3 url-build lines with `const ip = this.#dialogueInputValue.ip; const url = resolveServerUrl(ip);`
- `lobby-scene.ts:1023–1028` (`#beginConnect`): same — `const ip = this.#dialogueInputValue.ip; ... const url = resolveServerUrl(ip);`

**`src/networking/network-manager.ts`** — import `resolveServerUrl` from `../common/config/network.js`; line 152: `const url = serverUrl ?? resolveServerUrl('');`

> ⚠️ Pre-existing singleton trap: `NetworkManager.init(url)` ignores the passed `url` after the first call. Same-origin default never changes so it doesn't block deploy, but if a corrected LAN IP "doesn't take", call `NetworkManager._resetInstance()` on connect-fail before re-init.

### B. Vite base path — KEEP `base: './'`, fix 4 absolute `/assets` refs

`config/vite.config.js:4` `base: "./"` is correct & relocatable — **no vite.config edit**. But 4 CSS `url()` literals use a leading `/` that 404s under a subpath. Drop the leading slash, prefix `./`:
- `index.html:21` and `:26` (@font-face): `/assets/fonts/...` → `./assets/fonts/...`
- `src/common/cursor.ts:3`: `'/assets/cursor/cursor.png'` → `'./assets/cursor/cursor.png'` (highest blast radius — every scene)
- `src/debug/debug-panel.ts:185, :202, :216`: `/assets/cursor/cursor-hover.png` → `./assets/cursor/cursor-hover.png`

Leave `index.html:109 <script src="/src/main.ts">` (dev-only, Vite replaces in build).

**Pre-ship flag:** `src/common/config/network.ts:34` `NETWORK_DEBUG = true` → `false`. Confirm `config/debug.ts:27` `DEV_SKIP_TO_GAMEPLAY` and `:36` `SKIP_TO_LOBBY` are `false`.

No server change: `server.ts:29` reads `process.env.PORT` (fallback 3000), binds `0.0.0.0`, `cors origin '*'`. If Socket.io is proxied under a sub-path, add matching `path` to `io(...)` (network-manager.ts:142) and `new Server(...)` (server.ts:33).

---

## Code changes that need the professor's answers

| Blocked on | Waiting for | Where |
|---|---|---|
| Tijolinhos `product` id | integer, type `games` | `TIJOLINHOS_PRODUCT_ID` in award-tijolinhos.ts (wrong = 403) |
| Auth source | injected / endpoint / GSI | `getInjectedIdToken()` body OR `GSI_CLIENT_ID` + index.html GSI script |
| `GSI_CLIENT_ID` | Google OAuth client id (if GSI) | award-tijolinhos.ts |
| Award economy | price-fixed? (`price>0` ignores value) | award constants (cosmetic if fixed) |
| Production host(s) | exact embed host | `PRODUCTION_HOSTS` |
| Vite slug + trailing slash | `/<slug>/` trailing slash | confirm only (base `./` handles it) |
| Socket.io proxy `path` | root or sub-path | add `path` to io() + server if sub-path |

---

## Tijolinhos integration (paste-ready once you have product id)

See the full agent output for the complete `src/networking/award-tijolinhos.ts` module, the `tdm-results-scene.ts` edits, and the `index.html` GSI script tag. Key facts: POST `/api/v2/credit` (relative = same-origin, no CORS on-platform), `Authorization: Bearer <Google ID token>`, body `{ product, value }` → 201. No-ops off the production domain. The only real risk is the auth-token source (Prof Q2 / Friend Q7) — copy whatever the friend's game does.

---

## Balance pass (apply now) — max HP = 10, ≥5 dmg = one-shot risk, target 2–4 min matches

- **DarkBolt instant-kill (9999):** `src/common/config/spells/dark-bolt.ts:23` `DARK_BOLT_PICKUP_CHARGES = 5` → `0` (disable for event).
- **Lightning:** `thunder.ts:14` `LIGHTNING_BURST_COMBO_DAMAGE 8 → 5`; `:15` `LIGHTNING_STRIKE_COMBO_DAMAGE 6 → 4`.
- **Earth+Fire:** `earth.ts:104` `EARTH_FIRE_EXPLOSION_DAMAGE 5 → 3`; `earth.ts:76` `MOLTEN_BOLT_DAMAGE_MULTIPLIER 2.0 → 1.5`.
- **Win target (BOTH files):** `game-server/src/types.ts:243` AND `src/common/config/tdm.ts:14` `TDM_WIN_TARGET 30 → 15`.
- **Respawn invuln (BOTH files):** `game-server/src/types.ts:248` AND `src/common/config/tdm.ts:15` `RESPAWN_INVULN_MAX_MS 2500 → 3000`.
- Optional: `player.ts:3` `PLAYER_SPEED 80 → 85`; `player.ts:28` `PLAYER_MANA_REGEN_RATE 5 → 6`.

After edits, no spell exceeds 5 dmg → no one-shots.

---

## Tonight's smoke-test checklist

1. Apply all "now" edits (Section A WSS, B Vite ×4 + NETWORK_DEBUG=false, Balance incl. BOTH TDM files + BOTH respawn files).
2. Sync-pair sanity: `TDM_WIN_TARGET`=15 in BOTH files; `RESPAWN_INVULN_MAX_MS`=3000 in BOTH.
3. Flags off: NETWORK_DEBUG=false, DEV_SKIP_TO_GAMEPLAY & SKIP_TO_LOBBY false.
4. `pnpm build` (runs tsc first — must pass clean; validates new `.js` imports + resolveServerUrl). Run EARLY.
5. `pnpm lint`.
6. Local 2-client run (game-server `npm run dev` + `pnpm start`, two tabs at localhost:5173). Default shows `localhost`, both connect.
7. Full TDM flow: countdown → spawn → cast every element → damage → die → respawn (~3s invuln blink) → continue. NO instant-kills. Ends at 15 kills, results render.
8. Time one match (~2–4 min). Nudge TDM_WIN_TARGET if off.
9. Tijolinhos no-op check on localhost: console logs `[tijolinhos] DEV no-op`, no error.
10. Subpath dry-run: `pnpm build`, `npx serve dist`, open `http://localhost:3000/anything/` (trailing slash). Confirm font + custom cursor load, no `/assets` 404s. Best local proxy for the platform embed.
11. Hand-off: `dist/` ready, server start command known, reads `process.env.PORT`. Hold final deploy for prof answers.

**At the booth before opening:** fill prof-answered constants (product id, auth source/GSI_CLIENT_ID, PRODUCTION_HOSTS, Socket.io path), rebuild, redeploy, run one live match, confirm a 201 (or expected 429 cooldown) for the award.
