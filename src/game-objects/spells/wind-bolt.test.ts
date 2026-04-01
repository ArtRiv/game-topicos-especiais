import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import { RUNTIME_CONFIG } from '../../common/runtime-config';

describe('WindBolt', () => {
  let WindBolt: typeof import('./wind-bolt').WindBolt;

  beforeEach(async () => {
    vi.resetModules();
    ({ WindBolt } = await import('./wind-bolt'));
  });

  it('has element === ELEMENT.WIND', () => {
    const mockScene = createMockScene();
    const bolt = new WindBolt(mockScene, 0, 0, 10, 0);
    expect(bolt.element).toBe(ELEMENT.WIND);
  });

  it('has spellId === SPELL_ID.WIND_BOLT', () => {
    const mockScene = createMockScene();
    const bolt = new WindBolt(mockScene, 0, 0, 10, 0);
    expect(bolt.spellId).toBe(SPELL_ID.WIND_BOLT);
  });

  it('has spellType === SPELL_TYPE.PROJECTILE', () => {
    const mockScene = createMockScene();
    const bolt = new WindBolt(mockScene, 0, 0, 10, 0);
    expect(bolt.spellType).toBe(SPELL_TYPE.PROJECTILE);
  });

  it('baseDamage equals RUNTIME_CONFIG.WIND_BOLT_DAMAGE', () => {
    const mockScene = createMockScene();
    const bolt = new WindBolt(mockScene, 0, 0, 10, 0);
    expect(bolt.baseDamage).toBe(RUNTIME_CONFIG.WIND_BOLT_DAMAGE);
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
