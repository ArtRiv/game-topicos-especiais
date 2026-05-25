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

// Skip into the song so the player doesn't sit through 12s of intro before
// anything happens. The song is seeked to SONG_START_OFFSET_S on play, and all
// event timings (WORD_*_AT, BEATS) are SONG-TIME — we subtract the offset
// when scheduling. Tune this one constant to shift the whole intro forward.
const SONG_START_OFFSET_S = 10.5;

// Both words appear at hand-picked offsets BEFORE the rapid-beat section.
// Times are seconds from teste.mp3 start (NOT from scene start).
// const WORD_HIGH_AT = 12.16;
const WORD_HIGH_AT = 12.55;
const WORD_FANTASY_AT = 13.35;

// How long to hold the final punch pose before kicking off the white flash
// and scene transition. Smaller = tighter "punch into flash" feel (no awkward
// static-pose pause). Set to ~0 for instant flash-on-punch, raise to 100+ if
// you want a beat to read the extreme pose first.
const POST_LAST_PUNCH_HOLD_MS = 0;

// Three end-of-section "punch" beats — captured via 3-run tap-tempo and
// averaged. Each fires a multi-target tween on the HIGH/FANTASY title:
//   - scale       title scale multiplier (1.0 = normal; >1 grows)
//   - angle       degrees of tilt (signed; alternate signs side-to-side)
//   - glowFactor  multiplier on the resting glow alpha — drop as scale rises
//                 so the halo doesn't smear/blur the upscaled glyph
//   - lineGap     extra px to push HIGH up and FANTASY down (each by this
//                 amount), preventing the two words overlapping when scaled
//   - flashAlpha  peak opacity of a brief white flash overlay (0 = none).
//                 The flash fades back to 0 over ~180ms post-punch.
// Title transforms ACCUMULATE — final punch leaves the title at its last
// pose until FINISH_AT wipes everything with the big white flash.
const PUNCH_BEATS: {
  time: number;
  scale: number;
  angle: number;
  glowFactor: number;
  lineGap: number;
  flashAlpha: number;
}[] = [
  { time: 16.341, scale: 1.15, angle: -15, glowFactor: 0.7, lineGap: 4, flashAlpha: 0.15 },
  { time: 16.478, scale: 1.3, angle: 20, glowFactor: 0.4, lineGap: 10, flashAlpha: 0.25 },
  { time: 16.61, scale: 1.8, angle: -30, glowFactor: 0.1, lineGap: 22, flashAlpha: 0.4 },
];

// How long each punch tween takes (ms). Keep below ~120ms so the third punch
// has time to land before FINISH_AT fires the white flash. ~50ms feels
// "snappy" while still showing the Back.Out overshoot; drop to 30 for near-
// instant, raise to 80 for more visible motion.
const PUNCH_DURATION_MS = 80;

// Music fade-in completes at this SONG-TIME offset. With SONG_START_OFFSET_S=12
// and this at 12.3, the fade lasts ~300ms after scene start — basically a
// quick volume ramp instead of a 12s build.
const MUSIC_FADE_END_AT = 12.3;
const MUSIC_VOLUME = 0.3;

// ---- MANUAL TUNING KNOBS -------------------------------------------------
// Uniform nudge applied to EVERY scheduled event (words + 22 beats). Positive
// = events fire LATER (push back); negative = events fire EARLIER (pull
// forward). Use this when the whole animation drifts in one direction. If
// only some beats feel off, edit those individual rows in BEATS below.
const GLOBAL_BEAT_OFFSET_MS = 0;

// Logs "[intro] beat N @ scene-time Xms (song-time Ys)" on every fire when
// true. Useful for A/B comparing felt-timing vs. configured-timing. Leave
// false in shipped builds.
const DEBUG_LOG_BEATS = false;

// CALIBRATION RATE — slows the song AND all event scheduling proportionally.
// 1.0 = ship speed. 0.5 = half speed (everything plays for 2× as long).
// 0.25 = quarter speed (4× as long). Lets you HEAR + SEE each fast beat clearly
// when tuning. Set back to 1.0 before shipping.
const PLAYBACK_RATE = 1.0;

