// Phaser mock for unit tests — provides only EventEmitter (used by event-bus.ts)
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

const Events = {
  EventEmitter: PhaserEventEmitter,
};

export default { Events };
export { Events };
