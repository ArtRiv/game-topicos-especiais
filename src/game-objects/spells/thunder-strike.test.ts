import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import { RUNTIME_CONFIG } from '../../common/runtime-config';

describe('ThunderStrike', () => {
  let ThunderStrike: typeof import('./thunder-strike').ThunderStrike;

  beforeEach(async () => {
    vi.resetModules();
    ({ ThunderStrike } = await import('./thunder-strike'));
  });

  it('has element === ELEMENT.THUNDER', () => {
    const mockScene = createMockScene();
    const strike = new ThunderStrike(mockScene, 50, 50);
    expect(strike.element).toBe(ELEMENT.THUNDER);
  });

  it('has spellId === SPELL_ID.THUNDER_STRIKE', () => {
    const mockScene = createMockScene();
    const strike = new ThunderStrike(mockScene, 50, 50);
    expect(strike.spellId).toBe(SPELL_ID.THUNDER_STRIKE);
  });

  it('has spellType === SPELL_TYPE.AREA', () => {
    const mockScene = createMockScene();
    const strike = new ThunderStrike(mockScene, 50, 50);
    expect(strike.spellType).toBe(SPELL_TYPE.AREA);
  });

  it('baseDamage equals RUNTIME_CONFIG.THUNDER_STRIKE_DAMAGE', () => {
    const mockScene = createMockScene();
    const strike = new ThunderStrike(mockScene, 50, 50);
    expect(strike.baseDamage).toBe(RUNTIME_CONFIG.THUNDER_STRIKE_DAMAGE);
  });

  it('isDamageActive is false before strike animation completes', () => {
    const mockScene = createMockScene();
    const strike = new ThunderStrike(mockScene, 50, 50);
    expect(strike.isDamageActive).toBe(false);
  });
});

function createMockScene() {
  return {
    add: { existing: vi.fn() },
    physics: { add: { existing: vi.fn() } },
    time: { delayedCall: vi.fn(() => ({ destroy: vi.fn() })), now: 0 },
    anims: { play: vi.fn() },
  } as any;
}
