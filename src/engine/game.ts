import { MISSIONS, missionById, packOf } from './missions';
import type { Action, BanishmentState, GameState, MissionState, Player, Role, Settings, Team } from './types';

export interface Ctx {
  rng: () => number;
  now: number;
}

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 22;

export const PLAYER_COLORS = [
  '#c0392b', '#d4a017', '#7d3c98', '#1f7a6d', '#2e5fa3', '#b9770e',
  '#a93246', '#5d6d7e', '#6c8e3c', '#c45a8a', '#3d8eb9', '#8e5b3c',
];

const BOT_NAMES = [
  'Ambrose', 'Beatrix', 'Cedric', 'Delphine', 'Edmund', 'Florence', 'Gideon', 'Harriet',
  'Ivo', 'Josephine', 'Kit', 'Lavinia', 'Magnus', 'Nell', 'Oswin', 'Perpetua',
];

export const DEFAULT_SETTINGS: Settings = {
  traitorCount: 0,
  finalCount: 4,
  voteSeconds: 60,
  discussionSeconds: 300,
  missionPack: 'resort',
};

export function newGame(code: string): GameState {
  return {
    code,
    phase: 'lobby',
    day: 1,
    players: [],
    roles: {},
    settings: { ...DEFAULT_SETTINGS },
    pot: 0,
    usedMissions: [],
    mission: null,
    votes: {},
    voteCandidates: null,
    voteRound: 1,
    banishment: null,
    nightPicks: {},
    traitorChat: [],
    suspicions: {},
    murdered: null,
    breakfastRevealed: false,
    endVotes: {},
    winner: null,
    timerEndsAt: null,
    log: [],
    rev: 0,
  };
}

export function autoTraitorCount(players: number): number {
  if (players <= 6) return 1;
  if (players <= 11) return 2;
  return 3;
}

export function traitorCountFor(state: GameState): number {
  const n = state.players.length;
  const wanted = state.settings.traitorCount || autoTraitorCount(n);
  // Always leave the Faithful a clear majority at the start.
  return Math.max(1, Math.min(wanted, Math.floor((n - 1) / 2)));
}

export const alive = (s: GameState) => s.players.filter((p) => p.alive);
export const aliveIds = (s: GameState) => alive(s).map((p) => p.id);
export const aliveTraitors = (s: GameState) => alive(s).filter((p) => s.roles[p.id] === 'traitor');
export const aliveFaithful = (s: GameState) => alive(s).filter((p) => s.roles[p.id] === 'faithful');
export const playerById = (s: GameState, id: string | null | undefined) =>
  s.players.find((p) => p.id === id);

/** Who may be voted for right now at the Round Table. */
export function voteTargets(s: GameState, voterId: string): string[] {
  const pool = s.voteCandidates ?? aliveIds(s);
  return pool.filter((id) => id !== voterId);
}

/** Who must vote in the current Round Table round. Tied players sit out a revote. */
export function eligibleVoters(s: GameState): string[] {
  const tied = s.voteCandidates ?? [];
  const ids = aliveIds(s);
  const voters = ids.filter((id) => !tied.includes(id));
  // If everyone alive is tied, everyone votes.
  return voters.length > 0 ? voters : ids;
}

