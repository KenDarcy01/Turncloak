import { botTick } from './bots';
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
    doorsOpen: false,
    talk: [],
    phaseSince: 0,
    log: [],
    rev: 0,
  };
}

export function autoTraitorCount(players: number): number {
  if (players <= 6) return 1;
  if (players <= 11) return 2;
  return 3;
}

/** The most Turncloaks a table of this size can have: the Truecloaks always start with a clear majority. */
export function maxTraitors(players: number): number {
  return Math.max(1, Math.floor((players - 1) / 2));
}

export function traitorCountFor(state: GameState): number {
  const n = state.players.length;
  const wanted = state.settings.traitorCount || autoTraitorCount(n);
  return Math.min(wanted, maxTraitors(n));
}

/**
 * The endgame starts when this many players remain. Small tables wait until
 * three are left, so a game of five or six still has a murder before the end.
 */
export function finalCountFor(s: GameState): number {
  return s.players.length <= 6 ? Math.min(3, s.settings.finalCount) : s.settings.finalCount;
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

/** Anyone alive who is not a known Turncloak. Works on a Turncloak's redacted view as well as the full state. */
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

/** How much history to keep across games. */
const MISSION_HISTORY = 100;
const PROMPT_HISTORY = 600;

/** Order items so the never-used come first (in random order), then the least recently used. */
function freshestFirst<T>(items: T[], key: (x: T) => string, history: string[], rng: () => number): T[] {
  const age = (x: T) => history.lastIndexOf(key(x));
  return shuffle(items, rng).sort((a, b) => age(a) - age(b));
}

function nextMission(s: GameState, rng: () => number): string {
  const pack = MISSIONS.filter((m) => packOf(m) === (s.settings.missionPack ?? 'castle'));
  const pool = pack.filter((m) => !s.usedMissions.includes(m.id));
  if (pool.length) return pick(pool, rng).id;
  // Every card has been played: choose among the older half.
  const oldest = freshestFirst(pack, (m) => m.id, s.usedMissions, rng).slice(0, Math.ceil(pack.length / 2));
  return pick(oldest, rng).id;
}

function rememberPrompts(s: GameState): GameState {
  if (!s.mission?.items.length) return s;
  const texts = s.mission.items.map((it) => it.text);
  return { ...s, usedPrompts: [...(s.usedPrompts ?? []), ...texts].slice(-PROMPT_HISTORY) };
}

function log(s: GameState, text: string): GameState {
  return { ...s, log: [...s.log, { day: s.day, text }] };
}

function finish(s: GameState, winner: Team): GameState {
  return log(
    { ...s, phase: 'gameOver', winner, timerEndsAt: null },
    winner === 'faithful' ? 'The Truecloaks prevailed.' : 'The Turncloaks claimed the prize.',
  );
}

/** Draw this play's prompts and choose who does what. */
export function dealMission(s: GameState, cardId: string, rng: () => number): MissionState {
  const card = missionById(cardId);
  // Bots cannot run, swim or hum, so mission jobs go to real players when there are any.
  const humans = alive(s).filter((p) => !p.isBot).map((p) => p.id);
  const players = shuffle(humans.length ? humans : aliveIds(s), rng);
  const roleHolders = card.roles ? players.slice(0, card.roles.count ?? 1) : [];
  const set = card.prompts;
  const drawn = set ? freshestFirst(set.pool, (p) => p.text, s.usedPrompts ?? [], rng).slice(0, set.count) : [];
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
    usedMissions: [...s.usedMissions, cardId].slice(-MISSION_HISTORY),
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
  if (alive(s).length <= finalCountFor(s)) {
    return log({ ...s, phase: 'endgameVote', endVotes: {}, timerEndsAt: null }, 'The endgame begins.');
  }
  return then(s);
}

/** Resolve the Turncloaks' choice. Majority wins; ties and no-shows are settled at random. */
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
  const role = s.roles[id] === 'traitor' ? 'a Turncloak' : 'a Truecloak';
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
      return enterRoundtable(rememberPrompts(s));
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
  if (s.phase === 'gameOver' || s.players.length >= MAX_PLAYERS) return s;
  if (s.players.some((p) => p.id === id)) return s;
  // Once the game is running, people only get in while the host holds the doors open. Bots are the host's own call.
  const late = s.phase !== 'lobby';
  if (late && !isBot && !s.doorsOpen) return s;
  const player: Player = {
    id,
    name: name.trim().slice(0, 18) || 'Guest',
    color: PLAYER_COLORS[s.players.length % PLAYER_COLORS.length],
    isBot,
    alive: true,
  };
  const next = { ...s, players: [...s.players, player] };
  if (!late) return next;
  // Late arrivals are always Truecloaks: the Turncloaks were chosen when the doors first closed.
  return log({ ...next, roles: { ...s.roles, [id]: 'faithful' } }, `${player.name} arrived at the castle as a new Truecloak.`);
}

