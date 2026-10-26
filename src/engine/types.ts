export type Role = 'faithful' | 'traitor';
export type Team = Role;

export type Phase =
  | 'lobby'
  | 'roleReveal'
  | 'breakfast'
  | 'mission'
  | 'roundtable'
  | 'vote'
  | 'banishment'
  | 'night'
  | 'endgameVote'
  | 'gameOver';

export interface Player {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
  alive: boolean;
  /** How and on which day the player left the game. */
  out?: { by: 'banished' | 'murdered' | 'left'; day: number };
  /** The host freed this seat so the player can pick it up on another phone. */
  away?: boolean;
}

export interface Settings {
  /** 0 means "pick automatically from the player count". */
  traitorCount: number;
  /** The endgame starts when this many players (or fewer) remain. */
  finalCount: number;
  voteSeconds: number;
  discussionSeconds: number;
  /** Which set of missions to draw from. */
  missionPack: 'castle' | 'resort' | 'dinner';
}

export interface MissionItemState {
  text: string;
  answer?: string;
  /** For secret prompts: the only player who may see the text before it is revealed. */
  assignee?: string;
  revealed: boolean;
}

export interface MissionState {
  cardId: string;
  result: 'pending' | 'success' | 'partial' | 'fail';
  earned: number;
  /** Players chosen for the card's special job (witness, keyholder...). */
  roleHolders: string[];
  /** The prompts drawn for this play of the mission. */
  items: MissionItemState[];
  /** For memory missions: when the items stop being shown on the TV. */
  showUntil: number | null;
}

export interface BanishmentState {
  /** Order in which the votes are read out at the Round Table. */
  order: string[];
  /** Votes snapshot: voter -> target. */
  votes: Record<string, string>;
  revealed: number;
  step: 'votes' | 'tie' | 'verdict' | 'role';
  tied: string[];
  banishedId: string | null;
}

/** Something said out loud at the Round Table by a bot, shown on every screen. */
export interface TalkLine {
  from: string;
  text: string;
  /** Who the line accuses, if anyone. Bots tend to vote the way they talk. */
  target?: string;
  day: number;
  at: number;
}

export interface ChatMessage {
  from: string;
  text: string;
  at: number;
}

export interface GameState {
  code: string;
  phase: Phase;
  day: number;
  players: Player[];
  /** Secret. Never shown to a player except their own role (and fellow Turncloaks). */
  roles: Record<string, Role>;
  settings: Settings;
  pot: number;
  usedMissions: string[];
  mission: MissionState | null;

  /** Round Table votes for the current round: voter -> target. */
  votes: Record<string, string>;
  /** When set, only these players can be voted for (a revote after a tie). */
  voteCandidates: string[] | null;
  voteRound: number;
  banishment: BanishmentState | null;

  /** Secret: Turncloak -> murder target. */
  nightPicks: Record<string, string>;
  /** Secret: Turncloaks' private chat for the whole game. */
  traitorChat: ChatMessage[];
  /** Truecloak "decoy" task at night, so every phone looks busy: player -> suspect. */
  suspicions: Record<string, string>;
  /** Who was found murdered at the latest breakfast. */
  murdered: string | null;
  breakfastRevealed: boolean;

  endVotes: Record<string, 'end' | 'banish'>;
  winner: Team | null;

  /** The host is letting new players join a game that has already started. */
  doorsOpen?: boolean;

  /** Bot speeches at the Round Table, for the whole game. Public. */
  talk: TalkLine[];
  /** Epoch millis when the current phase began. Paces the bots. */
  phaseSince: number;

  /** Epoch millis when the current timer runs out, if any. */
  timerEndsAt: number | null;
  log: { day: number; text: string }[];
  /** Bumped on every change so clients can ignore stale updates. */
  rev: number;
}

export type Action =
  | { type: 'join'; playerId: string; name: string }
  | { type: 'leave'; playerId: string }
  | { type: 'addBot' }
  /** Host: take a player out. In the lobby they vanish; mid-game they leave and their role is shown. */
  | { type: 'removePlayer'; targetId: string }
  /** Host: free a seat so the player can carry on from a different phone. */
  | { type: 'releaseSeat'; targetId: string }
  /** A phone picks up a freed seat. */
  | { type: 'claimSeat'; playerId: string }
  /** Host: allow or stop new players joining a game in progress. */
  | { type: 'setDoors'; open: boolean }
  | { type: 'updateSettings'; settings: Partial<Settings> }
  | { type: 'start' }
  | { type: 'advance' }
  | { type: 'missionResult'; result: 'success' | 'partial' | 'fail' }
  /** Reveal one prompt on the TV (an answer, a secret tune), or all of them with index -1. */
  | { type: 'missionReveal'; index: number }
  /** Memory missions: show the items for the card's showSeconds. */
  | { type: 'missionShow' }
  | { type: 'startTimer'; seconds: number }
  | { type: 'clearTimer' }
  | { type: 'castVote'; playerId: string; targetId: string }
  | { type: 'closeVoting' }
  | { type: 'revealNext' }
  | { type: 'nightPick'; playerId: string; targetId: string }
  | { type: 'traitorChat'; playerId: string; text: string }
  | { type: 'suspect'; playerId: string; targetId: string }
  | { type: 'endVote'; playerId: string; choice: 'end' | 'banish' }
  | { type: 'restart' }
  /** Sent by the host screen every second or two: bots act, and an expired vote closes. */
  | { type: 'botTick' };

/** Actions that only the host screen may send. Everything else carries a playerId. */
export const HOST_ACTIONS: Action['type'][] = [
  'addBot',
  'removePlayer',
  'releaseSeat',
  'setDoors',
  'updateSettings',
  'start',
  'advance',
  'missionResult',
  'missionReveal',
  'missionShow',
  'startTimer',
  'clearTimer',
  'closeVoting',
  'revealNext',
  'restart',
  'botTick',
];
