import { alive, aliveIds, eligibleVoters, murderTargets, playerById, reduce, voteTargets, type Ctx } from './game';
import { missionById } from './missions';
import type { Action, GameState, TalkLine } from './types';

/**
 * Stand-in players, so a small group can still have a full castle. Bots vote,
 * murder, keep a night diary and argue at the Round Table. They have no hidden
 * knowledge beyond their own role (and fellow Turncloaks, if they are one).
 */

const pickOf = <T,>(arr: T[], rng: () => number) => arr[Math.floor(rng() * arr.length)];

/** Most lines a bot says at one Round Table. */
const MAX_LINES = 2;

/** Everything said at today's Round Table, oldest first. */
function talkToday(s: GameState): TalkLine[] {
  return s.talk.filter((l) => l.day === s.day && l.at >= s.phaseSince);
}

/** Everything said today, including at a Round Table that has since moved on to the vote. */
function saidToday(s: GameState): TalkLine[] {
  return s.talk.filter((l) => l.day === s.day);
}

/** Whom this bot named last today, if anyone. */
function ownAccusation(s: GameState, botId: string): string | undefined {
  return [...saidToday(s)].reverse().find((l) => l.from === botId && l.target)?.target;
}

/** Who this bot is willing to point at: anyone else, but a Turncloak never names a fellow Turncloak. */
function fairGame(s: GameState, botId: string, among: string[]): string[] {
  const options = among.filter((id) => id !== botId);
  if (s.roles[botId] !== 'traitor') return options;
  const truecloaks = options.filter((id) => s.roles[id] !== 'traitor');
  return truecloaks.length ? truecloaks : options;
}

/** How many times each player was named today. This is what the bots have heard at the table. */
export function heat(s: GameState): Record<string, number> {
  const h: Record<string, number> = {};
  for (const l of saidToday(s)) if (l.target) h[l.target] = (h[l.target] ?? 0) + 1;
  return h;
}

/** The most-named player among these options, ties broken at random. */
function hottest(s: GameState, options: string[], rng: () => number): string | undefined {
  const h = heat(s);
  const top = Math.max(0, ...options.map((id) => h[id] ?? 0));
  if (top === 0) return undefined;
  return pickOf(options.filter((id) => (h[id] ?? 0) === top), rng);
}

/**
 * Who a bot votes for. A bot that named someone at the table votes for them, so its
 * words and its vote match. A bot that said nothing goes with the table's main suspect.
 */
export function botVote(s: GameState, botId: string, rng: () => number): string | undefined {
  const targets = voteTargets(s, botId);
  const options = fairGame(s, botId, targets);
  if (!options.length) return undefined;
  const said = ownAccusation(s, botId);
  if (said && options.includes(said)) return said;
  return hottest(s, options, rng) ?? pickOf(options, rng);
}