// Plays a short synthesized "tick" on every scheduled beat. Originally a
// calibration aid (compare clicks vs. music to spot drift), but it doubles
// as an audio sweetener that layers on top of the song. The three knobs
// below tune its character.
const BEAT_CLICK = true;
// Pitch in Hz. Lower (~600-1200) = thumpy/kick-drum. Mid (1500-2500) = snare
// or rim-shot. High (3000-5000) = laser/zap. Default 2400 = bright tick.
const CLICK_FREQ_HZ = 2400;
// Peak volume of the click (linear gain, 0..1). The click decays exponentially
// from this value to silence over CLICK_DURATION_MS, so the perceived
// loudness is roughly half of this number.
const CLICK_VOLUME = 0.2;
// Wave shape — 'square' (harsh, retro), 'sawtooth' (buzzy), 'triangle' (soft),
// 'sine' (pure tone, dull). Square has the most "click" character.
const CLICK_WAVEFORM: OscillatorType = 'square';
// Decay length. Shorter = sharper tick; longer = closer to a tone.
const CLICK_DURATION_MS = 15;

// Renders "beat N/22" in the top-left while each beat is firing. Helpful with
// PLAYBACK_RATE < 1.0 so you can see which beat number is currently visible.
const SHOW_BEAT_COUNTER = false;

// ---- TAP-CAPTURE MODE ----------------------------------------------------
// When CAPTURE_MODE = true, the auto-scheduled animation is disabled. Music
// plays and you tap SPACE on each beat you hear. Each tap records the CURRENT
// song-time (in real song-seconds, independent of PLAYBACK_RATE). ENTER ends
// the run, appends it to localStorage under CAPTURE_STORAGE_KEY, and dumps
// both the current run and the per-index AVERAGE across all stored runs to
// the browser console — ready to paste into BEATS[]. BACKSPACE wipes saved
// runs to start over.
//
// Workflow:
//   1. Set CAPTURE_MODE = true, PLAYBACK_RATE = 0.5 (or 1.0 if you can manage).
//   2. Run the intro, tap SPACE on each beat. ENTER to finish.
//   3. Repeat 3-5 times (each refresh of the intro = one new run).
//   4. Read the averaged BEATS array from the console, paste into BEATS[].
//   5. BACKSPACE clears storage if you want to redo.
//   6. Set CAPTURE_MODE = false to test the result.
const CAPTURE_MODE = false;
const CAPTURE_STORAGE_KEY = 'intro-beat-capture-runs';
// --------------------------------------------------------------------------

// 22 beat windows, each {start, end} in real-song seconds. Values derived from
// timing.txt (slowed-time → real-time via × playback-rate). Keep both numbers
// — duration matters for "how long the fill flash lingers".
type Beat = { start: number; end: number };
// const BEATS: Beat[] = [
//   { start: 14.56, end: 14.585 }, // 1   — 0.5x source
//   { start: 14.6, end: 14.625 }, // 2
//   { start: 14.64, end: 14.665 }, // 3   (extrapolated: "same duration")
//   { start: 15.0325, end: 15.0475 }, // 4
//   { start: 15.05, end: 15.065 }, // 5
//   { start: 15.0675, end: 15.0825 }, // 6
//   { start: 15.085, end: 15.1 }, // 7
//   { start: 15.115, end: 15.14 }, // 8
//   { start: 15.505, end: 15.53 }, // 9
//   { start: 15.545, end: 15.76 }, // 10  — 0.25x source
//   { start: 15.76, end: 15.906 }, // 11
//   { start: 15.906, end: 15.914 }, // 12  — 0.10x source (stutter)
//   { start: 15.916, end: 15.924 }, // 13
//   { start: 15.926, end: 16.003 }, // 14
//   { start: 16.006, end: 16.014 }, // 15
//   { start: 16.016, end: 16.109 }, // 16
//   { start: 16.127, end: 16.21 }, // 17
//   { start: 16.217, end: 16.226 }, // 18
//   { start: 16.308, end: 16.4 }, // 19
//   { start: 16.419, end: 16.511 }, // 20
//   { start: 16.529, end: 16.725 }, // 21
//   { start: 16.8, end: 16.816 }, // 22
// ];

// Beats 1-18: tap-tempo averages across 5 capture runs (PLAYBACK_RATE 0.10).
// Spread across runs was ≤±10ms per beat — high confidence.
// Beats 19-22: last 5-run aggregate; user reported reduced confidence past 18
// because the tail of the section was hardest to tap. Re-capture to refine.
const BEATS: Beat[] = [
  { start: 14.741, end: 14.751 }, // 1
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
  { start: 16.074, end: 16.094 }, // 16
  { start: 16.195, end: 16.215 }, // 17
  { start: 16.269, end: 16.289 }, // 18
  // --- below: lower confidence, re-tap if drift is audible ---
  { start: 16.331, end: 16.351 }, // 19
  { start: 16.467, end: 16.487 }, // 20
  { start: 16.603, end: 16.623 }, // 21
  { start: 16.717, end: 16.737 }, // 22
];

