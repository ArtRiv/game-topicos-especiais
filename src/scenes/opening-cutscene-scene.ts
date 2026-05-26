import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';

// ---------------------------------------------------------------------------
// OpeningCutsceneScene — calm, Undertale-style narrative intro played BEFORE
// IntroScene. Five panels: each shows a static illustration on top with a
// typewriter narration below. SPACE / click advances; ESC skips the whole
// cutscene. After the final panel a fade-out hands off to IntroScene where
// the title-reveal animation + music begin.
//
// Audio is intentionally silent here — the audio context unlock from the
// splash keypress carries over, and IntroScene starts teste.mp3 immediately
// after the cutscene ends, so the music kicks in with the title slam.
// ---------------------------------------------------------------------------

const BMFONT_KEY = 'press_start_2p';

// Image keys — local to this scene; preloaded from public/assets/opening_cutscene/.
const IMG_PEDRA = 'CUTSCENE_PEDRA_MAGICA';
const IMG_CLAS = 'CUTSCENE_CLAS';
const IMG_CLAS_BATTLE = 'CUTSCENE_CLAS_BATTLE';
const IMG_ARENA = 'CUTSCENE_ARENA';
const IMG_MAGE = 'CUTSCENE_POWERFUL_MAGE';

type Panel = { imageKey: string; text: string };

const PANELS: Panel[] = [
  {
    imageKey: IMG_PEDRA,
    text: 'Desde os primórdios do tempo, uma pedra de poder imensurável dorme oculta no coração do mundo. Aquele que a possuir dominará a magia em sua forma mais pura.',
  },
  {
    imageKey: IMG_CLAS_BATTLE,
    text: 'Todos os clãs de magos, separados por séculos de rivalidade, recebem o mesmo presságio: a Pedra foi encontrada. E apenas um clã poderá reivindicá-la.',
  },
  {
    imageKey: IMG_CLAS,
    text: 'Cada clã convoca seus maiores magos. Apenas o clã mais poderoso irá prevalecer.',
  },
  {
    imageKey: IMG_ARENA,
    text: 'Em uma arena esquecida pelos deuses, os exércitos de feiticeiros se enfrentam. A batalha que determinará o destino da magia começa.',
  },
  {
    imageKey: IMG_MAGE,
    text: 'O clã vencedor ganhará a Pedra Mística e, com ela, poder além da compreensão mortal.',
  },
];

// Layout (canvas is 480x320).
const IMAGE_AREA_TOP = 12;
const IMAGE_AREA_HEIGHT = 188;
const TEXT_AREA_TOP = 212;
// Narrow column so lines break sooner — keeps the cutscene from feeling like
// a wall of text and matches Undertale's compact narration column.
const TEXT_COLUMN_WIDTH = 320;
// Left edge of the column: keeps the 320-wide column visually centered on the
// 480 canvas, while the text itself is left-anchored so the typewriter grows
// L→R like typing into a search bar (instead of re-centering each frame).
const TEXT_COLUMN_LEFT = Math.round((480 - TEXT_COLUMN_WIDTH) / 2);
const TEXT_FONT_PX = 8;
const TEXT_LINE_HEIGHT_PX = 12;
// Phaser canvas-Text gets blurry under pixelArt FIT scaling; doubling the
// internal resolution keeps glyphs crisp without affecting layout.
const TEXT_RESOLUTION = 2;

// Typewriter SFX — synthesized WebAudio blip, kept very quiet so it sits
// under the cutscene music. Square waveform + ~700Hz reads as the classic
// 8-bit dialogue chirp (Earthbound / Zelda text-box style). Pattern borrowed
// from IntroScene's #playClick — no audio asset to load.
const TYPE_BLIP_FREQ_HZ = 720;
const TYPE_BLIP_VOLUME = 0.03;
const TYPE_BLIP_DURATION_MS = 18;
const TYPE_BLIP_WAVEFORM: OscillatorType = 'square';
// Play the blip every Nth non-whitespace character. 2 = once per pair of
// letters, which feels less "machine-gun" than every char.
const TYPE_BLIP_EVERY_N_CHARS = 2;

// Cutscene background music — public/assets/audio/op.mp3. Loaded only by
// this scene, kept off the MusicManager because it's a one-off cinematic
// track and must NOT bleed into IntroScene (which starts teste.mp3).
const OP_MUSIC_KEY = 'OPENING_CUTSCENE_MUSIC';
const OP_MUSIC_VOLUME = 0.22;
const OP_MUSIC_FADE_IN_MS = 1500;
const OP_MUSIC_FADE_OUT_MS = 700;