/** The host takes someone out of the game. */
function removePlayer(s: GameState, id: string, ctx: Ctx): GameState {
  const player = playerById(s, id);
  if (!player) return s;
  if (s.phase === 'lobby') return { ...s, players: s.players.filter((p) => p.id !== id) };
  if (!player.alive || s.phase === 'gameOver') return s;

  const players = s.players.map((p) => (p.id === id ? { ...p, alive: false, away: undefined, out: { by: 'left' as const, day: s.day } } : p));
  const without = <T,>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).filter(([k, v]) => k !== id && v !== id)) as Record<string, T>;
  const candidates = s.voteCandidates?.filter((c) => c !== id) ?? null;
  const role = s.roles[id] === 'traitor' ? 'a Turncloak' : 'a Truecloak';
  let next: GameState = log(
    {
      ...s,
      players,
      votes: without(s.votes),
      voteCandidates: candidates && candidates.length ? candidates : null,
      nightPicks: without(s.nightPicks),
      suspicions: without(s.suspicions),
      endVotes: without(s.endVotes),
    },
    `${player.name} left the castle, and was ${role}.`,
  );
  const winner = checkWinner(next);
  if (winner) return finish(next, winner);
  // Their vote may have been the last one outstanding.
  if (next.phase === 'vote' && eligibleVoters(next).every((v) => next.votes[v])) next = closeVoting(next, ctx);
  return next;
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
    case 'removePlayer':
      return removePlayer(s, a.targetId, ctx);
    case 'releaseSeat': {
      const p = playerById(s, a.targetId);
      if (!p || p.isBot || p.away) return s;
      return { ...s, players: s.players.map((x) => (x.id === a.targetId ? { ...x, away: true } : x)) };
    }
    case 'claimSeat': {
      if (!playerById(s, a.playerId)?.away) return s;
      return { ...s, players: s.players.map((x) => (x.id === a.playerId ? { ...x, away: undefined } : x)) };
    }
    case 'setDoors':
      return !!s.doorsOpen === a.open ? s : { ...s, doorsOpen: a.open };
    case 'updateSettings':
      if (s.phase !== 'lobby') return s;
      return { ...s, settings: { ...s.settings, ...a.settings } };
    case 'start': {
      if (s.phase !== 'lobby' || s.players.length < MIN_PLAYERS) return s;
      const roles = assignRoles(s, ctx);
      return log({ ...s, phase: 'roleReveal', roles, day: 1 }, 'The game begins. The Turncloaks have been chosen.');
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
      // Out of the game means out of the plotting too.
      if (s.roles[a.playerId] !== 'traitor' || !isAlive(s, a.playerId)) return s;
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
    case 'botTick':
      return botTick(s, ctx);
    case 'loadHistory': {
      if (s.phase !== 'lobby' || s.usedMissions.length || !Array.isArray(a.missions) || !Array.isArray(a.prompts)) return s;
      const strings = (xs: unknown[], n: number) => xs.filter((x): x is string => typeof x === 'string' && x.length < 300).slice(-n);
      return { ...s, usedMissions: strings(a.missions, MISSION_HISTORY), usedPrompts: strings(a.prompts, PROMPT_HISTORY) };
    }
    case 'restart': {
      const fresh = newGame(s.code);
      return {
        ...fresh,
        settings: s.settings,
        usedMissions: s.usedMissions,
        usedPrompts: s.usedPrompts,
        players: s.players.filter((p) => p.out?.by !== 'left').map((p) => ({ ...p, alive: true, out: undefined })),
      };
    }
  }
}

export function reduce(s: GameState, a: Action, ctx: Ctx): GameState {
  const next = reduceInner(s, a, ctx);
  if (next === s) return s;
  const phaseSince = next.phase !== s.phase || next.voteRound !== s.voteRound ? ctx.now : next.phaseSince;
  return { ...next, phaseSince, rev: s.rev + 1 };
}

export function endgameReady(s: GameState): boolean {
  return aliveIds(s).every((id) => s.endVotes[id]);
}

export function makeCode(rng: () => number = Math.random): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => letters[Math.floor(rng() * letters.length)]).join('');
}

export const ctxNow = (): Ctx => ({ rng: Math.random, now: Date.now() });
