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
  #actionKey: Phaser.Input.Keyboard.Key;
  #enterKey: Phaser.Input.Keyboard.Key;

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
    this.#actionKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.#enterKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

    // WASD = movement
    // 1 = spell slot 1 (Fire Bolt)
    // 2 = spell slot 2 (Fire Area)
    // 3 = spell slot 3 (Fire Breath - hold)
    // E = interact / action
    // mouse = aim target position
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
    return Phaser.Input.Keyboard.JustDown(this.#spell1Key);
  }

  get isSpell2KeyJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#spell2Key);
  }

  // isSpell3KeyDown returns true while THREE is held (not just-down)
  get isSpell3KeyDown(): boolean {
    return this.#spell3Key.isDown;
  }

  get mouseWorldX(): number {
    return this.#scene.input.activePointer.worldX;
  }

  get mouseWorldY(): number {
    return this.#scene.input.activePointer.worldY;
  }
}
