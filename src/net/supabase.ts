import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { makeCode } from '../engine/game';
import type { Action, GameState } from '../engine/types';
import { TV } from '../engine/view';
import type { GameConnection } from './backend';

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

async function call(code: string, action: Action | { type: 'create' }) {
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

export async function joinGame(code: string, name: string): Promise<string> {
  const uid = await ensureUser();
  await call(code, { type: 'join', playerId: uid, name });
  return uid;
}

async function gameId(code: string): Promise<string | null> {
  const { data } = await sb().from('games').select('id').eq('code', code).maybeSingle();
  return data?.id ?? null;
}

/**
 * Connect a screen to a game. `asTv` is the host screen; otherwise the signed-in
 * user's own player view.
 */
export async function connectOnline(code: string, asTv: boolean): Promise<GameConnection & { missing: () => boolean }> {
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
      .from('game_views')
      .select('view')
      .eq('game_id', id)
      .eq('viewer_id', uid)
      .eq('is_tv', asTv)
      .maybeSingle();
    missing = !data;
    accept(data?.view as GameState | undefined);
  };

  const channel = id
    ? sb()
        .channel(`views:${id}:${uid}:${asTv ? 'tv' : 'p'}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_views', filter: `viewer_id=eq.${uid}` },
          (payload) => {
            const row = payload.new as { game_id?: string; is_tv?: boolean; view?: GameState };
            if (row.game_id === id && row.is_tv === asTv) accept(row.view);
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
    viewer: asTv ? TV : uid,
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
