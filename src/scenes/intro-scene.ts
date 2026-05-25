import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { ASSET_KEYS } from '../common/assets';
import { markMainMenuArrivingFromIntro, markMainMenuCinematicPlayed } from './main-menu-scene';
import { MusicManager } from '../common/music-manager';

// ---------------------------------------------------------------------------
// IntroScene — beat-synced "HIGH FANTASY" reveal animation.
//
// Plays teste.mp3 over a black background. At hand-timed song offsets:
//   - WORD_HIGH_AT     → outline-only "HIGH" appears (top line)
//   - WORD_FANTASY_AT  → outline-only "FANTASY" appears (bottom line)
//   - BEATS[0..11]     → fill one random remaining letter with a random
//                        element color (the "buggy" stutter section)
//   - BEATS[12..21]    → camera shake + full-screen color flash chain
//
// Beat offsets were captured by ear in an audio editor at reduced playback
// rate (0.5x / 0.25x / 0.10x) and converted back to real-song time. The raw
// markers live in timing.txt at repo root. Tweak BEATS / WORD_*_AT here when
// re-syncing — do NOT "round" the millisecond values.
// ---------------------------------------------------------------------------

const BMFONT_KEY = 'press_start_2p';

const SONG_START_OFFSET_S = 11.0;

const WORD_HIGH_AT = 12.55;
const WORD_FANTASY_AT = 13.35;

const POST_LAST_PUNCH_HOLD_MS = 0;

const PUNCH_BEATS: {
  time: number;
  scale: number;
  angle: number;
  glowFactor: number;
  lineGap: number;
  flashAlpha: number;
}[] = [
  { time: 16.341, scale: 1.15, angle: -15, glowFactor: 0.7, lineGap: 4, flashAlpha: 0.15 },
  { time: 16.463, scale: 1.3, angle: 20, glowFactor: 0.4, lineGap: 10, flashAlpha: 0.25 },
  { time: 16.597, scale: 1.8, angle: -30, glowFactor: 0.1, lineGap: 22, flashAlpha: 0.4 },
];

const PUNCH_DURATION_MS = 80;

// scaleBump and angleBump are ADDED to the last punch's resting pose (currently
// scale 1.8, angle -30) at the pulse peak, then yoyo back. angleBump is signed —
// positive rotates one way, negative the other. Set angleBump 0 to keep angle
// locked while only the scale pulses.
const PULSE_BEATS: { time: number; scaleBump: number; angleBump: number }[] = [
  { time: 16.735, scaleBump: 0.15, angleBump: 40 },
  { time: 16.79, scaleBump: 0.2, angleBump: 20 },
];
const PULSE_DURATION_MS = 15;
// Angle one-way duration. Angle does NOT yoyo (matches punch behavior — each
// pulse leaves the title at its new tilt until the next pulse/punch/flash
// overrides). Make consecutive pulses with different angleBump signs if you
// want a side-to-side wobble.
const PULSE_ANGLE_DURATION_MS = 8;

// Times (song-time s) that should fire an extra quick white flash on top of
// whatever fill/flash logic those beats already run. Used to make the rapid
// 4-beat stutter section read as a single bright "stab" rather than the
// default fill-then-colored-flash sequence.
const STUTTER_FLASH_BEATS: number[] = [15.923, 15.961, 15.993, 16.027];
const STUTTER_FLASH_ALPHA = 0.45;
const STUTTER_FLASH_FADE_MS = 70;

const MUSIC_FADE_END_AT = 12.3;
const MUSIC_VOLUME = 0.3;

const GLOBAL_BEAT_OFFSET_MS = 0;

const DEBUG_LOG_BEATS = false;

const PLAYBACK_RATE = 1.0;

const BEAT_CLICK = true;
const CLICK_FREQ_HZ = 2400;
const CLICK_VOLUME = 0.2;
const CLICK_WAVEFORM: OscillatorType = 'square';
const CLICK_DURATION_MS = 15;

const SHOW_BEAT_COUNTER = false;

const CAPTURE_MODE = false;
const CAPTURE_STORAGE_KEY = 'intro-beat-capture-runs';

type Beat = { start: number; end: number };

