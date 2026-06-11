import { describe, it, expect } from 'vitest';
import { calculateReward } from './rewards.js';
import {
  REWARD_PARTICIPATION,
  REWARD_WIN_BONUS,
  REWARD_LOSS_BONUS,
  REWARD_PER_KILL,
  REWARD_MVP_BONUS,
  REWARD_MAX,
} from './config/rewards.js';

describe('calculateReward (TDM tijolinhos)', () => {
  it('always awards the participation floor', () => {
    const { lines, total } = calculateReward({ didWin: false, kills: 0, deaths: 0, isMvp: false });
    expect(lines.find((l) => l.label === 'Participação')?.amount).toBe(REWARD_PARTICIPATION);
    // loss bonus also applies even with zero kills
    expect(total).toBe(REWARD_PARTICIPATION + REWARD_LOSS_BONUS);
  });

  it('awards the win bonus to the winning team (and not the loss bonus)', () => {
    const win = calculateReward({ didWin: true, kills: 0, deaths: 0, isMvp: false });
    expect(win.lines.some((l) => l.label === 'Vitória' && l.amount === REWARD_WIN_BONUS)).toBe(true);
    expect(win.lines.some((l) => l.label.startsWith('Participou'))).toBe(false);
    expect(win.total).toBe(REWARD_PARTICIPATION + REWARD_WIN_BONUS);
  });

  it('scores per-kill', () => {
    const { total } = calculateReward({ didWin: false, kills: 3, deaths: 5, isMvp: false });
    expect(total).toBe(REWARD_PARTICIPATION + REWARD_LOSS_BONUS + 3 * REWARD_PER_KILL);
  });

  it('adds the MVP bonus on top', () => {
    const withMvp = calculateReward({ didWin: true, kills: 4, deaths: 1, isMvp: true });
    const withoutMvp = calculateReward({ didWin: true, kills: 4, deaths: 1, isMvp: false });
    expect(withMvp.total - withoutMvp.total).toBe(REWARD_MVP_BONUS);
    expect(withMvp.lines.some((l) => l.label === 'MVP')).toBe(true);
  });

  it('only emits positive lines', () => {
    // a loss with zero kills, not MVP → no "Abates", no "MVP" line
    const { lines } = calculateReward({ didWin: false, kills: 0, deaths: 2, isMvp: false });
    expect(lines.some((l) => l.label === 'Abates')).toBe(false);
    expect(lines.some((l) => l.label === 'MVP')).toBe(false);
    expect(lines.every((l) => l.amount > 0)).toBe(true);
  });

  it('clamps the total to REWARD_MAX', () => {
    // an absurd kill count would blow past the cap; the total must clamp
    const { total } = calculateReward({ didWin: true, kills: 1000, deaths: 0, isMvp: true });
    expect(total).toBe(REWARD_MAX);
  });

  it('treats negative kills defensively as zero', () => {
    const { total } = calculateReward({ didWin: false, kills: -5, deaths: 0, isMvp: false });
    expect(total).toBe(REWARD_PARTICIPATION + REWARD_LOSS_BONUS);
  });
});