/** Every action the bots still owe in the current phase. */
export function botActions(s: GameState, rng: () => number): Action[] {
  const bots = s.players.filter((p) => p.isBot && p.alive);
  const out: Action[] = [];

  if (s.phase === 'vote') {
    const voters = eligibleVoters(s);
    for (const b of bots) {
      if (!voters.includes(b.id) || s.votes[b.id]) continue;
      const target = botVote(s, b.id, rng);
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

  const play = s.phase === 'mission' ? s.mission?.play : undefined;
  if (play && !play.counted) {
    const m = s.mission!;
    const game = missionById(m.cardId).phone?.game;
    for (const b of bots) {
      if (!play.players.includes(b.id) || play.picks[b.id]) continue;
      const traitor = s.roles[b.id] === 'traitor';
      let picks: number[];
      if (game === 'sabotage') {
        // A bot Turncloak sabotages about half the time, less if a fellow Turncloak is on the crew.
        const partner = play.players.some((id) => id !== b.id && s.roles[id] === 'traitor');
        picks = [traitor && rng() < (partner ? 0.3 : 0.5) ? 1 : 0];
      } else {
        // Bots know most answers (or follow the crowd); Turncloak bots slip a little more often.
        const sure = traitor ? 0.55 : 0.75;
        picks = m.items.map((it) => {
          const choices = it.choices ?? [];
          const best = choices.indexOf(it.answer ?? '');
          return best >= 0 && rng() < sure ? best : Math.floor(rng() * choices.length);
        });
      }
      out.push({ type: 'missionPlay', playerId: b.id, picks });
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
  'Banish me and you lose a Truecloak. Then the Turncloaks laugh all the way to breakfast.',
  'Of course you suspect me. That is exactly what the Turncloaks want you to do.',
];

/** A bot sticking with the name it gave earlier. */
const STAND = [
  'I said it before and I will say it again: {t}. That is where my vote goes.',
  'Nothing I have heard changes my mind. I am voting {t}.',
  '{t}, you still have not answered me. My vote is yours.',
];

/** A bot won over by the table, saying so out loud before it votes the new way. */
const SWITCH = [
  'I have been listening. {s} is right and I was wrong. My vote goes to {t}.',
  'I named someone else earlier, but the table has convinced me. It is {t}.',
  'Fine. I am changing my vote. Everyone keeps coming back to {t}, and so will I.',
];

const fill = (tpl: string, t?: string, sp?: string) => tpl.replaceAll('{t}', t ?? 'someone').replaceAll('{s}', sp ?? 'them');

/**
 * One line of Round Table argument from a bot that has not spoken much yet.
 * Bots listen: they back whoever the table keeps naming, stand by their own
 * accusation, or say plainly that they have changed their mind. Whatever a bot
 * says last is how it votes (see botVote).
 */
function speak(s: GameState, ctx: Ctx): TalkLine | null {
  const today = talkToday(s);
  const bots = alive(s).filter((p) => p.isBot && today.filter((l) => l.from === p.id).length < MAX_LINES);
  if (!bots.length) return null;
  const bot = pickOf(bots, ctx.rng);
  const name = (id?: string) => playerById(s, id)?.name;
  const line = (text: string, target?: string): TalkLine => ({ from: bot.id, text, target, day: s.day, at: ctx.now });
  const mine = ownAccusation(s, bot.id);
  const spoke = today.some((l) => l.from === bot.id);

  // Defend once if someone has named this bot.
  const defended = today.some((l) => l.from === bot.id && !l.target);
  if (!defended && today.some((l) => l.target === bot.id) && ctx.rng() < 0.6) return line(pickOf(DEFEND, ctx.rng));

  const options = fairGame(s, bot.id, aliveIds(s));
  const h = heat(s);
  const leader = hottest(s, options, ctx.rng);
  const accuserOf = (id: string) => [...saidToday(s)].reverse().find((l) => l.target === id && l.from !== bot.id)?.from;

  if (mine && spoke) {
    // Won over when the table has clearly settled on someone else.
    if (leader && leader !== mine && (h[leader] ?? 0) >= (h[mine] ?? 0) + 2) {
      return line(fill(pickOf(SWITCH, ctx.rng), name(leader), name(accuserOf(leader))), leader);
    }
    return line(fill(pickOf(STAND, ctx.rng), name(mine)), mine);
  }

  // Back the table's main suspect, more readily the more often they have been named.
  if (leader && ctx.rng() < Math.min(0.8, 0.3 + 0.15 * (h[leader] ?? 0))) {
    return line(fill(pickOf(AGREE, ctx.rng), name(leader), name(accuserOf(leader))), leader);
  }
  const target = mine && options.includes(mine) ? mine : pickOf(options, ctx.rng);
  if (!target) return null;
  // Avoid repeating a line already heard today.
  const heard = new Set(today.map((l) => l.text.replaceAll(name(l.target) ?? '\u0000', '{t}')));
  const fresh = ACCUSE.filter((t) => !heard.has(t));
  return line(fill(pickOf(fresh.length ? fresh : ACCUSE, ctx.rng), name(target)), target);
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
 * and bots speak at the Round Table.
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

/**
 * Online games have no game loop of their own, so the host screen sends botTick
 * while this is true. Works on the TV's redacted view, and stays false when no
 * bot has anything left to do, so a quiet table makes no server calls.
 */
export function hostTickNeeded(view: GameState): boolean {
  const bots = view.players.filter((p) => p.isBot && p.alive);
  switch (view.phase) {
    case 'roundtable': {
      const today = talkToday(view);
      return bots.some((b) => today.filter((l) => l.from === b.id).length < MAX_LINES);
    }
    case 'vote': {
      if (view.timerEndsAt) return true;
      const voters = eligibleVoters(view);
      return bots.some((b) => voters.includes(b.id) && !view.votes[b.id]);
    }
    // The TV cannot see who has chosen at night, so keep ticking while there are bots.
    case 'night':
      return bots.length > 0;
    case 'endgameVote':
      return bots.some((b) => !view.endVotes[b.id]);
    case 'mission': {
      // Phone games: bots on the crew still owe their answers.
      const play = view.mission?.play;
      return !!play && !play.counted && play.players.some((id) => playerById(view, id)?.isBot && !play.picks[id]);
    }
    default:
      return false;
  }
}