// 11 letters in "HIGHFANTASY" → 12 fill beats means one letter gets filled
// twice (last fill brightens to white). We use beats 0..11 for fills and
// 12..21 for the shake/flash chain.
const FILL_BEAT_COUNT = 12;

// Neon element palette — saturated, high-luminance, picked to look "lit" when
// blended additively against black. Dull/muddy colors (browns, dusty pastels)
// were swapped out; everything here pushes one channel near max so the additive
// glow layer keeps its color identity instead of washing to white.
const ELEMENT_COLORS = [
  0xff2a1f, // fire — neon red-orange
  0xffaa00, // earth/lava — vivid amber (brown looked dead)
  0x00b4ff, // water — electric blue
  0x80ffff, // ice — bright cyan
  0x80ff20, // wind — neon green
  0xfff044, // thunder — vivid yellow
  0xff40d0, // darkness — magenta (pure neon purple shifts pink in additive)
];

// Flash colors for beats 13..22 — same palette but biased brighter.
const FLASH_COLORS = [0xffffff, 0xffd84a, 0xff6b3d, 0x4a90e2, 0xa060d0, 0xc8f0a0, 0xb3e0ff];

const FONT_SIZE = 28;
const LETTER_SPACING = 28; // px between letter origins (~6px visible gap at FONT_SIZE 28)
const LINE_GAP = 40; // px between HIGH baseline and FANTASY baseline

// SUPERSAMPLE — render each BitmapText at FONT_SIZE × SUPERSAMPLE and then
// .setScale(1/SUPERSAMPLE) so the displayed size matches FONT_SIZE but the
// glyph texture has 2× the resolution. When PUNCH_BEATS scale to 1.8x, the
// effective per-glyph scale becomes 0.5 × 1.8 = 0.9 — still DOWNSCALING the
// source texture, which stays crisp. Raise to 3 for even more headroom if
// you push punch scale above 2.0.
const SUPERSAMPLE = 2;
// Convenience: the resting scale every individual BitmapText sits at.
// Per-letter scale tweens (e.g. fill-pop) MUST end here, not at 1.0, or the
// letter ends up 2× its intended display size.
const LETTER_BASE_SCALE = 1 / SUPERSAMPLE;

// ---- BLUR DIAGNOSTIC TOGGLES --------------------------------------------
// Flip these to isolate what's causing perceived blur on the punch scale-up.
//
// ENABLE_GLOW    — 12 additive-blend copies forming the neon halo. The most
//                  likely culprit: overlapping ADD-blended copies look like
//                  a soft fuzz when scaled up. Try false first.
// ENABLE_OUTLINE — 4 white copies offset ±1px building the letter stroke.
//                  Less likely to read as blur but worth ruling out.
// If both off and text still looks blurry → it's the BitmapText render
// itself (font scaling) and we need to bump SUPERSAMPLE to 3.
const ENABLE_GLOW = false;
const ENABLE_OUTLINE = true;
// --------------------------------------------------------------------------

// Single bitmap-font character rendered as 4 offset outline copies (white) +
// one center fill copy (alpha 0 until "filled"). Lets us re-color individual
// letters on each beat without rebuilding text objects.
type Letter = {
  // Wide additive-blend copies, alpha 0 until fill. Recolored with the fill
  // color on the letter's fill beat to produce a neon halo around the glyph.
  glows: Phaser.GameObjects.BitmapText[];
  outlines: Phaser.GameObjects.BitmapText[]; // 4 copies, offset ±1px (white)
  fill: Phaser.GameObjects.BitmapText; // center, hidden initially
  filled: boolean;
};

// Glow ring offsets — three concentric rings at radii 2, 2.8, and 3 pixels.
// Each entry: [dx, dy, ringIndex] where ringIndex 0=inner, 2=outer (used to
// pick the per-ring resting alpha so the outer ring fades softer).
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
  // Resting Y positions of HIGH / FANTASY containers — used by #punchTitle to
  // push them apart by `lineGap` and back to base on subsequent punches.
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

    // White flash + handoff fires right after the last punch lands. Derived
    // from the last PUNCH_BEATS entry so it stays synced when you tune punch
    // timings. Adjust POST_LAST_PUNCH_HOLD_MS to tighten or loosen the gap.
    const lastPunch = PUNCH_BEATS[PUNCH_BEATS.length - 1];
    const finishAtSongTime = lastPunch.time + (PUNCH_DURATION_MS + POST_LAST_PUNCH_HOLD_MS) / 1000;
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
    kb.on('keydown-SPACE', this.#tapBeat, this);
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