/** Anyone alive who is not a known Traitor. Works on a Traitor's redacted view as well as the full state. */
export function murderTargets(s: GameState): string[] {
  return alive(s).filter((p) => s.roles[p.id] !== 'traitor').map((p) => p.id);
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function tally(votes: Record<string, string>): Record<string, number> {
  const t: Record<string, number> = {};
  for (const target of Object.values(votes)) t[target] = (t[target] ?? 0) + 1;
  return t;
}

function topOf(counts: Record<string, number>): string[] {
  const max = Math.max(0, ...Object.values(counts));
  return Object.keys(counts).filter((k) => counts[k] === max && max > 0);
}

/** Returns the winning team if the game is decided, otherwise null. */
export function checkWinner(s: GameState): Team | null {
  const t = aliveTraitors(s).length;
  const f = aliveFaithful(s).length;
  if (t === 0) return 'faithful';
  if (t >= f) return 'traitor';
  return null;
}

function nextMission(s: GameState, rng: () => number): string {
  const pack = MISSIONS.filter((m) => packOf(m) === (s.settings.missionPack ?? 'castle'));
  let pool = pack.filter((m) => !s.usedMissions.includes(m.id));
  if (pool.length === 0) pool = pack;
  return pick(pool, rng).id;
}

function log(s: GameState, text: string): GameState {
  return { ...s, log: [...s.log, { day: s.day, text }] };
}

function finish(s: GameState, winner: Team): GameState {
  return log(
    { ...s, phase: 'gameOver', winner, timerEndsAt: null },
    winner === 'faithful' ? 'The Faithful prevailed.' : 'The Traitors claimed the prize.',
  );
}

/** Draw this play's prompts and choose who does what. */
export function dealMission(s: GameState, cardId: string, rng: () => number): MissionState {
  const card = missionById(cardId);
  const players = shuffle(aliveIds(s), rng);
  const roleHolders = card.roles ? players.slice(0, card.roles.count ?? 1) : [];
  const set = card.prompts;
  const drawn = set ? shuffle(set.pool, rng).slice(0, set.count) : [];
  // Secret prompts go to the role holders if the card has a role, otherwise to different players in turn.
  const holders = roleHolders.length ? roleHolders : players;
  const items = drawn.map((item, i) => ({
    text: item.text,
    answer: item.answer,
    assignee: set?.kind === 'secret' && holders.length ? holders[i % holders.length] : undefined,
    revealed: set?.kind === 'public',
  }));
  return { cardId, result: 'pending', earned: 0, roleHolders, items, showUntil: null };
}

function enterMission(s: GameState, ctx: Ctx): GameState {
  const cardId = nextMission(s, ctx.rng);
  return {
    ...s,
    phase: 'mission',
    mission: dealMission(s, cardId, ctx.rng),
    usedMissions: [...s.usedMissions, cardId],
    timerEndsAt: null,
  };
}

function enterRoundtable(s: GameState): GameState {
  return {
    ...s,
    phase: 'roundtable',
    votes: {},
    voteCandidates: null,
    voteRound: 1,
    banishment: null,
    timerEndsAt: null,
  };
}

function enterNight(s: GameState): GameState {
  return { ...s, phase: 'night', nightPicks: {}, suspicions: {}, timerEndsAt: null };
}

/** After a banishment or a murder: decide whether the game ends, the endgame starts, or play continues. */
function afterLoss(s: GameState, then: (s: GameState) => GameState): GameState {
  const winner = checkWinner(s);
  if (winner) return finish(s, winner);
  if (alive(s).length <= s.settings.finalCount) {
    return log({ ...s, phase: 'endgameVote', endVotes: {}, timerEndsAt: null }, 'The endgame begins.');
  }
  return then(s);
}

/** Resolve the Traitors' choice. Majority wins; ties and no-shows are settled at random. */
export function resolveMurder(s: GameState, rng: () => number): string | null {
  const targets = murderTargets(s);
  if (targets.length === 0) return null;
  const valid: Record<string, string> = {};
  for (const [t, target] of Object.entries(s.nightPicks)) {
    if (s.roles[t] === 'traitor' && targets.includes(target)) valid[t] = target;
  }
  const top = topOf(tally(valid));
  return top.length > 0 ? pick(top, rng) : pick(targets, rng);
}

export function traitorsAgree(s: GameState): boolean {
  const traitors = aliveTraitors(s).map((p) => p.id);
  const picks = traitors.map((id) => s.nightPicks[id]);
  return picks.every((p) => p && p === picks[0]);
}

function closeVoting(s: GameState, ctx: Ctx): GameState {
  const voters = eligibleVoters(s);
  const votes: Record<string, string> = {};
  for (const v of voters) if (s.votes[v]) votes[v] = s.votes[v];
  const banishment: BanishmentState = {
    order: shuffle(Object.keys(votes), ctx.rng),
    votes,
    revealed: 0,
    step: 'votes',
    tied: [],
    banishedId: null,
  };
  return { ...s, phase: 'banishment', banishment, timerEndsAt: null };
}

/** Called when the last vote has been read out. */
function settleVotes(s: GameState, ctx: Ctx): GameState {
  const b = s.banishment!;
  let top = topOf(tally(b.votes));
  if (top.length === 0) top = s.voteCandidates ?? aliveIds(s); // nobody voted
  if (top.length > 1 && s.voteRound === 1) {
    return { ...s, banishment: { ...b, step: 'tie', tied: top } };
  }
  const banishedId = top.length === 1 ? top[0] : pick(top, ctx.rng);
  return { ...s, banishment: { ...b, step: 'verdict', tied: top.length > 1 ? top : [], banishedId } };
}

function revealBanished(s: GameState): GameState {
  const b = s.banishment!;
  const id = b.banishedId!;
  const players = s.players.map((p) =>
    p.id === id ? { ...p, alive: false, out: { by: 'banished' as const, day: s.day } } : p,
  );
  const name = playerById(s, id)?.name ?? 'Someone';
  const role = s.roles[id] === 'traitor' ? 'a Traitor' : 'Faithful';
  return log({ ...s, players, banishment: { ...b, step: 'role' } }, `${name} was banished, and was ${role}.`);
}

function murder(s: GameState, ctx: Ctx): GameState {
  const victim = resolveMurder(s, ctx.rng);
  const day = s.day + 1;
  if (!victim) return { ...s, day, phase: 'breakfast', murdered: null, breakfastRevealed: false };
  const players = s.players.map((p) =>
    p.id === victim ? { ...p, alive: false, out: { by: 'murdered' as const, day } } : p,
  );
  return {
    ...s,
    day,
    players,
    phase: 'breakfast',
    murdered: victim,
    breakfastRevealed: false,
    timerEndsAt: null,
    log: [...s.log, { day, text: `${playerById(s, victim)?.name} was murdered in the night.` }],
  };
}

function assignRoles(s: GameState, ctx: Ctx): Record<string, Role> {
  const count = traitorCountFor(s);
  const order = shuffle(s.players.map((p) => p.id), ctx.rng);
  const roles: Record<string, Role> = {};
  order.forEach((id, i) => (roles[id] = i < count ? 'traitor' : 'faithful'));
  return roles;
}

function advance(s: GameState, ctx: Ctx): GameState {
  switch (s.phase) {
    case 'roleReveal':
      return enterMission(s, ctx);
    case 'breakfast':
      if (!s.breakfastRevealed) return { ...s, breakfastRevealed: true };
      return afterLoss(s, (x) => enterMission(x, ctx));
    case 'mission':
      if (s.mission?.result === 'pending') return s;
      return enterRoundtable(s);
    case 'roundtable':
      return { ...s, phase: 'vote', votes: {}, timerEndsAt: ctx.now + s.settings.voteSeconds * 1000 };
    case 'vote':
      return closeVoting(s, ctx);
    case 'banishment': {
      const b = s.banishment!;
      if (b.step === 'votes') {
        if (b.revealed < b.order.length) return { ...s, banishment: { ...b, revealed: b.revealed + 1 } };
        return settleVotes(s, ctx);
      }
      if (b.step === 'tie') {
        return {
          ...s,
          phase: 'vote',
          votes: {},
          voteCandidates: b.tied,
          voteRound: 2,
          timerEndsAt: ctx.now + s.settings.voteSeconds * 1000,
        };
      }
      if (b.step === 'verdict') return revealBanished(s);
      return afterLoss(s, enterNight);
    }
    case 'night':
      return murder(s, ctx);
    case 'endgameVote': {
      const ids = aliveIds(s);
      const allEnd = ids.every((id) => s.endVotes[id] === 'end');
      if (allEnd) return finish(s, aliveTraitors(s).length > 0 ? 'traitor' : 'faithful');
      return log(enterRoundtable(s), 'The vote was not unanimous. Another banishment.');
    }
    default:
      return s;
  }
}

function botName(s: GameState): string {
  const used = new Set(s.players.map((p) => p.name));
  return BOT_NAMES.find((n) => !used.has(n)) ?? `Guest ${s.players.length + 1}`;
}

function addPlayer(s: GameState, id: string, name: string, isBot: boolean): GameState {
  if (s.phase !== 'lobby' || s.players.length >= MAX_PLAYERS) return s;
  if (s.players.some((p) => p.id === id)) return s;
  const player: Player = {
    id,
    name: name.trim().slice(0, 18) || 'Guest',
    color: PLAYER_COLORS[s.players.length % PLAYER_COLORS.length],
    isBot,
    alive: true,
  };
  return { ...s, players: [...s.players, player] };
}

function isAlive(s: GameState, id: string) {
  return !!playerById(s, id)?.alive;
}

function reduceInner(s: GameState, a: Action, ctx: Ctx): GameState {
  switch (a.type) {
    case 'join':
      return addPlayer(s, a.playerId, a.name, false);
    case 'addBot':
      return addPlayer(s, `bot-${s.players.length}-${Math.floor(ctx.rng() * 1e6)}`, botName(s), true);
    case 'leave':
      if (s.phase !== 'lobby') return s;
      return { ...s, players: s.players.filter((p) => p.id !== a.playerId) };
    case 'updateSettings':
      if (s.phase !== 'lobby') return s;
      return { ...s, settings: { ...s.settings, ...a.settings } };
    case 'start': {
      if (s.phase !== 'lobby' || s.players.length < MIN_PLAYERS) return s;
      const roles = assignRoles(s, ctx);
      return log({ ...s, phase: 'roleReveal', roles, day: 1 }, 'The game begins. The Traitors have been chosen.');
    }
    case 'advance':
      return advance(s, ctx);
    case 'missionResult': {
      if (s.phase !== 'mission' || !s.mission) return s;
      const card = MISSIONS.find((m) => m.id === s.mission!.cardId)!;
      const earned = a.result === 'success' ? card.reward : a.result === 'partial' ? Math.round(card.reward / 2) : 0;
      const prev = s.mission.earned;
      return { ...s, pot: s.pot - prev + earned, mission: { ...s.mission, result: a.result, earned } };
    }
    case 'missionReveal': {
      if (s.phase !== 'mission' || !s.mission) return s;
      const items = s.mission.items.map((it, i) => (a.index === -1 || a.index === i ? { ...it, revealed: true } : it));
      return { ...s, mission: { ...s.mission, items } };
    }
    case 'missionShow': {
      if (s.phase !== 'mission' || !s.mission) return s;
      const secs = missionById(s.mission.cardId).prompts?.showSeconds ?? 20;
      return { ...s, mission: { ...s.mission, showUntil: ctx.now + secs * 1000 } };
    }
    case 'startTimer':
      return { ...s, timerEndsAt: ctx.now + a.seconds * 1000 };
    case 'clearTimer':
      return { ...s, timerEndsAt: null };
    case 'castVote': {
      if (s.phase !== 'vote') return s;
      if (!eligibleVoters(s).includes(a.playerId) || s.votes[a.playerId]) return s; // votes are final
      if (!voteTargets(s, a.playerId).includes(a.targetId)) return s;
      const next = { ...s, votes: { ...s.votes, [a.playerId]: a.targetId } };
      // Close automatically once every eligible voter has voted.
      return eligibleVoters(next).every((id) => next.votes[id]) ? closeVoting(next, ctx) : next;
    }
    case 'closeVoting':
      return s.phase === 'vote' ? closeVoting(s, ctx) : s;
    case 'revealNext':
      return s.phase === 'banishment' ? advance(s, ctx) : s;
    case 'nightPick':
      if (s.phase !== 'night' || s.roles[a.playerId] !== 'traitor' || !isAlive(s, a.playerId)) return s;
      if (!murderTargets(s).includes(a.targetId)) return s;
      return { ...s, nightPicks: { ...s.nightPicks, [a.playerId]: a.targetId } };
    case 'traitorChat': {
      if (s.roles[a.playerId] !== 'traitor') return s;
      const text = a.text.trim().slice(0, 280);
      if (!text) return s;
      return { ...s, traitorChat: [...s.traitorChat, { from: a.playerId, text, at: ctx.now }] };
    }
    case 'suspect':
      if (s.phase !== 'night' || !isAlive(s, a.playerId) || a.targetId === a.playerId) return s;
      return { ...s, suspicions: { ...s.suspicions, [a.playerId]: a.targetId } };
    case 'endVote':
      if (s.phase !== 'endgameVote' || !isAlive(s, a.playerId) || s.endVotes[a.playerId]) return s;
      return { ...s, endVotes: { ...s.endVotes, [a.playerId]: a.choice } };
    case 'restart': {
      const fresh = newGame(s.code);
      return {
        ...fresh,
        settings: s.settings,
        players: s.players.map((p) => ({ ...p, alive: true, out: undefined })),
      };
    }
  }
}

export function reduce(s: GameState, a: Action, ctx: Ctx): GameState {
  const next = reduceInner(s, a, ctx);
  return next === s ? s : { ...next, rev: s.rev + 1 };
}

export function endgameReady(s: GameState): boolean {
  return aliveIds(s).every((id) => s.endVotes[id]);
}

export function makeCode(rng: () => number = Math.random): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => letters[Math.floor(rng() * letters.length)]).join('');
}

export const ctxNow = (): Ctx => ({ rng: Math.random, now: Date.now() });
