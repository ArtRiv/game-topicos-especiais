import * as Phaser from 'phaser';
import { startScene } from './scene-transition';

// ---------------------------------------------------------------------------
// buildMenuPlaceholder
// ---------------------------------------------------------------------------
// Utility that builds a consistent "EM BREVE" layout for menu stub scenes.
// This is NOT a base class — it's a plain function called inside each scene's
// create() method so the scene hierarchy stays flat and Phaser-idiomatic.
//
// All text uses BitmapText (Phase 9.1-04 standard, D-02 CONVERT). The atlas
// is loaded by SplashScene/MainMenuScene/PreloadScene before any stub scene
// can be reached, so no self-load is needed here.
//
// UI-SPEC §Stub Scenes locks the visual contract:
//   • Heading: 16px (BitmapText size), tint 0xFFFFFF, copy = opts.title.
//   • Body:    8px,                    tint 0xB8B8B8 (muted grey), copy = "EM BREVE".
//   • Back hint: 8px,                  tint 0x8888BB, copy = "PRESS ESC TO RETURN".
//   • Esc key + back hint both call startScene(scene, opts.backScene).
// ---------------------------------------------------------------------------

const BMFONT_KEY = 'press_start_2p';

const TINT_HEADING = 0xffffff;
const TINT_BODY = 0xb8b8b8;
const TINT_BACK_HINT = 0x8888bb;

const BODY_COPY = 'EM BREVE';
const BACK_HINT_COPY = 'PRESS ESC TO RETURN';

export type MenuPlaceholderOptions = {
  /** Big heading shown at the top of the scene (rendered UPPERCASE by caller). */
  title: string;
  /** Scene key to transition to when ESC or the back hint is interacted with. */
  backScene: string;
};

export function buildMenuPlaceholder(scene: Phaser.Scene, opts: MenuPlaceholderOptions): void {
  const { width, height } = scene.scale;
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);

  // Smooth fade-in on every entry.
  scene.cameras.main.fadeIn(300, 0, 0, 0);

  // Pure black background (UI-SPEC §Color dominant).
  scene.add.rectangle(0, 0, width, height, 0x000000, 1).setOrigin(0);

  // Heading: 16px white. setCenterAlign keeps multi-line strings centred
  // (single-line here, but safe to enable).
  scene.add
    .bitmapText(cx, Math.round(cy - 40), BMFONT_KEY, opts.title, 16)
    .setOrigin(0.5)
    .setTint(TINT_HEADING)
    .setCenterAlign();

  // Body: 8px muted grey.
  scene.add
    .bitmapText(cx, Math.round(cy), BMFONT_KEY, BODY_COPY, 8)
    .setOrigin(0.5)
    .setTint(TINT_BODY)
    .setCenterAlign();

  // Back hint: 8px, near the bottom edge.
  scene.add
    .bitmapText(cx, Math.round(height - 32), BMFONT_KEY, BACK_HINT_COPY, 8)
    .setOrigin(0.5)
    .setTint(TINT_BACK_HINT)
    .setCenterAlign();

  // Esc key dismisses back to opts.backScene via the standard fade-transition.
  // .once() ensures we don't accumulate listeners on re-entry (the scene is
  // restarted, not slept, so each create() registers a fresh listener).
  scene.input.keyboard!.once('keydown-ESC', () => startScene(scene, opts.backScene));
}