// Timing.
const SCENE_FADE_IN_MS = 800;
const IMAGE_FADE_MS = 900;
const TYPE_MS_PER_CHAR = 28;
const KEN_BURNS_MS = 11000; // total slow-zoom over a panel
const KEN_BURNS_SCALE = 1.06;
const POST_TEXT_HOLD_MS = 1900;
const PANEL_FADE_OUT_MS = 550;
const FINAL_FADE_OUT_MS = 1600;
const SKIP_FADE_OUT_MS = 400;
// Ignore key/click for this many ms after scene start so the keypress that
// triggered the splash→cutscene transition can't accidentally skip panel 1.
const SKIP_LOCKOUT_MS = 350;

export class OpeningCutsceneScene extends Phaser.Scene {
  #panelIndex = 0;
  #image: Phaser.GameObjects.Image | null = null;
  // Narration uses canvas-rendered Text (not BitmapText) because the
  // Press_Start_2P bitmap atlas does not include Portuguese accented glyphs
  // (ã, á, ç, é, …). The TTF web font, preloaded in main.ts, covers them.
  #text: Phaser.GameObjects.Text | null = null;
  #prompt: Phaser.GameObjects.BitmapText | null = null;
  #skipHint: Phaser.GameObjects.BitmapText | null = null;
  #typeTimer: Phaser.Time.TimerEvent | null = null;
  #holdTimer: Phaser.Time.TimerEvent | null = null;
  #typeProgress = 0;
  #typeComplete = false;
  // Counts non-whitespace chars typed; the blip fires only on every Nth one
  // (see TYPE_BLIP_EVERY_N_CHARS) to halve the tap cadence.
  #blipCounter = 0;
  #music: Phaser.Sound.BaseSound | null = null;
  #transitioning = false;
  #finished = false;
  #sceneStartTime = 0;

  constructor() {
    super({ key: SCENE_KEYS.OPENING_CUTSCENE_SCENE });
  }

  public preload(): void {
    // BitmapText atlas — already loaded by SplashScene in the canonical flow.
    if (!this.cache.bitmapFont.has(BMFONT_KEY)) {
      this.load.bitmapFont(
        BMFONT_KEY,
        'assets/fonts/Press_Start_2P/press_start_white-2.png',
        'assets/fonts/Press_Start_2P/press_start_white-2.xml',
      );
    }
    // Filenames carry non-ASCII characters and a space — encodeURI keeps the
    // dev-server happy across OSes.
    this.load.image(IMG_PEDRA, 'assets/opening_cutscene/Pedra_magica.png');
    this.load.image(IMG_CLAS, encodeURI('assets/opening_cutscene/Clãs.png'));
    this.load.image(IMG_CLAS_BATTLE, encodeURI('assets/opening_cutscene/clãsro.png'));
    this.load.image(IMG_ARENA, 'assets/opening_cutscene/arena.png');
    this.load.image(IMG_MAGE, encodeURI('assets/opening_cutscene/powerfull mage.png'));
    // Cinematic cutscene music — not managed by MusicManager so it doesn't
    // interfere with menu/gameplay tracks. Faded in on create, hard-stopped
    // before transitioning to IntroScene.
    if (!this.cache.audio.has(OP_MUSIC_KEY)) {
      this.load.audio(OP_MUSIC_KEY, 'assets/audio/op.mp3');
    }
  }

  public create(): void {
    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, 0x000000, 1).setOrigin(0);

    this.#skipHint = this.add
      .bitmapText(width - 4, 4, BMFONT_KEY, 'ESC SKIP', 8)
      .setOrigin(1, 0)
      .setTint(0x666666)
      .setAlpha(0)
      .setDepth(50);
    this.tweens.add({
      targets: this.#skipHint,
      alpha: 0.55,
      duration: 1400,
      delay: 600,
      ease: 'Sine.Out',
    });

    this.#sceneStartTime = this.time.now;
    this.cameras.main.fadeIn(SCENE_FADE_IN_MS, 0, 0, 0);

