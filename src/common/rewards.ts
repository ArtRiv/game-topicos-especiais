// Pure Team-Deathmatch reward formula for the Feira de Jogos integration.
//
// Deliberately isolated from Phaser / UI / network so it can be unit-tested in plain Node
// (see rewards.test.ts). Takes the stats available at match end and returns an itemized
// breakdown + a capped total. The UI (tdm-results-scene) renders the breakdown; the network
// layer (networking/feira.ts) sends the total to the platform.

import {
  REWARD_PARTICIPATION,
  REWARD_WIN_BONUS,
  REWARD_LOSS_BONUS,
  REWARD_PER_KILL,
  REWARD_MVP_BONUS,
  REWARD_MAX,
} from './config/rewards';

export interface RewardLine {
  label: string;
  amount: number;
}

export interface RewardBreakdown {
  lines: RewardLine[];
  total: number;
}

/** The match-end facts the reward depends on, for the LOCAL player. */
export interface RewardInput {
  didWin: boolean;   // the local player's team is the winning team
  kills: number;
  deaths: number;    // currently not scored, kept for future tuning / display parity
  isMvp: boolean;    // local player is the highest-kills player (server-resolved)
}

/**
 * Compute the local player's tijolinhos breakdown from their TDM match result.
 * Only positive lines are emitted (so the UI shows a clean list). The total is clamped to REWARD_MAX.
 */
export function calculateReward(input: RewardInput): RewardBreakdown {
  const lines: RewardLine[] = [];
  const add = (label: string, amount: number): void => {
    if (amount > 0) lines.push({ label, amount });
  };

  add('Participação', REWARD_PARTICIPATION);
  add(input.didWin ? 'Vitória' : 'Participou (derrota)', input.didWin ? REWARD_WIN_BONUS : REWARD_LOSS_BONUS);
  add('Abates', Math.max(0, input.kills) * REWARD_PER_KILL);
  if (input.isMvp) add('MVP', REWARD_MVP_BONUS);

  const rawTotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const total = Math.min(rawTotal, REWARD_MAX);
  return { lines, total };
}
