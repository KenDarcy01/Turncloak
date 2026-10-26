import { alive, aliveIds, eligibleVoters, murderTargets, playerById, reduce, voteTargets, type Ctx } from './game';
import type { Action, GameState, TalkLine } from './types';

/**
 * Stand-in players, so a small group can still have a full castle. Bots vote,
 * strike at night, keep a night diary and argue at the Council. They have no hidden
 * knowledge beyond their own role (and fellow Turncloaks, if they are one).
 */

const pickOf = <T,>(arr: T[], rng: () => number) => arr[Math.floor(rng() * arr.length)];

/** The latest thing each bot said this Council, keyed by speaker. */
function talkToday(s: GameState): TalkLine[] {
  return s.talk.filter((l) => l.day === s.day && l.at >= s.phaseSince);
}

/** Who a bot would like to see exiled, from what it said or a fresh suspicion. */
function suspectFor(s: GameState, botId: string, rng: () => number, among = aliveIds(s)): string | undefined {
  const options = among.filter((id) => id !== botId);
  if (!options.length) return undefined;
  const isTraitor = s.roles[botId] === 'traitor';
  // Turncloaks steer suspicion onto Truecloaks.
  const pool = isTraitor ? options.filter((id) => s.roles[id] !== 'traitor') : options;
  const usable = pool.length ? pool : options;
  const said = [...s.talk].reverse().find((l) => l.from === botId && l.day === s.day && l.target)?.target;
  if (said && usable.includes(said) && rng() < 0.75) return said;
  return pickOf(usable, rng);
}

