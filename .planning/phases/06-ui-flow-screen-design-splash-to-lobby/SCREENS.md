# Screen Design Map — Phase 06
> Authoritative reference for all screens from Splash to Lobby.
> Last updated: 2026-04-06

## Navigation Flow

```
Splash → Main Menu → Create Lobby → Lobby (→ Game)
                   ↘ Join Lobby   → Lobby (→ Game)
                   ↘ Account      (placeholder)
                   ↘ Options      (placeholder)
                   ↘ Credits      (placeholder)
```

## Screens

### 1. Splash Screen
**Scene key:** `SPLASH_SCENE`
**File:** `src/scenes/splash-scene.ts` *(created in Plan 06-01)*
**Music:** `menu_music.ogg` (starts playing immediately; handles browser autoplay unlock)
**Background:** Pure black (`0x000000`)
**Text content:**
  - `"PRESS ANYTHING TO\nGET HIGH IN THE\nFANTASY"` — font: FONT_PRESS_START_2P 8px #e0e0e0, centered, lineSpacing 6
**Animations:** Text blinks (alpha 1 → 0.1 → 1, 600 ms yoyo loop)
**Navigation:** Any key / pointer click → fade-out 400 ms → Main Menu
**Design notes:** Entry point for the game. Music begins here before MainMenuScene.

---

### 2. Main Menu
**Scene key:** `MAIN_MENU_SCENE`
**File:** `src/scenes/main-menu-scene.ts`
**Music:** `menu_music.ogg` (continued from Splash)
**Background:** Looping MP4 video (`assets/images/ui/landscape.mp4`), cover-scaled with LINEAR filter to avoid NEAREST-mode artifacts on downsampled video; semi-transparent black vignette overlay (alpha 0.5)
**Text content:**
  - Title: `"HIGH FANTASY"` — 20px #ffd700, stroke #000000 2px
  - Subtitle: `"- ONLINE EDITION -"` — 8px #8888cc
  - Menu items: `"CRIAR LOBBY"`, `"ENTRAR EM LOBBY"`, `"CONTA"`, `"OPCOES"`, `"CREDITOS"`, `"SAIR"` — 10px #e0e0e0
  - Footer: `"v0.1 DEV"` — 6px #333355, bottom-right
**Animations (Plan 06-02 — cinematic intro):**
  - On scene start: title, subtitle, and menu items drawn at alpha=0
  - At `MUSIC_DROP_MS` (≈ 14 200 ms): title impact flash (scale 1.3 → 1.0, 250 ms Back.Out), subtitle fades in (400 ms, 150 ms delay), menu items stagger in (300 ms, 60 ms between each)
  - Second visit (back from sub-scene): all items immediately visible — cinematic skipped via `cinematicPlayed` flag
  - Hover: selected item turns #ffd700; selector box (alpha 0.25) slides to hovered row
**Navigation:**
  - CRIAR LOBBY → CreateLobbyScene (fade 300 ms)
  - ENTRAR EM LOBBY → JoinLobbyScene (fade 300 ms)
  - CONTA → AccountScene (fade 300 ms)
  - OPCOES → OptionsScene (fade 300 ms)
  - CREDITOS → CreditsScene (fade 300 ms)
  - SAIR → console.log placeholder (wire auth logout in future)
**Design notes:** Video background configured via `MENU_BG_VIDEO_PATH` constant. `pixelArt:true` global flag would cause nearest-neighbour on downsampled video — cleared to LINEAR on vid `play` event. `FONT_RESOLUTION = 2` applied to all Text objects.

---

### 3. Create Lobby
**Scene key:** `CREATE_LOBBY_SCENE`
**File:** `src/scenes/create-lobby-scene.ts`
**Music:** `menu_music.ogg` (continued)
**Background:** Dark blue accent bar layout (via `buildMenuPlaceholder`)
**Text content:**
  - Title: `"CRIAR LOBBY"` — 16px #ffdd55
  - Hint: `"Configure sua partida e convide jogadores."`
  - Button: `"CONECTAR AO SERVIDOR"`
  - Back: `"← VOLTAR"`
**Animations:** Fade-in on entry 300 ms (Plan 06-02)
**Navigation:**
  - CONECTAR AO SERVIDOR → LobbyScene (startScene fade 300 ms)
  - VOLTAR → Main Menu (fade 300 ms)
**Design notes:** Placeholder. Evolve with server region, game mode picker, real lobby creation form.

---

### 4. Join Lobby
**Scene key:** `JOIN_LOBBY_SCENE`
**File:** `src/scenes/join-lobby-scene.ts`
**Music:** `menu_music.ogg` (continued)
**Background:** buildMenuPlaceholder layout (same as Create Lobby)
**Text content:**
  - Title: `"ENTRAR EM LOBBY"` — 16px #ffdd55
  - Hint: `"Encontre uma partida em andamento."`
  - Button: `"CONECTAR AO SERVIDOR"`
  - Back: `"← VOLTAR"`
**Animations:** Fade-in on entry 300 ms
**Navigation:**
  - CONECTAR AO SERVIDOR → LobbyScene (fade)
  - VOLTAR → Main Menu (fade)