const BEATS: Beat[] = [
  { start: 14.730, end: 14.751 }, // 1
  { start: 14.85, end: 14.87 }, // 2
  { start: 14.976, end: 14.996 }, // 3
  { start: 15.116, end: 15.136 }, // 4
  { start: 15.18, end: 15.2 }, // 5
  { start: 15.248, end: 15.268 }, // 6
  { start: 15.315, end: 15.335 }, // 7
  { start: 15.382, end: 15.402 }, // 8
  { start: 15.515, end: 15.535 }, // 9
  { start: 15.651, end: 15.671 }, // 10
  { start: 15.79, end: 15.81 }, // 11
  { start: 15.923, end: 15.943 }, // 12
  { start: 15.961, end: 15.981 }, // 13
  { start: 15.993, end: 16.013 }, // 14
  { start: 16.027, end: 16.047 }, // 15
  { start: 16.065, end: 16.085 }, // 16  (-9ms from 16.074, retuned via 8-run tap avg)
  { start: 16.205, end: 16.225 }, // 17  (+10ms from 16.195, retuned via 8-run tap avg)
  { start: 16.269, end: 16.289 }, // 18
  { start: 16.331, end: 16.351 }, // 19
  { start: 16.467, end: 16.487 }, // 20
  { start: 16.603, end: 16.623 }, // 21
  // Beat 22 removed — its audio cue coincides with Pulse 1 (16.735), which
  // already triggers a tween + click on that beat. Keeping both would have
  // double-fired ~18ms apart for the same audible hit.
];

const FILL_BEAT_COUNT = 12;

const ELEMENT_COLORS = [
  0xff2a1f, // fire — neon red-orange
  0xffaa00, // earth/lava — vivid amber (brown looked dead)
  0x00b4ff, // water — electric blue
  0x80ffff, // ice — bright cyan
  0x80ff20, // wind — neon green
  0xfff044, // thunder — vivid yellow
  0xff40d0, // darkness — magenta (pure neon purple shifts pink in additive)
];

const FLASH_COLORS = [0xffffff, 0xffd84a, 0xff6b3d, 0x4a90e2, 0xa060d0, 0xc8f0a0, 0xb3e0ff];

const FONT_SIZE = 28;
const LETTER_SPACING = 28; // px between letter origins (~6px visible gap at FONT_SIZE 28)
const LINE_GAP = 40; // px between HIGH baseline and FANTASY baseline

const SUPERSAMPLE = 2;
const LETTER_BASE_SCALE = 1 / SUPERSAMPLE;

const ENABLE_GLOW = false;
const ENABLE_OUTLINE = true;
// --------------------------------------------------------------------------

type Letter = {
  glows: Phaser.GameObjects.BitmapText[];
  outlines: Phaser.GameObjects.BitmapText[]; // 4 copies, offset ±1px (white)
  fill: Phaser.GameObjects.BitmapText; // center, hidden initially
  filled: boolean;
};

const GLOW_OFFSETS: readonly (readonly [number, number, number])[] = [
  [-2, 0, 0],
  [2, 0, 0],
  [0, -2, 0],
  [0, 2, 0],
  [-2, -2, 1],
  [2, -2, 1],
  [-2, 2, 1],
  [2, 2, 1],
  [-3, 0, 2],
  [3, 0, 2],
  [0, -3, 2],
  [0, 3, 2],
];
const GLOW_RING_ALPHA = [0.55, 0.35, 0.22] as const;

export class IntroScene extends Phaser.Scene {
  #music: Phaser.Sound.BaseSound | null = null;
  #letters: Letter[] = [];
  #fillIndex = 0; // walks letters[] in order H-I-G-H-F-A-N-T-A-S-Y
  #high: Phaser.GameObjects.Container | null = null;
  #fantasy: Phaser.GameObjects.Container | null = null;
  #flash: Phaser.GameObjects.Rectangle | null = null;
  #beatCounter: Phaser.GameObjects.BitmapText | null = null;
  #captures: number[] = []; // song-time (s) of each SPACE tap in capture mode
  #captureHud: Phaser.GameObjects.BitmapText | null = null;
  #skipped = false;
  #highBaseY = 0;
  #fantasyBaseY = 0;

  constructor() {
    super({ key: SCENE_KEYS.INTRO_SCENE });
  }

