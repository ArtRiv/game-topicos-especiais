// Phaser mock for unit tests — provides EventEmitter and Physics.Arcade.Sprite base class
import EventEmitter from 'events';

class PhaserEventEmitter extends EventEmitter {
  emit(event: string | symbol, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }
  on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }
  once(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.once(event, listener);
  }
  off(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener);
  }
  removeAllListeners(event?: string | symbol): this {
    return super.removeAllListeners(event);
  }
}

/** Minimal mock body returned by the sprite base-class mock. */
class MockBody {
  enable = true;
  setSize(_w: number, _h: number, _center?: boolean) { return this; }
  setCircle(_r: number, _ox?: number, _oy?: number) { return this; }
  setVelocity(_x: number, _y?: number) { return this; }
  setImmovable(_v?: boolean) { return this; }
  setAllowGravity(_v: boolean) { return this; }
}

/** Minimal mock for Phaser.Physics.Arcade.Sprite used by spell unit tests. */
class MockArcadeSprite {
  x = 0;
  y = 0;
  rotation = 0;
  active = true;
  scene: Record<string, unknown>;
  body = new MockBody();

  constructor(scene: Record<string, unknown>, _x: number, _y: number, _key: string) {
    this.scene = scene;
  }

  setDepth(_depth: number) { return this; }
  setVisible(_v: boolean) { return this; }
  setRotation(r: number) { this.rotation = r; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setScale(_x: number, _y?: number) { return this; }
  setDisplaySize(_w: number, _h: number) { return this; }
  play(_key: string) { return this; }
  once(_event: string, _cb: () => void) { return this; }
  destroy(_fromScene?: boolean): void { this.active = false; }
}

const Events = {
  EventEmitter: PhaserEventEmitter,
};

const GameObjects = {
  Events: {
    DESTROY: 'destroy',
  },
};

const Physics = {
  Arcade: {
    Sprite: MockArcadeSprite,
  },
};

const Math = {
  Angle: {
    Between: (x1: number, y1: number, x2: number, y2: number) =>
      globalThis.Math.atan2(y2 - y1, x2 - x1),
  },
};

export default { Events, GameObjects, Physics, Math };
export { Events, GameObjects, Physics, Math };

