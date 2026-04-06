import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import { RUNTIME_CONFIG } from '../../common/runtime-config';

// ---- mock phaser (uses __mocks__/phaser.ts automatically) ----

describe('IceShard', () => {
  let IceShard: typeof import('./ice-shard').IceShard;

  beforeEach(async () => {
    vi.resetModules();
    ({ IceShard } = await import('./ice-shard'));
  });

  it('has element === ELEMENT.ICE', () => {
    const mockScene = createMockScene();
    const shard = new IceShard(mockScene, 0, 0, 10, 0);
    expect(shard.element).toBe(ELEMENT.ICE);
  });

  it('has spellId === SPELL_ID.ICE_SHARD', () => {
    const mockScene = createMockScene();
    const shard = new IceShard(mockScene, 0, 0, 10, 0);
    expect(shard.spellId).toBe(SPELL_ID.ICE_SHARD);
  });

  it('has spellType === SPELL_TYPE.PROJECTILE', () => {
    const mockScene = createMockScene();
    const shard = new IceShard(mockScene, 0, 0, 10, 0);
    expect(shard.spellType).toBe(SPELL_TYPE.PROJECTILE);
  });

  it('baseDamage equals RUNTIME_CONFIG.ICE_SHARD_DAMAGE', () => {
    const mockScene = createMockScene();
    const shard = new IceShard(mockScene, 0, 0, 10, 0);
    expect(shard.baseDamage).toBe(RUNTIME_CONFIG.ICE_SHARD_DAMAGE);
  });
});

function createMockScene() {
  return {
    add: { existing: vi.fn() },
    physics: { add: { existing: vi.fn() } },
    time: { delayedCall: vi.fn(), now: 0 },
    anims: { play: vi.fn() },
  } as any;
}
