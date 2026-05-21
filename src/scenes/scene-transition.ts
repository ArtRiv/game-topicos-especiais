import * as Phaser from 'phaser';

/**
 * startScene — fade out the current scene's camera then switch to targetKey.
 * Use this everywhere instead of scene.scene.start() to get smooth transitions.
 *
 * @param scene     The currently running Phaser.Scene
 * @param targetKey SCENE_KEYS constant for the destination scene
 * @param duration  Fade-out duration in ms (default 300)
 */
export function startScene(scene: Phaser.Scene, targetKey: string, duration = 300): void {
  scene.cameras.main.fadeOut(duration, 0, 0, 0);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    scene.scene.start(targetKey);
  });
}
