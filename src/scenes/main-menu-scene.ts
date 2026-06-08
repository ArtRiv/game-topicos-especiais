import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { MusicManager } from '../common/music-manager';
import { startScene } from './scene-transition';
import { ASSET_KEYS } from '../common/assets';
import { getMenuVideoSrc } from '../common/menu-video-prefetch';
import { attachRandomHoverEffect } from '../common/text-hover-effect';

// ---------------------------------------------------------------------------
// MainMenuScene — cinematic intro synced to menu music drop (D-05).
//
// All text uses BitmapText (Phase 9.1-04 standard, D-02 CONVERT). Cinematic
// timing constants below match UI-branch's hand-tuned values and MUST NOT be
// "fixed" — they are tuned by ear to the menu_music.ogg drop.
// ---------------------------------------------------------------------------

const BMFONT_KEY = 'press_start_2p';

// MENU_SPACING = 26 is a deliberate NON-multiple-of-4 (UI-SPEC §Spacing
// Exceptions) inherited verbatim from UI branch — do NOT "fix" to 24/32.
const MENU_SPACING = 26;

// Offset (ms) from menu_music.ogg start to the drop. Title slam fires here.
const MUSIC_DROP_MS = 2_000;

const MENU_BG_VIDEO_KEY = ASSET_KEYS.MENU_BG_VIDEO;

// Tint palette per UI-SPEC §Typography / §Color.
const TINT_DISPLAY = 0xffffff;       // title
const TINT_HEADING = 0xe8d9a8;       // subtitle parchment
const TINT_MENU_IDLE = 0xffffff;
// Hover color is now driven per-character by the lightning effect's layered
// gradient (de9e41 / e8c170 / e7d5b3). See text-lightning-effect.ts TUNING.

// Module-level flag — first-visit cinematic gate (D-05). Persists across
// scene restarts within the same browser session so back-nav from stubs
// doesn't replay the 2s hold.
let cinematicPlayed = false;
// Set by IntroScene right before scene.start(MAIN_MENU). MainMenu honors it
// once: fades in from white (instead of black) AND keeps the intro track
// playing instead of switching to menu_music.ogg. Cleared after first use.
let arrivingFromIntro = false;

// IntroScene calls this on completion so MainMenu skips its own title slam
// when the player arrives from the new beat-synced intro animation.
export function markMainMenuCinematicPlayed(): void {
  cinematicPlayed = true;
}

export function markMainMenuArrivingFromIntro(): void {
  arrivingFromIntro = true;
}