**Design notes:** Placeholder. Evolve with lobby browser / invite-code input field.

---

### 5. Account
**Scene key:** `ACCOUNT_SCENE`
**File:** `src/scenes/account-scene.ts`
**Music:** `menu_music.ogg` (continued)
**Background:** buildMenuPlaceholder layout
**Text content:**
  - Title: `"CONTA"` — 16px #ffdd55
  - Hint: `"Login, perfil e conquistas. (Em breve)"`
  - Back: `"← VOLTAR"`
**Animations:** Fade-in on entry 300 ms
**Navigation:** VOLTAR → Main Menu (fade)
**Design notes:** Placeholder — connect to Google OAuth auth flow in v2.0 Phase 1.

---

### 6. Options
**Scene key:** `OPTIONS_SCENE`
**File:** `src/scenes/options-scene.ts`
**Music:** `menu_music.ogg` (continued)
**Background:** buildMenuPlaceholder layout
**Text content:**
  - Title: `"OPCOES"` — 16px #ffdd55
  - Hint: `"Audio, controles e video. (Em breve)"`
  - Back: `"← VOLTAR"`
**Animations:** Fade-in on entry 300 ms
**Navigation:** VOLTAR → Main Menu (fade)
**Design notes:** Placeholder. Planned: master volume slider (MusicManager.setVolume), key remapping, display settings.

---

### 7. Credits
**Scene key:** `CREDITS_SCENE`
**File:** `src/scenes/credits-scene.ts`
**Music:** `menu_music.ogg` (continued)
**Background:** buildMenuPlaceholder layout
**Text content:**
  - Title: `"CREDITOS"` — 16px #ffdd55
  - Hint: `"A equipe por tras do jogo. (Em breve)"`
  - Back: `"← VOLTAR"`
**Animations:** Fade-in on entry 300 ms
**Navigation:** VOLTAR → Main Menu (fade)
**Design notes:** Placeholder. Planned: tween-scrolling credits text (team names, asset licenses, tools).

---

### 8. Lobby (Networking)
**Scene key:** `LOBBY_SCENE`
**File:** `src/scenes/lobby-scene.ts`
**Music:** `menu_music.ogg` (continuous — MusicManager no-op if already playing)
**Background:** Solid dark via scene clear color
**Text content (Connect view):**
  - Title: `"MAGES ONLINE"` — 14px #ffdd55
  - Labels: `"SERVER IP:"`, `"NICKNAME:"`
  - DOM inputs: IP text field (default: "localhost"), nickname (max 12 chars)
  - Button: `"CONNECT"`
**Text content (Lobby List view):** Title `"LOBBIES"`, hint `"Click a lobby to join it"`, `"Available lobbies:"`, lobby rows with names and player counts; `"CREATE LOBBY"` button
**Text content (Waiting Room view):** `"WAITING ROOM"`, `Host: <name>`, `"Waiting for host to start..."`, player list with name + role + team badge; `"START GAME"` button (host only)
**Music cues:** None — stays on menu music until GameScene starts
**Navigation:**
  - CONNECT → connects to server → internal view state machine (no scene switch)
  - Lobby start → PreloadScene → GameScene (via `NETWORK_LOBBY_STARTED` event)
**Design notes:** Full networking UI — not a placeholder. Font `setResolution(2)` audit applied in Plan 06-03. Uses DOM elements (`this.add.dom`) for IP/nick inputs — requires `dom.createContainer: true` in Phaser config (already set in main.ts).

---

## Music Cue Map

| Screen | Track | Notes |
|--------|-------|-------|
| Splash | menu_music.ogg | Loaded in preload(), played on first user interaction |
| Main Menu | menu_music.ogg | Continues from Splash; cinematic timed to drop at ≈14 200 ms |
| Create / Join / Options / Credits / Account | menu_music.ogg | Continuous — MusicManager no-ops on repeat calls |
| Lobby | menu_music.ogg | Continuous through lobby wait |
| Game | gameplay_music.ogg | Switches on GameScene.create() |

## Font Consistency

All UI text uses `FONT_PRESS_START_2P` with `.setResolution(2)` applied. Both font-family aliases (`'Press Start 2P'` and `'FONT_PRESS_START_2P'`) are registered in `index.html` via `@font-face` from the same TTF file (`/assets/fonts/Press_Start_2P/PressStart2P-Regular.ttf`).

**Future upgrade:** Export a `.fnt` + `.png` bitmap font from the TTF (e.g., via Littera or Shoebox) and switch all `Text` objects to `BitmapText` for true pixel-perfect rendering without the canvas 2× resolution workaround.

## Transition Specification

All transitions use `startScene(scene, key, 300)` from `src/scenes/scene-transition.ts` (Plan 06-02):
- **Fade-out:** 300 ms to black (400 ms for Splash → Main Menu for dramatic effect)
- **Fade-in:** 300 ms from black via `cameras.main.fadeIn(300, 0, 0, 0)` called at the top of `buildMenuPlaceholder()` and inside `SplashScene.create()`
- **Exception:** Splash → Main Menu uses 400 ms fade-out
