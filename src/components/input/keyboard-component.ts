import * as Phaser from 'phaser';
import { InputComponent } from './input-component';

export class KeyboardComponent extends InputComponent {
  #scene: Phaser.Scene;
  #wKey: Phaser.Input.Keyboard.Key;
  #aKey: Phaser.Input.Keyboard.Key;
  #sKey: Phaser.Input.Keyboard.Key;
  #dKey: Phaser.Input.Keyboard.Key;
  #spell1Key: Phaser.Input.Keyboard.Key;
  #spell2Key: Phaser.Input.Keyboard.Key;
  #spell3Key: Phaser.Input.Keyboard.Key;
  #debugToggleKey: Phaser.Input.Keyboard.Key;
  #actionKey: Phaser.Input.Keyboard.Key;
  #enterKey: Phaser.Input.Keyboard.Key;
  #spaceKey: Phaser.Input.Keyboard.Key;
  #shiftKey: Phaser.Input.Keyboard.Key;
  #carouselLeftKey: Phaser.Input.Keyboard.Key;  // Q — previous element
  #carouselRightKey: Phaser.Input.Keyboard.Key; // E — next element
  #specialCastKey: Phaser.Input.Keyboard.Key;   // R — cast pickup-granted special spell
  #printCoordsKey: Phaser.Input.Keyboard.Key;   // M — print player world coords to console
  #capturePickupSpawnKey: Phaser.Input.Keyboard.Key; // K — capture current pos as a pickup spawnpoint

  // Mouse-button state. Latched to "just down" on pointerdown and consumed at end of frame.
  #leftMouseJustDown = false;
  #rightMouseJustDown = false;