  public preload(): void {
    if (!this.cache.audio.has(ASSET_KEYS.INTRO_MUSIC)) {
      this.load.audio(ASSET_KEYS.INTRO_MUSIC, 'assets/audio/teste.mp3');
    }
    // Font is already loaded by SplashScene but guard for direct boot.
    if (!this.cache.bitmapFont.has(BMFONT_KEY)) {
      this.load.bitmapFont(
        BMFONT_KEY,
        'assets/fonts/Press_Start_2P/press_start_white-2.png',
        'assets/fonts/Press_Start_2P/press_start_white-2.xml',
      );
    }
    if (!this.cache.video.has(ASSET_KEYS.MENU_BG_VIDEO)) {
      this.load.video(ASSET_KEYS.MENU_BG_VIDEO, 'assets/ui/landscape.mp4', true);
    }
  }

  public create(): void {
    const { width, height } = this.scale;
    const cx = Math.round(width / 2);
    const cy = Math.round(height / 2);

    // Pure black background — the canvas behind the title.
    this.add.rectangle(0, 0, width, height, 0x000000, 1).setOrigin(0);

    // Hard-stop any leftover menu music in case back-nav lands us here (e.g.
    // future debug path). The normal splash→intro flow has no music yet.
    MusicManager.instance.stopMenu();

    // Pre-build both words as letter containers, alpha 0 until their reveal beat.
    this.#highBaseY = cy - LINE_GAP / 2;
    this.#fantasyBaseY = cy + LINE_GAP / 2;
    this.#high = this.#buildWord('HIGH', cx, this.#highBaseY);
    this.#fantasy = this.#buildWord('FANTASY', cx, this.#fantasyBaseY);
    this.#high.setAlpha(0);
    this.#fantasy.setAlpha(0);

    // Full-screen flash quad for the beats 13..22 color chain. Above letters.
    this.#flash = this.add.rectangle(0, 0, width, height, 0xffffff, 0).setOrigin(0).setDepth(100);

    // In CAPTURE_MODE we replace the normal "any key skips" handler with the
    // dedicated tap-capture key bindings — see #installCaptureBindings.
    if (CAPTURE_MODE) {
      this.#installCaptureBindings();
    } else {
      // Allow skipping on any key/click → straight to MainMenu.
      this.input.keyboard!.on('keydown', this.#skip, this);
      this.input.on('pointerdown', this.#skip, this);
    }

    // Helper: convert a song-time (s) to scene-time (ms). At PLAYBACK_RATE < 1
    // the song plays slower, so real-time delays must stretch by 1/RATE to
    // stay aligned. Then apply the uniform manual nudge (in real-time ms).
    // Clamped to 0 — values before the seek point fire immediately.
    const sceneMs = (songTimeSec: number): number =>
      Math.max(0, ((songTimeSec - SONG_START_OFFSET_S) / PLAYBACK_RATE) * 1000 + GLOBAL_BEAT_OFFSET_MS);

    // Calibration overlay — small beat counter top-left.
    if (SHOW_BEAT_COUNTER) {
      this.#beatCounter = this.add.bitmapText(4, 4, BMFONT_KEY, '', 8).setOrigin(0, 0).setTint(0xffd84a).setDepth(200);
    }

    // Start music via MusicManager so the sound is OWNED by the manager and
    // survives the IntroScene → MainMenuScene shutdown. loop=true keeps the
    // song going on the main menu after the intro animation completes.
    this.#music = MusicManager.instance.playIntro(this, {
      seek: SONG_START_OFFSET_S,
      rate: PLAYBACK_RATE,
      volume: 0,
      loop: true,
    });
    if (this.#music) {
      this.tweens.add({
        targets: this.#music as unknown as { volume: number },
        volume: MUSIC_VOLUME,
        duration: Math.max(50, sceneMs(MUSIC_FADE_END_AT)),
        ease: 'Sine.In',
      });
    }

    // CAPTURE_MODE: don't play the animation — let the user tap beats freely
    // against the music until they hit ENTER. Skip everything below.
    if (CAPTURE_MODE) return;

    // Schedule word reveals (all timings expressed in SONG-TIME; sceneMs shifts).
    this.time.delayedCall(sceneMs(WORD_HIGH_AT), () => this.#revealWord(this.#high!));
    this.time.delayedCall(sceneMs(WORD_FANTASY_AT), () => this.#revealWord(this.#fantasy!));

    // Schedule the 22 beat callbacks. Beats 0..11 = letter fills, 12..21 = flash chain.
    const tStart = this.time.now;
    BEATS.forEach((beat, i) => {
      const delayMs = sceneMs(beat.start);
      this.time.delayedCall(delayMs, () => {
        if (this.#skipped) return;
        if (DEBUG_LOG_BEATS) {
          const actual = this.time.now - tStart;
          // eslint-disable-next-line no-console
          console.log(
            `[intro] beat ${i + 1} fired @ ${actual.toFixed(0)}ms ` +
              `(scheduled ${delayMs.toFixed(0)}ms, song-time ${beat.start.toFixed(3)}s)`,
          );
        }
        if (BEAT_CLICK) this.#playClick();
        if (this.#beatCounter) this.#beatCounter.setText(`beat ${i + 1}/22`);
        if (i < FILL_BEAT_COUNT) this.#fillBeat();
        else this.#flashBeat(i - FILL_BEAT_COUNT);
      });
    });

    // End-of-section "punch" beats — each fires a scale+rotate tween on the
    // HIGH/FANTASY title containers. Title accumulates state across punches
    // (no reset between), so the third punch leaves it at the most extreme
    // pose just before the white flash.
    PUNCH_BEATS.forEach((punch) => {
      this.time.delayedCall(sceneMs(punch.time), () => {
        if (this.#skipped) return;
        this.#punchTitle(punch);
      });
    });

    // Pulse beats — quick yoyo scale bumps on top of the last punch's pose.
    PULSE_BEATS.forEach((pulse) => {
      this.time.delayedCall(sceneMs(pulse.time), () => {
        if (this.#skipped) return;
        this.#pulseTitle(pulse.scaleBump, pulse.angleBump);
      });
    });

    // Stutter flashes — extra quick white overlay flashes at the 4 rapid
    // beats. Layered ON TOP of whatever fill/flash that beat already does,
    // so the section reads as a single white stab instead of fill→colors.
    STUTTER_FLASH_BEATS.forEach((time) => {
      this.time.delayedCall(sceneMs(time), () => {
        if (this.#skipped || !this.#flash) return;
        this.tweens.killTweensOf(this.#flash);
        this.#flash.setFillStyle(0xffffff, STUTTER_FLASH_ALPHA);
        this.#flash.setAlpha(1);
        this.tweens.add({
          targets: this.#flash,
          alpha: 0,
          duration: STUTTER_FLASH_FADE_MS,
          ease: 'Quad.Out',
        });
      });
    });

    // White flash + handoff fires right after the LAST title event (punch or
    // pulse, whichever ends later). Derived so retiming either array
    // automatically retimes the flash.
    const lastPunch = PUNCH_BEATS[PUNCH_BEATS.length - 1];
    const lastPunchEnd = lastPunch.time + PUNCH_DURATION_MS / 1000;
    const lastPulse = PULSE_BEATS[PULSE_BEATS.length - 1];
    const lastPulseEnd = lastPulse ? lastPulse.time + (PULSE_DURATION_MS * 2) / 1000 : 0;
    const finishAtSongTime = Math.max(lastPunchEnd, lastPulseEnd) + POST_LAST_PUNCH_HOLD_MS / 1000;
    this.time.delayedCall(sceneMs(finishAtSongTime), () => this.#finish());
  }

  // Drives a single PUNCH_BEATS row. Tweens (in parallel):
  //   - title scale + angle on both HIGH and FANTASY containers
  //   - container Y offset (push the two words apart by `lineGap`)
  //   - glow alpha down by `glowFactor` (otherwise the halo smears on scale-up)
  // Plus a one-shot dim white flash at `flashAlpha`. killTweensOf clears any
  // in-flight punch so back-to-back punches snap cleanly to the new pose.
  #punchTitle(punch: { scale: number; angle: number; glowFactor: number; lineGap: number; flashAlpha: number }): void {
    if (this.#high) {
      this.tweens.killTweensOf(this.#high);
      this.tweens.add({
        targets: this.#high,
        scale: punch.scale,
        angle: punch.angle,
        y: this.#highBaseY - punch.lineGap,
        duration: PUNCH_DURATION_MS,
        ease: 'Back.Out',
      });
    }
    if (this.#fantasy) {
      this.tweens.killTweensOf(this.#fantasy);
      this.tweens.add({
        targets: this.#fantasy,
        scale: punch.scale,
        angle: punch.angle,
        y: this.#fantasyBaseY + punch.lineGap,
        duration: PUNCH_DURATION_MS,
        ease: 'Back.Out',
      });
    }

    // Dim the glow halo proportional to glowFactor. Each glow's resting alpha
    // comes from its ring index in GLOW_RING_ALPHA; we multiply by glowFactor
    // for a per-ring target.
    this.#letters.forEach((l) => {
      l.glows.forEach((g, i) => {
        const ring = GLOW_OFFSETS[i][2];
        const baseAlpha = GLOW_RING_ALPHA[ring];
        this.tweens.killTweensOf(g);
        this.tweens.add({
          targets: g,
          alpha: baseAlpha * punch.glowFactor,
          duration: PUNCH_DURATION_MS,
          ease: 'Linear',
        });
      });
    });

    // Dim white flash that fades back to 0 — a softer echo of the big flash
    // that fires at FINISH_AT. Reuses the existing #flash rect.
    if (this.#flash && punch.flashAlpha > 0) {
      this.tweens.killTweensOf(this.#flash);
      this.#flash.setFillStyle(0xffffff, punch.flashAlpha);
      this.#flash.setAlpha(1);
      this.tweens.add({
        targets: this.#flash,
        alpha: 0,
        duration: 180,
        ease: 'Quad.Out',
      });
    }
  }

  // Quick yoyo bump on top of the last punch's pose. SCALE uses a smooth
  // sine-style breath; ANGLE uses a snappier short-duration tween (separate
  // knob: PULSE_ANGLE_DURATION_MS) so the rotation jolts instead of gliding.
  // Both yoyo back to the held pose. killTweensOf clears prior pulse tweens
  // so back-to-back pulses can interrupt cleanly.
  #pulseTitle(scaleBump: number, angleBump: number): void {
    if (BEAT_CLICK) this.#playClick();
    const lastPunch = PUNCH_BEATS[PUNCH_BEATS.length - 1];
    const baseScale = lastPunch.scale;
    const baseAngle = lastPunch.angle;
    [this.#high, this.#fantasy].forEach((word) => {
      if (!word) return;
      this.tweens.killTweensOf(word);
      // Smooth scale yoyo.
      this.tweens.add({
        targets: word,
        scale: baseScale + scaleBump,
        duration: PULSE_DURATION_MS,
        ease: 'Quad.InOut',
        yoyo: true,
      });
      // Snappy angle SNAP — no yoyo. Punches don't yoyo; pulses now match
      // that behavior so the angle holds until the next pulse/punch/flash
      // overrides. Separate tween so its duration/ease can diverge from the
      // scale tween's smooth breath.
      this.tweens.add({
        targets: word,
        angle: baseAngle + angleBump,
        duration: PULSE_ANGLE_DURATION_MS,
        ease: 'Expo.Out',
      });
    });
  }

  // -------------------------------------------------------------------------
  // Build one word as a Container of Letter objects (4 outline copies + fill
  // per char). Centered on (anchorX, anchorY).
  // -------------------------------------------------------------------------
  #buildWord(text: string, anchorX: number, anchorY: number): Phaser.GameObjects.Container {
    const totalWidth = (text.length - 1) * LETTER_SPACING;
    // Container origin is AT the text's visual center — so setScale/setAngle
    // rotate around the title's middle instead of the top-left of the screen.
    // Letters below use coords relative to the container.
    const container = this.add.container(anchorX, anchorY);

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      // Relative to container center: letters span -totalWidth/2 .. +totalWidth/2.
      const x = -totalWidth / 2 + i * LETTER_SPACING;
      const y = 0;

      // Glow ring — added FIRST so it renders below the outlines + fill.
      // Additive blend mode = overlapping copies brighten instead of overdraw,
      // which is what makes the halo read as a neon glow against black.
      //
      // Each BitmapText is rendered at FONT_SIZE × SUPERSAMPLE then scaled
      // down by 1/SUPERSAMPLE so the displayed size matches FONT_SIZE while
      // the underlying glyph texture has supersample-x more resolution. This
      // is the crispness fix for the PUNCH_BEATS scale-ups.
      const renderSize = FONT_SIZE * SUPERSAMPLE;
      const glows: Phaser.GameObjects.BitmapText[] = ENABLE_GLOW
        ? GLOW_OFFSETS.map(([dx, dy]) => {
            const t = this.add
              .bitmapText(x + dx, y + dy, BMFONT_KEY, ch, renderSize)
              .setOrigin(0.5)
              .setScale(LETTER_BASE_SCALE)
              .setTint(0xffffff)
              .setAlpha(0)
              .setBlendMode(Phaser.BlendModes.ADD);
            container.add(t);
            return t;
          })
        : [];

      // 4 outline copies, all white, offset ±1px on each axis.
      const offsets: [number, number][] = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      const outlines: Phaser.GameObjects.BitmapText[] = ENABLE_OUTLINE
        ? offsets.map(([dx, dy]) => {
            const t = this.add
              .bitmapText(x + dx, y + dy, BMFONT_KEY, ch, renderSize)
              .setOrigin(0.5)
              .setScale(LETTER_BASE_SCALE)
              .setTint(0xffffff);
            container.add(t);
            return t;
          })
        : [];

      // Fill copy on top, hidden initially (alpha 0). Tint set on fill beat.
      const fill = this.add
        .bitmapText(x, y, BMFONT_KEY, ch, renderSize)
        .setOrigin(0.5)
        .setScale(LETTER_BASE_SCALE)
        .setTint(0xffffff)
        .setAlpha(0);
      container.add(fill);

      this.#letters.push({ glows, outlines, fill, filled: false });
    }
    return container;
  }

  #revealWord(word: Phaser.GameObjects.Container): void {
    if (this.#skipped) return;
    word.setAlpha(1);
    // Subtle 80ms scale pop on appearance for a bit of punch.
    word.setScale(1.15);
    this.tweens.add({
      targets: word,
      scale: 1,
      duration: 120,
      ease: 'Back.Out',
    });
  }

  // Walks letters[] in their build order (H-I-G-H then F-A-N-T-A-S-Y). Each
  // beat fills one letter with a random element color, lights its glow ring,
  // and scale-pops the glyph. The 12th beat (after all 11 letters are filled)
  // does a "settle" pass — re-tints everything white for a clean read going
  // into the flash chain.
  #fillBeat(): void {
    if (this.#fillIndex >= this.#letters.length) {
      this.#settleAllToWhite();
      return;
    }
    const target = this.#letters[this.#fillIndex++];
    target.filled = true;

    const color = ELEMENT_COLORS[Math.floor(Math.random() * ELEMENT_COLORS.length)];
    target.fill.setTint(color).setAlpha(1);

    // Light the glow ring: each ring fades to its resting alpha; we briefly
    // overshoot on the inner ring to give the fill a "pop" of brightness.
    target.glows.forEach((g, i) => {
      const ring = GLOW_OFFSETS[i][2];
      const restAlpha = GLOW_RING_ALPHA[ring];
      g.setTint(color).setAlpha(restAlpha + 0.35);
      this.tweens.add({
        targets: g,
        alpha: restAlpha,
        duration: 220,
        ease: 'Quad.Out',
      });
    });

    // Scale-pop on the fill glyph — sells the impact of the beat. Both the
    // starting scale and the tween target are MULTIPLIED by LETTER_BASE_SCALE
    // because the BitmapText sits at 1/SUPERSAMPLE natural scale (crispness
    // trick). Tweening to plain 1.0 would leave the letter 2× too big.
    target.fill.setScale(1.4 * LETTER_BASE_SCALE);
    this.tweens.add({
      targets: target.fill,
      scale: LETTER_BASE_SCALE,
      duration: 90,
      ease: 'Quad.Out',
    });
  }

  // 12th fill beat — every letter is already lit, so brighten the whole word
  // to white. Acts as a visual "breath" before the flash-chain section.
  #settleAllToWhite(): void {
    this.#letters.forEach((l) => {
      l.fill.setTint(0xffffff).setAlpha(1);
      l.glows.forEach((g, i) => {
        const ring = GLOW_OFFSETS[i][2];
        g.setTint(0xffffff).setAlpha(GLOW_RING_ALPHA[ring]);
      });
    });
  }

  // Beats 13..22 — camera shake + full-screen color flash. Intensity ramps up
  // toward the final beat (the "drop" that ends the animation).
  #flashBeat(index: number): void {
    if (!this.#flash) return;
    const ramp = (index + 1) / 10; // 0.1 → 1.0
    const color = FLASH_COLORS[index % FLASH_COLORS.length];

    this.#flash.setFillStyle(color, 0.5 + 0.4 * ramp);
    this.tweens.add({
      targets: this.#flash,
      alpha: 0,
      duration: 120 + 40 * ramp * 10,
      ease: 'Quad.Out',
    });

    const shake = 0.003 + 0.012 * ramp;
    this.cameras.main.shake(120 + 60 * ramp, shake);
  }

  // -------------------------------------------------------------------------
  // Skip / finish handlers
  // -------------------------------------------------------------------------
  #skip = (): void => {
    if (this.#skipped) return;
    this.#skipped = true;
    this.input.keyboard!.off('keydown', this.#skip, this);
    this.input.off('pointerdown', this.#skip, this);
    // Skip = hard-stop the intro music; MainMenu will start its normal track.
    MusicManager.instance.stopIntro();
    this.#goToMenu(false);
  };

  // End-of-animation: snap the full-screen flash to opaque white, hold briefly,
  // then hand off to MainMenu which fades IN from white. The intro music is
  // NOT stopped — MusicManager owns it and it continues into the menu.
  #finish(): void {
    if (this.#skipped) return;
    this.#skipped = true;

    // Snap to white (no tween). The hold reads as a deliberate flash beat.
    if (this.#flash) this.#flash.setFillStyle(0xffffff, 1);

    // Suppress further input during the hold.
    this.input.keyboard!.off('keydown', this.#skip, this);
    this.input.off('pointerdown', this.#skip, this);

    this.time.delayedCall(240, () => this.#goToMenu(true));
  }

  #goToMenu(fromIntro: boolean): void {
    markMainMenuCinematicPlayed();
    if (fromIntro) markMainMenuArrivingFromIntro();
    this.scene.start(SCENE_KEYS.MAIN_MENU_SCENE);
  }

  // -------------------------------------------------------------------------
  // CALIBRATION ONLY — synthesizes a short 2kHz square-wave click directly on
  // the shared WebAudio context, no asset needed. Listen against the music to
  // hear whether your scheduled beats lead or lag the actual buggy stutter.
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // CAPTURE_MODE — tap-tempo recorder
  // -------------------------------------------------------------------------
  #installCaptureBindings(): void {
    // HUD: instructions + live tap counter.
    this.add
      .bitmapText(4, 4, BMFONT_KEY, 'CAPTURE MODE — SPACE=tap  ENTER=save  BKSP=clear', 8)
      .setTint(0xffd84a)
      .setDepth(200);
    this.#captureHud = this.add.bitmapText(4, 18, BMFONT_KEY, 'taps: 0', 8).setTint(0xffffff).setDepth(200);

    const kb = this.input.keyboard!;
    kb.on('keydown-Z', this.#tapBeat, this);
    kb.on('keydown-ENTER', this.#saveCaptureRun, this);
    kb.on('keydown-BACKSPACE', this.#clearCaptureStorage, this);
  }

  // Read the music's current playback position (in REAL song-seconds — the
  // `seek` property tracks source time, not real-world elapsed, so it's
  // already corrected for PLAYBACK_RATE). Push to captures + visual feedback.
  #tapBeat = (): void => {
    if (!this.#music) return;
    const songTime = (this.#music as unknown as { seek: number }).seek;
    this.#captures.push(songTime);
    if (this.#captureHud) this.#captureHud.setText(`taps: ${this.#captures.length}`);
    this.#playClick();
    // Visual nudge: brief screen-edge flash so the tap registers visually.
    if (this.#flash) {
      this.#flash.setFillStyle(0xffffff, 0.18);
      this.tweens.add({ targets: this.#flash, alpha: 0, duration: 80, ease: 'Quad.Out' });
    }
  };

  #saveCaptureRun = (): void => {
    if (this.#captures.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[intro-capture] no taps recorded — nothing to save');
      return;
    }
    const prior = this.#loadStoredRuns();
    const run = [...this.#captures].sort((a, b) => a - b);
    prior.push(run);
    try {
      localStorage.setItem(CAPTURE_STORAGE_KEY, JSON.stringify(prior));
    } catch {
      // localStorage may be disabled — still log to console below.
    }

    // eslint-disable-next-line no-console
    console.log(`[intro-capture] run #${prior.length} saved (${run.length} taps):`, run);
    this.#dumpAggregate(prior);

    // Lock further capture for this scene so the user knows it's done.
    this.input.keyboard!.off('keydown-SPACE', this.#tapBeat, this);
    if (this.#captureHud) this.#captureHud.setText(`SAVED run #${prior.length} — refresh for next`);
  };

  #clearCaptureStorage = (): void => {
    try {
      localStorage.removeItem(CAPTURE_STORAGE_KEY);
    } catch {
      /* noop */
    }
    this.#captures = [];
    if (this.#captureHud) this.#captureHud.setText('cleared — taps: 0');
    // eslint-disable-next-line no-console
    console.log('[intro-capture] storage cleared');
  };

  #loadStoredRuns(): number[][] {
    try {
      const raw = localStorage.getItem(CAPTURE_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as number[][]) : [];
    } catch {
      return [];
    }
  }

  // Print aggregate across all stored runs. Aligns runs by tap INDEX (run[0]
  // = beat 1, run[1] = beat 2, …) and averages. Runs with a different tap
  // count than the first are flagged but still averaged on shared indices.
  #dumpAggregate(runs: number[][]): void {
    if (runs.length === 0) return;
    const expectedLen = runs[0].length;
    const maxLen = Math.max(...runs.map((r) => r.length));

    const averages: number[] = [];
    const stddevs: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      const samples = runs.map((r) => r[i]).filter((v) => typeof v === 'number');
      if (samples.length === 0) {
        averages.push(NaN);
        stddevs.push(NaN);
        continue;
      }
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
      averages.push(mean);
      stddevs.push(Math.sqrt(variance));
    }

    /* eslint-disable no-console */
    console.log(`[intro-capture] ${runs.length} run(s) stored. Tap counts:`, runs.map((r) => r.length).join(', '));
    if (!runs.every((r) => r.length === expectedLen)) {
      console.warn('[intro-capture] tap counts differ between runs — averages cover shared indices only');
    }
    console.log('[intro-capture] per-index averages (s) ± stddev (ms):');
    averages.forEach((avg, i) => {
      const sd = stddevs[i] * 1000;
      console.log(`  beat ${(i + 1).toString().padStart(2, ' ')}: ${avg.toFixed(3)}  ±${sd.toFixed(0)}ms`);
    });

    // Paste-ready BEATS array — end values reuse start+0.02s as a placeholder.
    const beatsLines = averages.map(
      (avg, i) => `  { start: ${avg.toFixed(3)}, end: ${(avg + 0.02).toFixed(3)} },  // ${i + 1}`,
    );
    console.log('[intro-capture] paste into BEATS[]:\nconst BEATS: Beat[] = [\n' + beatsLines.join('\n') + '\n];');
    /* eslint-enable no-console */
  }

  #playClick(): void {
    const sm = this.sound as unknown as { context?: AudioContext };
    const ctx = sm.context;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = CLICK_WAVEFORM;
    osc.frequency.value = CLICK_FREQ_HZ;
    // Schedule a tiny lookahead in the future (5ms) instead of currentTime.
    // WebAudio quantizes scheduling to 128-sample chunks (~3ms at 44.1kHz);
    // when two clicks fire on adjacent JS ticks, calling osc.start(currentTime)
    // can land them in the same audio quantum and one gets dropped. The
    // 5ms lookahead guarantees each click gets its own slot.
    const t = ctx.currentTime + 0.005;
    const durSec = CLICK_DURATION_MS / 1000;
    gain.gain.setValueAtTime(CLICK_VOLUME, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + durSec);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + durSec + 0.01);
  }
}
