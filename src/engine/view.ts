import { endgameReady } from './game';
import type { GameState, Role } from './types';

export const TV = 'tv';
export const HIDDEN = '?';

/**
 * What one screen is allowed to know. The host TV sees only public information;
 * a player additionally sees their own role and, if a Traitor, the Traitors' secrets.
 *
 * This is the single source of truth for secrecy. The Supabase backend writes the
 * output of this function into per-player rows guarded by row level security, so
 * a phone never receives data it should not have.
 */
export function viewFor(full: GameState, viewer: string): GameState {
  const s = hideUnrevealedMurder(full, viewer);
  const over = s.phase === 'gameOver';
  const viewerRole: Role | undefined = viewer === TV ? undefined : s.roles[viewer];
  const isTraitor = viewerRole === 'traitor';

  const roles: Record<string, Role> = {};
  for (const p of s.players) {
    const publiclyKnown = over || (!p.alive && p.out); // banished roles are revealed; murder victims are Faithful
    const banishedNotYetRevealed =
      s.phase === 'banishment' && s.banishment?.banishedId === p.id && s.banishment.step !== 'role';
    if (
      (publiclyKnown && !banishedNotYetRevealed) ||
      p.id === viewer ||
      (isTraitor && s.roles[p.id] === 'traitor')
    ) {
      if (s.roles[p.id]) roles[p.id] = s.roles[p.id];
    }
  }

  const votes: Record<string, string> = {};
  for (const [voter, target] of Object.entries(s.votes)) votes[voter] = voter === viewer || over ? target : HIDDEN;

  let banishment = s.banishment;
  if (banishment && !over) {
    const shown = banishment.order.slice(0, banishment.revealed);
    const bVotes: Record<string, string> = {};
    for (const v of banishment.order) bVotes[v] = shown.includes(v) || v === viewer ? banishment.votes[v] : HIDDEN;
    banishment = { ...banishment, votes: bVotes };
  }

  const endVotes: GameState['endVotes'] = {};
  const showEnd = over || endgameReady(s);
  for (const [id, c] of Object.entries(s.endVotes)) endVotes[id] = showEnd || id === viewer ? c : ('?' as 'end');

  return {
    ...s,
    roles,
    votes,
    banishment,
    endVotes,
    nightPicks: isTraitor || over ? s.nightPicks : {},
    traitorChat: isTraitor || over ? s.traitorChat : [],
    suspicions: over ? s.suspicions : viewer in s.suspicions ? { [viewer]: s.suspicions[viewer] } : {},
  };
}

/** Until the breakfast reveal, the victim still looks alive to everyone but the Traitors. */
function hideUnrevealedMurder(s: GameState, viewer: string): GameState {
  if (s.phase !== 'breakfast' || s.breakfastRevealed || !s.murdered) return s;
  if (s.roles[viewer] === 'traitor') return s;
  const victim = s.murdered;
  return {
    ...s,
    murdered: null,
    players: s.players.map((p) => (p.id === victim ? { ...p, alive: true, out: undefined } : p)),
    log: s.log.filter((l) => !(l.day === s.day && l.text.includes('murdered'))),
  };
}