  constructor(scene: Phaser.Scene, keyboardPlugin: Phaser.Input.Keyboard.KeyboardPlugin) {
    super();
    this.#scene = scene;
    this.#wKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.#aKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.#sKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.#dKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.#spell1Key = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.#spell2Key = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.#spell3Key = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    // Interact rebound from E to F so E can drive the element carousel.
    this.#actionKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.#enterKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.#debugToggleKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.#spaceKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.#shiftKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.#carouselLeftKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.#carouselRightKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.#specialCastKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.#printCoordsKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.#capturePickupSpawnKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.K);

    // Prevent Chrome's default page-scroll on SPACE and any browser shortcuts on SHIFT
    // while the game canvas has focus. CTRL is intentionally NOT captured (D-19, Phase 9.3)
    // so Ctrl+W / Ctrl+T / Ctrl+R pass through to the browser.
    keyboardPlugin.addCapture('SPACE,SHIFT');

    // Mouse bindings: left = spell slot 0 (alongside `1`), right = spell slot 1 (alongside `2`).
    // Right-click would normally open the browser context menu — suppress it for the canvas.
    scene.input.mouse?.disableContextMenu();
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) this.#leftMouseJustDown = true;
      if (pointer.rightButtonDown()) this.#rightMouseJustDown = true;
    });
    // Clear latched "just down" flags after each frame so they fire exactly once,
    // matching Phaser.Input.Keyboard.JustDown semantics.
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.#clearJustDownFlags, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.#clearJustDownFlags, this);
    });

    // WASD       = movement
    // SHIFT      = dash (D-13/14, Phase 9.3)
    // SPACE      = hold to open radial element-selection menu (rebound from CTRL — D-17, Phase 9.3)
    // 1 / LMB    = spell slot 1
    // 2 / RMB    = spell slot 2
    // 3          = spell slot 3 (hold)
    // Q          = element carousel: previous
    // E          = element carousel: next
    // F          = interact / action (rebound from E)
    // M          = print player world coords to console (TDM spawnpoint tool)
    // K          = capture current pos as a special-pickup spawnpoint (accumulates + prints paste-ready array)
    // P          = toggle arcade physics hitboxes
    // mouse move = aim target position
    // CTRL       = no longer bound (D-19) — Ctrl+W/T/R passes through to browser
  }

  #clearJustDownFlags(): void {
    this.#leftMouseJustDown = false;
    this.#rightMouseJustDown = false;
  }

  get isUpDown(): boolean {
    return this.#wKey.isDown;
  }

  get isUpJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#wKey);
  }

  get isDownDown(): boolean {
    return this.#sKey.isDown;
  }

  get isDownJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#sKey);
  }

  get isLeftDown(): boolean {
    return this.#aKey.isDown;
  }

  get isRightDown(): boolean {
    return this.#dKey.isDown;
  }

  get isActionKeyJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#actionKey);
  }

  get isAttackKeyJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#spell1Key);
  }

  get isSelectKeyJustDown(): boolean {
    return false;
  }

  get isEnterKeyJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#enterKey);
  }

  get isSpell1KeyJustDown(): boolean {
    // Read keyboard first so Phaser's internal JustDown latch is consumed every frame.
    const keyboardJustDown = Phaser.Input.Keyboard.JustDown(this.#spell1Key);
    return keyboardJustDown || this.#leftMouseJustDown;
  }

  get isSpell2KeyJustDown(): boolean {
    const keyboardJustDown = Phaser.Input.Keyboard.JustDown(this.#spell2Key);
    return keyboardJustDown || this.#rightMouseJustDown;
  }

  get isCarouselLeftJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#carouselLeftKey);
  }

  get isCarouselRightJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#carouselRightKey);
  }

  get isSpecialCastJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#specialCastKey);
  }

  // isSpell2KeyDown returns true while slot-1 (right mouse OR `2`) is HELD — used
  // by the charged lightning ray to detect press-hold-release. Mirrors the
  // isSpell3KeyDown pattern (FireBreath). The right mouse button's held state
  // comes straight from the active pointer; `2` from the key's isDown.
  get isSpell2KeyDown(): boolean {
    return this.#spell2Key.isDown || (this.#scene.input.activePointer?.rightButtonDown() ?? false);
  }

  // isSpell3KeyDown returns true while THREE is held (not just-down)
  get isSpell3KeyDown(): boolean {
    return this.#spell3Key.isDown;
  }

  // isSpell3KeyJustDown returns true only on the frame THREE is first pressed
  get isSpell3KeyJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#spell3Key);
  }

  get isDebugToggleKeyJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#debugToggleKey);
  }

  get isPrintCoordsKeyJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#printCoordsKey);
  }

  get isCapturePickupSpawnKeyJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#capturePickupSpawnKey);
  }

  get isRadialMenuKeyJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#spaceKey);
  }

  get isDashKeyJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#shiftKey);
  }

  // Scratch vector to avoid per-cast allocation when transforming the pointer.
  #worldPointBuf: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

  /**
   * Transform the active pointer's screen position through GameScene's main camera and
   * cache the result in #worldPointBuf. We CANNOT use `activePointer.worldX/Y` directly:
   * `activePointer` is shared across all running scenes, and its worldX/Y is recomputed
   * on each scene's input update. UiScene is launched on top of GameScene and runs an
   * input plugin against a non-scrolling HUD camera, so its update overwrites the
   * pointer's world coordinates to ignore the GameScene camera's scroll. The bug
   * manifested as spells being aimed off-axis — worst when the player was near a screen
   * edge, since the missing scroll offset is largest there. Going through the main
   * camera explicitly is the only reliable way to get world coordinates here.
   */
  #updateWorldPoint(): Phaser.Math.Vector2 {
    const cam = this.#scene.cameras.main;
    const ptr = this.#scene.input.activePointer;
    return cam.getWorldPoint(ptr.x, ptr.y, this.#worldPointBuf) as Phaser.Math.Vector2;
  }

  get mouseWorldX(): number {
    return this.#updateWorldPoint().x;
  }

  get mouseWorldY(): number {
    return this.#updateWorldPoint().y;
  }
}
