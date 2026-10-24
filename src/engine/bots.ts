import { aliveIds, eligibleVoters, murderTargets, voteTargets } from './game';
import type { Action, GameState } from './types';

/**
 * Simple stand-in players for demos and testing. Returns every action the bots
 * still owe in the current phase; the runtime spaces them out so they feel human.
 */
export function botActions(s: GameState, rng: () => number): Action[] {
  const bots = s.players.filter((p) => p.isBot && p.alive);
  const out: Action[] = [];
  const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];

  if (s.phase === 'vote') {
    const voters = eligibleVoters(s);
    for (const b of bots) {
      if (!voters.includes(b.id) || s.votes[b.id]) continue;
      let targets = voteTargets(s, b.id);
      // Traitors avoid voting for each other when they can.
      if (s.roles[b.id] === 'traitor') {
        const faithful = targets.filter((t) => s.roles[t] !== 'traitor');
        if (faithful.length) targets = faithful;
      } else {
        // Faithful bots pile on whoever already has votes, as people do.
        const leaning = Object.values(s.votes).filter((t) => targets.includes(t));
        if (leaning.length && rng() < 0.5) targets = leaning;
      }
      if (targets.length) out.push({ type: 'castVote', playerId: b.id, targetId: pick(targets) });
    }
  }

  if (s.phase === 'night') {
    const targets = murderTargets(s);
    const humanPick = Object.entries(s.nightPicks).find(([id]) => !s.players.find((p) => p.id === id)?.isBot)?.[1];
    for (const b of bots) {
      if (s.roles[b.id] === 'traitor') {
        if (!targets.length) continue;
        // Follow a human Traitor's lead, otherwise agree with the first Traitor to choose.
        if (s.nightPicks[b.id] && (!humanPick || s.nightPicks[b.id] === humanPick)) continue;
        const lead = humanPick ?? Object.values(s.nightPicks)[0];
        out.push({ type: 'nightPick', playerId: b.id, targetId: lead ?? pick(targets) });
      } else if (!s.suspicions[b.id]) {
        const others = aliveIds(s).filter((id) => id !== b.id);
        if (others.length) out.push({ type: 'suspect', playerId: b.id, targetId: pick(others) });
      }
    }
  }

  if (s.phase === 'endgameVote') {
    for (const b of bots) {
      if (s.endVotes[b.id]) continue;
      const choice = s.roles[b.id] === 'traitor' || rng() < 0.6 ? 'end' : 'banish';
      out.push({ type: 'endVote', playerId: b.id, choice });
    }
  }

  return out;
}

/** Bots in the Traitors' chat now and then, so the chat feels alive in a demo. */
export const BOT_TRAITOR_LINES = [
  'Keep your face still at breakfast.',
  'Not the loud one. Everyone already suspects them.',
  'We vote together, but not too obviously.',
  'I could cry at the Round Table if it helps.',
  'Agreed. Let’s be quick about it.',
];