    this.input.keyboard!.on('keydown', this.#onKey, this);
    this.input.on('pointerdown', this.#onPointer, this);

    // Start cutscene music at volume 0, fade in gently so it doesn't startle.
    // loop: false ensures the music plays exactly once and doesn't repeat.
    if (this.cache.audio.has(OP_MUSIC_KEY)) {
      this.#music = this.sound.add(OP_MUSIC_KEY, { loop: false, volume: 0 });
      this.#music.play();
      if (!this.#music.isPlaying) {
        this.sound.once('unlocked', () => {
          if (this.#music && !this.#music.isPlaying) this.#music.play();
        });
      }
      this.tweens.add({
        targets: this.#music as unknown as { volume: number },
        volume: OP_MUSIC_VOLUME,
        duration: OP_MUSIC_FADE_IN_MS,
        ease: 'Sine.Out',
      });
    }

    this.#showPanel(0);
  }

  #showPanel(index: number): void {
    this.#panelIndex = index;
    const panel = PANELS[index];
    const { width } = this.scale;
    const cx = Math.round(width / 2);

    const img = this.add
      .image(cx, IMAGE_AREA_TOP + IMAGE_AREA_HEIGHT / 2, panel.imageKey)
      .setOrigin(0.5)
      .setAlpha(0);
    // Aspect-preserving fit into the image area, leaving a small margin.
    const targetW = width - 32;
    const baseScale = Math.min(targetW / img.width, IMAGE_AREA_HEIGHT / img.height);
    img.setScale(baseScale);
    this.#image = img;

    this.tweens.add({
      targets: img,
      alpha: 1,
      duration: IMAGE_FADE_MS,
      ease: 'Sine.InOut',
    });
    // Slow Ken-Burns zoom for cinematic feel.
    this.tweens.add({
      targets: img,
      scale: baseScale * KEN_BURNS_SCALE,
      duration: KEN_BURNS_MS,
      ease: 'Linear',
    });

    // Narration: left-anchored at the column's left edge so the typewriter
    // grows L→R (like typing into a search bar) instead of recentering each
    // frame, which made reading-as-it-types hard. Column width is unchanged
    // — only the anchor moved from center to left.
    this.#text = this.add
      .text(TEXT_COLUMN_LEFT, TEXT_AREA_TOP, '', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: `${TEXT_FONT_PX}px`,
        color: '#ffffff',
        align: 'left',
        wordWrap: { width: TEXT_COLUMN_WIDTH, useAdvancedWrap: true },
      })
      .setOrigin(0, 0)
      .setLineSpacing(TEXT_LINE_HEIGHT_PX - TEXT_FONT_PX)
      .setResolution(TEXT_RESOLUTION);

    this.#typeProgress = 0;
    this.#typeComplete = false;

    // Start typing slightly after the image starts fading so the eye lands on
    // the image first, then on the words appearing.
    this.time.delayedCall(Math.floor(IMAGE_FADE_MS * 0.45), () => {
      if (this.#finished || this.#transitioning) return;
      this.#startTyping(panel.text);
    });
  }

  #startTyping(fullText: string): void {
    if (!this.#text) return;
    this.#typeTimer = this.time.addEvent({
      delay: TYPE_MS_PER_CHAR,
      repeat: fullText.length - 1,
      callback: () => {
        this.#typeProgress++;
        const justTyped = fullText[this.#typeProgress - 1];
        if (this.#text) this.#text.setText(fullText.slice(0, this.#typeProgress));
        // Classic 8-bit dialogue blip — skip whitespace so the rhythm reads as
        // "letters tapping" instead of a continuous beep, then play only on
        // every Nth non-whitespace char to halve the cadence.
        if (justTyped && /\S/.test(justTyped)) {
          this.#blipCounter++;
          if (this.#blipCounter % TYPE_BLIP_EVERY_N_CHARS === 0) this.#playTypeBlip();
        }
        if (this.#typeProgress >= fullText.length) {
          this.#typeComplete = true;
          this.#scheduleAdvance();
        }
      },
    });
  }

  #scheduleAdvance(): void {
    if (this.#prompt) this.#prompt.destroy();
    const { width, height } = this.scale;
    this.#prompt = this.add
      .bitmapText(width - 8, height - 8, BMFONT_KEY, '>>', 8)
      .setOrigin(1, 1)
      .setTint(0xcccccc)
      .setDepth(50);
    this.tweens.add({
      targets: this.#prompt,
      alpha: { from: 0.3, to: 1.0 },
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    this.#holdTimer = this.time.delayedCall(POST_TEXT_HOLD_MS, () => this.#nextPanel());
  }

  #onKey = (event: KeyboardEvent): void => {
    if (this.#finished) return;
    if (this.time.now - this.#sceneStartTime < SKIP_LOCKOUT_MS) return;
    if (event.key === 'Escape') {
      this.#skipCutscene();
      return;
    }
    this.#handleAdvance();
  };

  #onPointer = (): void => {
    if (this.#finished) return;
    if (this.time.now - this.#sceneStartTime < SKIP_LOCKOUT_MS) return;
    this.#handleAdvance();
  };

  #handleAdvance(): void {
    if (this.#transitioning) return;
    if (!this.#typeComplete) {
      // First press fast-completes the typewriter for the current panel.
      if (this.#typeTimer) {
        this.#typeTimer.remove();
        this.#typeTimer = null;
      }
      if (this.#text) this.#text.setText(PANELS[this.#panelIndex].text);
      this.#typeComplete = true;
      this.#scheduleAdvance();
      return;
    }
    // Already showing full text — second press advances to next panel.
    if (this.#holdTimer) {
      this.#holdTimer.remove();
      this.#holdTimer = null;
    }
    this.#nextPanel();
  }

  #nextPanel(): void {
    if (this.#transitioning) return;
    this.#transitioning = true;

    const fading: (Phaser.GameObjects.Image | Phaser.GameObjects.BitmapText | Phaser.GameObjects.Text)[] = [];
    if (this.#image) fading.push(this.#image);
    if (this.#text) fading.push(this.#text);
    if (this.#prompt) fading.push(this.#prompt);

    if (this.#typeTimer) {
      this.#typeTimer.remove();
      this.#typeTimer = null;
    }
    if (this.#holdTimer) {
      this.#holdTimer.remove();
      this.#holdTimer = null;
    }

    this.tweens.add({
      targets: fading,
      alpha: 0,
      duration: PANEL_FADE_OUT_MS,
      ease: 'Sine.In',
      onComplete: () => {
        this.#image?.destroy();
        this.#text?.destroy();
        this.#prompt?.destroy();
        this.#image = null;
        this.#text = null;
        this.#prompt = null;
        this.#transitioning = false;

        if (this.#panelIndex + 1 >= PANELS.length) {
          this.#finishCutscene();
        } else {
          this.#showPanel(this.#panelIndex + 1);
        }
      },
    });
  }

  #skipCutscene(): void {
    if (this.#finished) return;
    this.#finished = true;
    this.input.keyboard!.off('keydown', this.#onKey, this);
    this.input.off('pointerdown', this.#onPointer, this);
    this.#fadeOutMusic(SKIP_FADE_OUT_MS);
    this.cameras.main.fadeOut(SKIP_FADE_OUT_MS, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (this.#music?.isPlaying) this.#music.stop();
      this.scene.start(SCENE_KEYS.INTRO_SCENE);
    });
  }

  #finishCutscene(): void {
    if (this.#finished) return;
    this.#finished = true;
    this.input.keyboard!.off('keydown', this.#onKey, this);
    this.input.off('pointerdown', this.#onPointer, this);
    this.#fadeOutMusic(FINAL_FADE_OUT_MS);
    this.cameras.main.fadeOut(FINAL_FADE_OUT_MS, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (this.#music?.isPlaying) this.#music.stop();
      this.scene.start(SCENE_KEYS.INTRO_SCENE);
    });
  }

  // Fade out the cutscene music over durationMs and stop it. Called by skip and
  // finish handlers in parallel with camera fade-out; both complete at the
  // same time and trigger the scene transition.
  #fadeOutMusic(durationMs: number): void {
    if (!this.#music) return;
    this.tweens.killTweensOf(this.#music);
    this.tweens.add({
      targets: this.#music as unknown as { volume: number },
      volume: 0,
      duration: durationMs,
      ease: 'Linear',
    });
  }

  // 8-bit-style typewriter blip — synthesized on Phaser's shared WebAudio
  // context so no asset has to be loaded. Pattern mirrors IntroScene's
  // #playClick: schedule on currentTime + 5ms so back-to-back triggers don't
  // collide in the same 128-sample quantum and drop notes.
  #playTypeBlip(): void {
    const sm = this.sound as unknown as { context?: AudioContext };
    const ctx = sm.context;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = TYPE_BLIP_WAVEFORM;
    osc.frequency.value = TYPE_BLIP_FREQ_HZ;
    const t = ctx.currentTime + 0.005;
    const durSec = TYPE_BLIP_DURATION_MS / 1000;
    gain.gain.setValueAtTime(TYPE_BLIP_VOLUME, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + durSec);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + durSec + 0.01);
  }
}
