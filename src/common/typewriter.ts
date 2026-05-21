import * as Phaser from 'phaser';

/**
 * typewrite — reveal `fullText` one character at a time into `target`.
 *
 * - Uses scene.time.addEvent (paused with the scene, scaled by timeScale).
 * - Linear cadence: delay = durationMs / fullText.length (CONTEXT.md D-11).
 * - BitmapText-compatible (target.setText works the same as Text).
 * - No cursor glyph in v1 (UI-SPEC §Typewriter Helper Contract).
 * - Calls onComplete after the final character is revealed.
 *
 * Returns the TimerEvent so the caller can cancel via .remove() on scene shutdown.
 */
export function typewrite(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.BitmapText,
  fullText: string,
  durationMs: number,
  onComplete?: () => void,
): Phaser.Time.TimerEvent {
  target.setText('');
  const total = fullText.length;
  if (total === 0) {
    onComplete?.();
    // Return a no-op event for type stability.
    return scene.time.addEvent({ delay: 1, callback: () => {} });
  }
  const delay = Math.max(1, Math.floor(durationMs / total));
  let i = 0;
  return scene.time.addEvent({
    delay,
    repeat: total - 1,
    callback: () => {
      i += 1;
      target.setText(fullText.substring(0, i));
      if (i >= total) onComplete?.();
    },
  });
}
