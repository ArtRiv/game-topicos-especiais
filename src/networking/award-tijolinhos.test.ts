import { describe, it, expect, vi } from 'vitest';
import { awardTijolinhos, calculateTijolinhos } from './award-tijolinhos.js';
import {
  TIJOLINHOS_PARTICIPATION,
  TIJOLINHOS_WIN_BONUS,
  TIJOLINHOS_LOSS_BONUS,
  TIJOLINHOS_DRAW_BONUS,
  TIJOLINHOS_PER_KILL,
  TIJOLINHOS_MAX,
} from '../common/config';

describe('calculateTijolinhos', () => {
  it('awards participation + win bonus + per-kill to the winning team', () => {
    expect(calculateTijolinhos({ team: 0, kills: 4 }, 0)).toBe(
      TIJOLINHOS_PARTICIPATION + TIJOLINHOS_WIN_BONUS + 4 * TIJOLINHOS_PER_KILL,
    );
  });

  it('awards participation + loss bonus + per-kill to the losing team', () => {
    expect(calculateTijolinhos({ team: 1, kills: 2 }, 0)).toBe(
      TIJOLINHOS_PARTICIPATION + TIJOLINHOS_LOSS_BONUS + 2 * TIJOLINHOS_PER_KILL,
    );
  });

  it('awards the draw bonus when winningTeam is null', () => {
    expect(calculateTijolinhos({ team: 0, kills: 0 }, null)).toBe(TIJOLINHOS_PARTICIPATION + TIJOLINHOS_DRAW_BONUS);
  });

  it('caps the total at TIJOLINHOS_MAX', () => {
    expect(calculateTijolinhos({ team: 0, kills: 999 }, 0)).toBe(TIJOLINHOS_MAX);
  });
});

describe('awardTijolinhos', () => {
  it('no-ops with skipped status outside the browser/platform', () => {
    const onStatus = vi.fn();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // node test env: no window → dev no-op path, no fetch fired.
    awardTijolinhos(50, onStatus);

    expect(onStatus).toHaveBeenCalledWith('skipped', '');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[tijolinhos] DEV no-op'));
    logSpy.mockRestore();
  });
});
