import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { makeCode } from '../engine/game';
import type { Action, GameState } from '../engine/types';
import type { GameConnection } from './backend';
import type { SeatInfo, TableInfo } from './device';

/**
 * Online backend. Every move goes to the `game-action` edge function, which runs
 * the rules on the server and writes one private view per screen. Each screen
 * reads only its own view (row level security) and hears about changes over
 * Realtime, with a slow poll as a safety net for phones waking from sleep.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when this build talks to Supabase. The hosted preview and tests stay local. */
export const ONLINE = !!URL && !!KEY && import.meta.env.MODE !== 'singlefile' && import.meta.env.MODE !== 'test';

let client: SupabaseClient | null = null;
const sb = () => (client ??= createClient(URL!, KEY!));

/** Sign in as a guest once per browser. The guest's user id is their player id. */
export async function ensureUser(): Promise<string> {
  const { data } = await sb().auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signed, error } = await sb().auth.signInAnonymously();
  if (error || !signed.user) throw new Error(error?.message ?? 'Could not sign in');
  return signed.user.id;
}

async function call(code: string, action: Action | { type: 'create' } | { type: 'deleteMe' }) {
  const { data, error } = await sb().functions.invoke('game-action', { body: { code, action } });
  if (error) {
    // The function's own JSON error, when there is one, is more useful than the HTTP wrapper.
    let message = error.message;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch {
      /* keep the original message */
    }
    throw new Error(message);
  }
  return data as { ok: boolean; changed?: boolean };
}

/** Create a game with a fresh code, retrying if the code is taken. */
export async function hostGame(): Promise<string> {
  await ensureUser();
  for (let i = 0; i < 6; i++) {
    const code = makeCode();
    try {
      await call(code, { type: 'create' });
      return code;
    } catch (e) {
      if ((e as Error).message !== 'code taken') throw e;
    }
  }
  throw new Error('Could not find a free game code. Try again.');
}

async function gameId(code: string): Promise<string | null> {
  const { data } = await sb().from('games').select('id').eq('code', code).maybeSingle();
  return data?.id ?? null;
}

/** Public facts about a game, readable before this phone has a seat. Null if there is no such game. */
export async function tableInfo(code: string): Promise<TableInfo | null> {
  const uid = await ensureUser();
  const { data } = await sb().from('games').select('phase, doors_open, free_seats, host_user_id').eq('code', code).maybeSingle();
  if (!data) return null;
  return { phase: data.phase, doorsOpen: data.doors_open, freeSeats: data.free_seats ?? [], isHost: data.host_user_id === uid };
}

/** The seats this phone holds in a game, found on the server so they survive a refresh or a closed tab. */
export async function mySeats(code: string): Promise<SeatInfo[]> {
  const uid = await ensureUser();
  const id = await gameId(code);
  if (!id) return [];
  const { data } = await sb().from('seat_views').select('seat, view').eq('game_id', id).eq('viewer_id', uid).eq('is_tv', false);
  return (data ?? []).map((r) => ({
    id: r.seat as string,
    name: (r.view as GameState).players.find((p) => p.id === r.seat)?.name ?? 'Player',
  }));
}

/** Take a new seat. Throws if the game has started and the doors are shut. */
export async function joinSeat(code: string, playerId: string, name: string): Promise<void> {
  await ensureUser();
  const res = await call(code, { type: 'join', playerId, name });
  if (!res.changed) throw new Error('The game has started. Ask the host to let new players in.');
}

/** Pick up a seat the host freed for a new phone. */
export async function claimSeat(code: string, playerId: string): Promise<void> {
  await ensureUser();
  const res = await call(code, { type: 'claimSeat', playerId });
  if (!res.changed) throw new Error('Someone else has already picked up that seat.');
}

/**
 * Connect a screen to a game. `seat` is TV for the host screen, otherwise one of
 * the player seats this phone holds.
 */
export async function connectOnline(code: string, seat: string): Promise<GameConnection & { missing: () => boolean }> {
  const uid = await ensureUser();
  const id = await gameId(code);
  const listeners = new Set<(v: GameState) => void>();
  let last: GameState | null = null;
  let missing = !id;

  const accept = (view: GameState | null | undefined) => {
    if (!view || (last && view.rev < last.rev)) return;
    last = view;
    listeners.forEach((l) => l(view));
  };

  const refresh = async () => {
    if (!id) return;
    const { data } = await sb()
      .from('seat_views')
      .select('view')
      .eq('game_id', id)
      .eq('viewer_id', uid)
      .eq('seat', seat)
      .maybeSingle();
    missing = !data;
    accept(data?.view as GameState | undefined);
  };

  const channel = id
    ? sb()
        .channel(`views:${id}:${seat}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'seat_views', filter: `viewer_id=eq.${uid}` },
          (payload) => {
            const row = payload.new as { game_id?: string; seat?: string; view?: GameState };
            if (row.game_id === id && row.seat === seat) accept(row.view);
          },
        )
        .subscribe()
    : null;

  await refresh();
  const poll = setInterval(refresh, 4000);
  const onWake = () => document.visibilityState === 'visible' && refresh();
  document.addEventListener('visibilitychange', onWake);

  return {
    code,
    viewer: seat,
    missing: () => missing,
    subscribe(fn) {
      listeners.add(fn);
      if (last) fn(last);
      return () => listeners.delete(fn);
    },
    send(action) {
      call(code, action)
        .then(refresh)
        .catch((e) => console.warn('Move not accepted:', (e as Error).message));
    },
    close() {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onWake);
      if (channel) sb().removeChannel(channel);
    },
  };
}

/** Deletes this phone's guest user on the server (and with it every game it hosted and seat it held), then signs out. */
export async function deleteMe() {
  const { data } = await sb().auth.getSession();
  if (!data.session) return;
  await call('', { type: 'deleteMe' });
  await sb().auth.signOut({ scope: 'local' });
}