/** Every action the bots still owe in the current phase. */
export function botActions(s: GameState, rng: () => number): Action[] {
  const bots = s.players.filter((p) => p.isBot && p.alive);
  const out: Action[] = [];

  if (s.phase === 'vote') {
    const voters = eligibleVoters(s);
    for (const b of bots) {
      if (!voters.includes(b.id) || s.votes[b.id]) continue;
      const targets = voteTargets(s, b.id);
      // Truecloak bots sometimes pile on whoever already has votes, as people do.
      const leaning = Object.values(s.votes).filter((t) => targets.includes(t) && t !== b.id);
      const target =
        s.roles[b.id] !== 'traitor' && leaning.length && rng() < 0.35
          ? pickOf(leaning, rng)
          : suspectFor(s, b.id, rng, targets);
      if (target) out.push({ type: 'castVote', playerId: b.id, targetId: target });
    }
  }

  if (s.phase === 'night') {
    const targets = murderTargets(s);
    const humanPick = Object.entries(s.nightPicks).find(([id]) => !playerById(s, id)?.isBot)?.[1];
    for (const b of bots) {
      if (s.roles[b.id] === 'traitor') {
        if (!targets.length) continue;
        // Follow a human Turncloak's lead, otherwise agree with the first Turncloak to choose.
        if (s.nightPicks[b.id] && (!humanPick || s.nightPicks[b.id] === humanPick)) continue;
        const lead = humanPick ?? Object.values(s.nightPicks)[0];
        out.push({ type: 'nightPick', playerId: b.id, targetId: lead ?? pickOf(targets, rng) });
      } else if (!s.suspicions[b.id]) {
        const others = aliveIds(s).filter((id) => id !== b.id);
        if (others.length) out.push({ type: 'suspect', playerId: b.id, targetId: pickOf(others, rng) });
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

const ACCUSE = [
  'I have been watching {t}. Every time the Turncloaks come up, {t} goes very quiet.',
  '{t}, you went very quiet during the mission. What were you thinking about?',
  'My gut says {t}. I cannot explain it, but my gut has never lied to me.',
  '{t} looks far too relaxed for someone in a castle full of Turncloaks.',
  'I am a Truecloak, hand on heart. And I do not trust {t} one bit.',
  'Did anyone else notice {t} barely tried in the mission? That was not an accident.',
  '{t} keeps agreeing with whoever spoke last. That is how a Turncloak hides.',
  'If {t} is a Truecloak, I will apologise at breakfast. But I am voting {t}.',
  'Watch {t}\u2019s eyes when the word Turncloak is said. Just watch.',
  'Everyone is looking at the loud ones. Look at {t} instead. Too careful. Too clean.',
];

const AGREE = [
  'I agree with {s}. {t} has questions to answer.',
  '{s} is right. I had the same feeling about {t} this morning.',
  'I was not sure until {s} said it. But yes, {t}.',
];

const DEFEND = [
  'I can hear my name being said. I have been a Truecloak since the very first night, and I will prove it.',
  'Exile me and you lose a Truecloak. Then the Turncloaks laugh all the way to breakfast.',
  'Of course you suspect me. That is exactly what the Turncloaks want you to do.',
];

const fill = (tpl: string, t?: string, sp?: string) => tpl.replaceAll('{t}', t ?? 'someone').replaceAll('{s}', sp ?? 'them');

/** One line of Council argument from a bot that has not spoken much yet. */
function speak(s: GameState, ctx: Ctx): TalkLine | null {
  const today = talkToday(s);
  const bots = alive(s).filter((p) => p.isBot && today.filter((l) => l.from === p.id).length < 2);
  if (!bots.length) return null;
  const bot = pickOf(bots, ctx.rng);
  const name = (id?: string) => playerById(s, id)?.name;

  // Defend if someone just accused this bot.
  const accused = today.some((l) => l.target === bot.id);
  if (accused && ctx.rng() < 0.6) {
    return { from: bot.id, text: pickOf(DEFEND, ctx.rng), day: s.day, at: ctx.now };
  }
  // Sometimes back up a recent accusation, if it suits the bot.
  const recent = today.filter((l) => l.target && l.target !== bot.id).slice(-3);
  const backing = recent.length ? pickOf(recent, ctx.rng) : null;
  const suitsMe = backing && (s.roles[bot.id] !== 'traitor' || s.roles[backing.target!] !== 'traitor');
  if (backing && suitsMe && ctx.rng() < 0.4) {
    return {
      from: bot.id,
      text: fill(pickOf(AGREE, ctx.rng), name(backing.target), name(backing.from)),
      target: backing.target,
      day: s.day,
      at: ctx.now,
    };
  }
  const target = suspectFor(s, bot.id, ctx.rng);
  if (!target) return null;
  // Avoid repeating a line already heard today.
  const heard = new Set(today.map((l) => l.text.replaceAll(name(l.target) ?? '\u0000', '{t}')));
  const fresh = ACCUSE.filter((t) => !heard.has(t));
  const tpl = pickOf(fresh.length ? fresh : ACCUSE, ctx.rng);
  return { from: bot.id, text: fill(tpl, name(target)), target, day: s.day, at: ctx.now };
}

/** Lines a bot Turncloak whispers to a human Turncloak at night. */
export const BOT_TRAITOR_LINES = [
  'Keep your face still at breakfast.',
  'Not the loud one. Everyone already suspects them.',
  'We vote together, but not too obviously.',
  'I will point at someone else tomorrow. Back me up.',
  'Agreed. Let’s be quick about it.',
];

/**
 * Called on every host tick. Bots act at a human pace, an expired vote closes,
 * and bots speak at the Council.
 */
export function botTick(s: GameState, ctx: Ctx): GameState {
  const elapsed = ctx.now - (s.phaseSince || 0);
  let next = s;

  if (s.phase === 'vote' && s.timerEndsAt && ctx.now > s.timerEndsAt) {
    return reduce(s, { type: 'closeVoting' }, ctx);
  }

  // At night, give a human Turncloak time to choose first.
  const minWait = s.phase === 'night' ? 7000 : 2500;
  if (elapsed >= minWait) {
    for (const a of botActions(next, ctx.rng)) {
      if (ctx.rng() < 0.3) next = reduce(next, a, ctx);
    }
  }

  if (s.phase === 'roundtable' && elapsed > 3000 && ctx.rng() < 0.4) {
    const line = speak(next, ctx);
    if (line) next = { ...next, talk: [...next.talk, line] };
  }

  if (s.phase === 'night' && elapsed > 4000) {
    const traitors = alive(s).filter((p) => s.roles[p.id] === 'traitor');
    const humanTraitor = traitors.some((p) => !p.isBot);
    const bot = traitors.find((p) => p.isBot);
    const spokeTonight = s.traitorChat.some((m) => m.at >= s.phaseSince && playerById(s, m.from)?.isBot);
    if (humanTraitor && bot && !spokeTonight && ctx.rng() < 0.3) {
      next = reduce(next, { type: 'traitorChat', playerId: bot.id, text: pickOf(BOT_TRAITOR_LINES, ctx.rng) }, ctx);
    }
  }

  return next;
}