type MenuEntry = { label: string; action: () => void };

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.MAIN_MENU_SCENE });
  }

  public preload(): void {
    // Video is NOT queued here on purpose — we want to feed Phaser the blob URL
    // from the module-load prefetch (main.ts), which may resolve mid-splash.
    // #drawBackground awaits the prefetch promise and runs an out-of-band
    // loader for the video, guaranteeing it's fully cached before display.
    if (!this.cache.bitmapFont.has(BMFONT_KEY)) {
      this.load.bitmapFont(
        BMFONT_KEY,
        'assets/fonts/Press_Start_2P/press_start_white-2.png',
        'assets/fonts/Press_Start_2P/press_start_white-2.xml',
      );
    }
    MusicManager.instance.loadTracks(this);
  }

  public create(): void {
    const { width, height } = this.scale;
    const cx = Math.round(width / 2);
    const cy = Math.round(height / 2);

    // Fade from white when arriving from IntroScene (sells the last-beat
    // flash); otherwise fade from black on regular entries / back-nav.
    const fromIntro = arrivingFromIntro;
    arrivingFromIntro = false;
    if (fromIntro) {
      this.cameras.main.fadeIn(600, 255, 255, 255);
    } else {
      this.cameras.main.fadeIn(400, 0, 0, 0);
    }

    this.#drawBackground(cx, cy, width, height);
    const { title, subtitle } = this.#drawTitle(cx, cy);
    const menuItems = this.#drawMenu(cx, cy);

    // Music handoff:
    //   - Arriving from IntroScene → teste.mp3 is already playing; leave it.
    //   - Any other entry (back-nav, fresh boot) → switch to menu_music.ogg.
    if (MusicManager.instance.currentTrack() !== 'intro') {
      MusicManager.instance.playMenu(this);
    }
    // WARNING 5 / D-13: Restore menu volume to 0.05 on every MainMenu entry so
    // back-nav from Lobby (which ducks to 0.03) returns to the canonical menu
    // profile. Idempotent: no-op if menu music isn't initialised yet.
    MusicManager.instance.setMenuVolume(0.05);

    if (cinematicPlayed) {
      // Second+ visit — show everything immediately, no cinematic replay.
      title.setAlpha(1);
      subtitle.setAlpha(1);
      menuItems.forEach((m) => m.setAlpha(1));
      // Title is already visible — enable hover right away.
      title.setInteractive({ useHandCursor: true });
    } else {
      // First visit — hide everything, then reveal at the song drop.
      title.setAlpha(0);
      subtitle.setAlpha(0);
      menuItems.forEach((m) => m.setAlpha(0));

      this.time.delayedCall(MUSIC_DROP_MS, () => {
        cinematicPlayed = true;

        // Title slam: scale 1.3 -> 1.0 over 250ms Back.Out + α 0 -> 1 over 150ms.
        title.setScale(1.3);
        this.tweens.add({
          targets: title,
          scaleX: 1,
          scaleY: 1,
          duration: 250,
          ease: 'Back.Out',
        });
        this.tweens.add({
          targets: title,
          alpha: 1,
          duration: 150,
          ease: 'Linear',
          // Enable title interactivity only once the reveal completes —
          // hovering an invisible title would be confusing UX.
          onComplete: () => title.setInteractive({ useHandCursor: true }),
        });

        // Subtitle: α 0 -> 1 + y offset +8 -> 0, 200ms Quad.Out, delay 150ms.
        subtitle.y += 8;
        this.tweens.add({
          targets: subtitle,
          alpha: 1,
          y: subtitle.y - 8,
          duration: 200,
          ease: 'Quad.Out',
          delay: 150,
        });

        // Menu items: per-item α 0 -> 1 + x offset -8 -> 0, 200ms Quad.Out,
        // stagger 60ms starting at 200ms.
        menuItems.forEach((m, i) => {
          m.x -= 8;
          this.tweens.add({
            targets: m,
            alpha: 1,
            x: m.x + 8,
            duration: 200,
            ease: 'Quad.Out',
            delay: 200 + i * 60,
          });
        });
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Background — landscape.mp4 cover-fit + vignette overlay (D-06).
  //
  // Layering:
  //   1. Black rectangle  — full-canvas fill, prevents flash-of-nothing.
  //   2. landscape.mp4    — added once the prefetched blob URL resolves and
  //                         Phaser's video cache has the asset. Faded in
  //                         300ms once `play` fires.
  //   3. Vignette         — 0x000000 α 0.4 (D-06 / UI-SPEC §Color).
  //
  // The video is loaded out-of-band (NOT in this scene's preload()) because
  // we want to feed Phaser the blob URL produced by main.ts's module-load
  // fetch — that prefetch starts before Phaser exists, so by the time the
  // user clicks through Splash → Intro → Menu the bytes are in memory.
  //
  // pixelArt:true makes NEAREST the global filter, causing artefacts when
  // downsampling 1920×1080 video to 480×320, so we force LINEAR on the video
  // texture once it's available.
  // ---------------------------------------------------------------------------
  #drawBackground(cx: number, cy: number, w: number, h: number): void {
    // 1. Black fill so the canvas isn't transparent while the video loads.
    this.add.rectangle(0, 0, w, h, 0x000000, 1).setOrigin(0).setDepth(-3);

    // 3. Vignette overlay between video (-2) and text/menu (depth 0).
    this.add.graphics().fillStyle(0x000000, 0.4).fillRect(0, 0, w, h).setDepth(-1);

    // 2. Video — kick off the actual load using the (likely already-resolved)
    //    blob URL from the prefetch. If the cache already has the asset from
    //    a previous visit, skip the load step and go straight to attach.
    //    Negative depth keeps the video AND vignette below the text/menu
    //    items (which default to depth 0).
    const attach = (): void => {
      const vid = this.add.video(cx, cy, MENU_BG_VIDEO_KEY).setOrigin(0.5).setAlpha(0).setDepth(-2);

      vid.on('play', () => {
        const vEl = vid.video as HTMLVideoElement | null;
        const vw = (vEl && vEl.videoWidth) || vid.width || 1920;
        const vh = (vEl && vEl.videoHeight) || vid.height || 1080;
        const cover = Math.max(w / vw, h / vh);
        vid.setDisplaySize(Math.round(vw * cover), Math.round(vh * cover));
        if (vid.texture) {
          // Phaser.Textures.FilterMode.LINEAR === 0
          vid.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
        }
        this.tweens.add({ targets: vid, alpha: 1, duration: 300, ease: 'Quad.Out' });
      });

      vid.play(true);
    };

    if (this.cache.video.has(MENU_BG_VIDEO_KEY)) {
      attach();
      return;
    }

    void getMenuVideoSrc().then((src) => {
      // Scene may have been shut down between the await and now; bail if so.
      if (!this.scene.isActive(SCENE_KEYS.MAIN_MENU_SCENE)) return;
      if (this.cache.video.has(MENU_BG_VIDEO_KEY)) {
        attach();
        return;
      }
      this.load.video(MENU_BG_VIDEO_KEY, src, true);
      this.load.once('complete', attach);
      this.load.start();
    });
  }

  #drawTitle(
    cx: number,
    cy: number,
  ): { title: Phaser.GameObjects.BitmapText; subtitle: Phaser.GameObjects.BitmapText } {
    const titleY = Math.round(cy - 110);
    // Display: 32px (UI-SPEC §Typography).
    const title = this.add
      .bitmapText(cx, titleY, BMFONT_KEY, 'HIGH FANTASY', 32)
      .setOrigin(0.5)
      .setTint(TINT_DISPLAY);
    // Heading: 16px parchment.
    const subtitle = this.add
      .bitmapText(cx, titleY + 48, BMFONT_KEY, '- ONLINE EDITION -', 16)
      .setOrigin(0.5)
      .setTint(TINT_HEADING);

    // Elemental hover effect on the title. We don't call setInteractive
    // here — interactivity is enabled by the caller (create()) only AFTER
    // the title is fully revealed, so the title isn't clickable while it's
    // invisible during the cinematic hold. No scale tween on hover: at
    // 32px a 5% bump is large enough to read as jitter on this pixel-art
    // font, so the elemental effect carries the whole hover feel.
    const hoverFx = attachRandomHoverEffect(this, title);
    title.on('pointerover', () => hoverFx.reroll().start());
    title.on('pointerout', () => {
      title.setTint(TINT_DISPLAY);
      hoverFx.stop();
    });
    title.once(Phaser.GameObjects.Events.DESTROY, () => hoverFx.destroy());

    return { title, subtitle };
  }

  #drawMenu(cx: number, cy: number): Phaser.GameObjects.BitmapText[] {
    // Both CRIAR LOBBY and ENTRAR EM LOBBY route to LOBBY_SCENE per D-03 —
    // multiplayer's LobbyScene supports both flows via Connect+Browser.
    const entries: MenuEntry[] = [
      { label: 'CRIAR LOBBY',     action: () => startScene(this, SCENE_KEYS.LOBBY_SCENE, 300) },
      { label: 'ENTRAR EM LOBBY', action: () => startScene(this, SCENE_KEYS.LOBBY_SCENE, 300) },
      { label: 'CONTA',           action: () => startScene(this, SCENE_KEYS.ACCOUNT_SCENE, 300) },
      { label: 'OPCOES',          action: () => startScene(this, SCENE_KEYS.OPTIONS_SCENE, 300) },
      { label: 'CREDITOS',        action: () => startScene(this, SCENE_KEYS.CREDITS_SCENE, 300) },
    ];

    const menuStartY = Math.round(cy - 30);
    const items: Phaser.GameObjects.BitmapText[] = [];

    entries.forEach((entry, i) => {
      const y = Math.round(menuStartY + i * MENU_SPACING);
      // Body: 16px menu items.
      const item = this.add
        .bitmapText(cx, y, BMFONT_KEY, entry.label, 16)
        .setOrigin(0.5)
        .setTint(TINT_MENU_IDLE)
        .setInteractive({ useHandCursor: true });
      items.push(item);

      // Random elemental hover effect (currently only lightning is wired in).
      // Re-rolled on every pointerover so re-hovering the same item picks a
      // new element once fire/water/earth come online.
      const hoverFx = attachRandomHoverEffect(this, item);
      item.on('pointerover', () => {
        this.tweens.add({ targets: item, scaleX: 1.05, scaleY: 1.05, duration: 100, ease: 'Quad.Out' });
        hoverFx.reroll().start();
      });
      item.on('pointerout', () => {
        item.setTint(TINT_MENU_IDLE);
        this.tweens.add({ targets: item, scaleX: 1, scaleY: 1, duration: 100, ease: 'Quad.Out' });
        hoverFx.stop();
      });
      item.on('pointerup', entry.action);
      item.once(Phaser.GameObjects.Events.DESTROY, () => hoverFx.destroy());
    });

    return items;
  }
}
