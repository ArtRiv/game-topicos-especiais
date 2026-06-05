import { CharacterAnimation, GameObject } from '../../common/types';
import { BaseGameObjectComponent } from './base-game-object-component';

export type AnimationConfig = {
  [key in CharacterAnimation]?: { key: string; repeat: number; ignoreIfPlaying: boolean };
};

export class AnimationComponent extends BaseGameObjectComponent {
  declare protected gameObject: Phaser.GameObjects.Sprite;

  #config: AnimationConfig;

  constructor(gameObject: GameObject, config: AnimationConfig) {
    super(gameObject);
    this.#config = config;
  }

  public getAnimationKey(characterAnimationKey: CharacterAnimation): string | undefined {
    if (this.#config[characterAnimationKey] === undefined) {
      return undefined;
    }
    return this.#config[characterAnimationKey].key;
  }

  /**
   * Play a configured animation. Pass `force: true` to override the per-anim `ignoreIfPlaying` flag —
   * needed for the death animation: its config is `ignoreIfPlaying: true`, and after an `anims.stop()`
   * coming off a looping IDLE/MOVE animation Phaser doesn't atomically clear `isPlaying`, so a normal
   * `play(config, true)` can silently no-op and the corpse freezes on its last frame (the intermittent
   * "death animation doesn't play" bug). `force: true` passes `ignoreIfPlaying: false` so it always restarts.
   */
  public playAnimation(
    characterAnimationKey: CharacterAnimation,
    callbackOrOptions?: (() => void) | { force?: boolean; callback?: () => void },
  ): void {
    if (this.#config[characterAnimationKey] === undefined) {
      const cb = typeof callbackOrOptions === 'function' ? callbackOrOptions : callbackOrOptions?.callback;
      if (cb) cb();
      return;
    }
    const force = typeof callbackOrOptions === 'object' ? callbackOrOptions.force === true : false;
    const callback = typeof callbackOrOptions === 'function' ? callbackOrOptions : callbackOrOptions?.callback;
    const animationConfig: Phaser.Types.Animations.PlayAnimationConfig = {
      key: this.#config[characterAnimationKey].key,
      repeat: this.#config[characterAnimationKey].repeat,
      timeScale: 1,
    };
    if (callback) {
      const animationKey = Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + this.#config[characterAnimationKey].key;
      this.gameObject.once(animationKey, () => {
        callback();
      });
    }
    // force ? always restart : honor the per-anim ignoreIfPlaying.
    this.gameObject.play(animationConfig, force ? false : this.#config[characterAnimationKey].ignoreIfPlaying);
  }

  public playAnimationInReverse(characterAnimationKey: CharacterAnimation, callback?: () => void): void {
    if (this.#config[characterAnimationKey] === undefined) {
      if (callback) {
        callback();
      }
      return;
    }
    const animationConfig: Phaser.Types.Animations.PlayAnimationConfig = {
      key: this.#config[characterAnimationKey].key,
      repeat: this.#config[characterAnimationKey].repeat,
      timeScale: 1.75,
    };
    if (callback) {
      const animationKey = Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + this.#config[characterAnimationKey].key;
      this.gameObject.once(animationKey, () => {
        callback();
      });
    }
    this.gameObject.playReverse(animationConfig, this.#config[characterAnimationKey].ignoreIfPlaying);
  }

  public isAnimationPlaying(): boolean {
    return this.gameObject.anims.isPlaying;
  }
}
