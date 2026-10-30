// Edge function: the only writer of game state in online mode.
//
// POST { code, action }  with the caller's Supabase auth token.
// 1. Load the full state and the seat holders (service role, bypasses RLS).
// 2. Check the caller may send this action (host-only actions, own playerId).
// 3. Run the shared reducer from src/engine (copied into ./engine by
//    `npm run sync:engine` before deploy).
// 4. Write the new state, then upsert one redacted view per seat. RLS on
//    seat_views means each phone can only ever read the seats it holds.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { newGame, reduce, wellFormed } from './engine/game.ts';
import { HOST_ACTIONS, type Action, type GameState } from './engine/types.ts';
import { TV, viewFor } from './engine/view.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    return await handle(req);
  } catch (e) {
    // Malformed requests end here rather than as a bare 500.
    return json({ error: e instanceof Error ? e.message : 'bad request' }, 400);
  }
});

async function handle(req: Request): Promise<Response> {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const body = (await req.json().catch(() => null)) as { code?: unknown; action?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code : '';
  const action = body?.action as Action | { type: 'create' } | { type: 'deleteMe' } | undefined;
  if (!action || typeof action !== 'object') return json({ error: 'bad request' }, 400);

  // Who is calling, and which game, at the same time.
  const [{ data: auth }, { data: game }] = await Promise.all([
    admin.auth.getUser(jwt),
    action.type === 'create' || action.type === 'deleteMe'
      ? Promise.resolve({ data: null })
      : admin.from('games').select('id, host_user_id').eq('code', code).maybeSingle(),
  ]);
  const uid = auth.user?.id;
  if (!uid) return json({ error: 'not signed in' }, 401);

  // "Reset my data": deleting the guest user cascades to the games they hosted and the seats they held.
  if (action.type === 'deleteMe') {
    const { error } = await admin.auth.admin.deleteUser(uid);
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }

  if (action.type === 'create') {
    const { data: created, error } = await admin.from('games').insert({ code, host_user_id: uid }).select().single();
    // 23505: the code is taken. The client picks another and retries.
    if (error) return json({ error: error.code === '23505' ? 'code taken' : error.message }, error.code === '23505' ? 409 : 400);
    const state = newGame(code);
    await admin.from('game_state').insert({ game_id: created.id, state, rev: 0 });
    await writeViews(admin, created.id, uid, state, new Map(), false);
    return json({ ok: true });
  }

  if (!game) return json({ error: 'no such game' }, 404);
  if (!wellFormed(action)) return json({ error: 'bad action' }, 400);
  const isHost = game.host_user_id === uid;

  // Every seat's holder, read once: used to check the caller and to write the views.
  const [{ data: seatRows }, { data: row0 }] = await Promise.all([
    admin.from('seats').select('player_id, user_id').eq('game_id', game.id),
    admin.from('game_state').select('state, rev').eq('game_id', game.id).single(),
  ]);
  const holders = new Map<string, string>((seatRows ?? []).map((h: { player_id: string; user_id: string }) => [h.player_id, h.user_id]));

  // Who may send this? Host actions come from the host screen. Player actions
  // come from the device holding that seat. A new seat can be taken by anyone
  // (the reducer decides if the doors are open), and so can a freed seat.
  const seat = 'playerId' in action ? action.playerId : null;
  if (seat !== null && !/^[A-Za-z0-9-]{1,64}$/.test(seat)) return json({ error: 'bad player id' }, 400);
  let allowed = HOST_ACTIONS.includes(action.type) ? isHost : !!seat;
  if (allowed && seat && action.type !== 'claimSeat') {
    const holder = holders.get(seat);
    allowed = action.type === 'join' ? !holder || holder === uid : holder === uid;
  }
  if (!allowed) return json({ error: 'not allowed' }, 403);

  // Optimistic concurrency: retry if another action landed first.
  let row = row0;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      // Someone else moved first, perhaps taking a seat: read both again.
      const [{ data: again }, { data: fresh }] = await Promise.all([
        admin.from('seats').select('player_id, user_id').eq('game_id', game.id),
        admin.from('game_state').select('state, rev').eq('game_id', game.id).single(),
      ]);
      holders.clear();
      for (const h of again ?? []) holders.set(h.player_id, h.user_id);
      row = fresh;
    }
    const prev = row!.state as GameState;
    const next = reduce(prev, action, { rng: Math.random, now: Date.now() });
    if (next === prev) return json({ ok: true, changed: false });

    const { data: updated } = await admin
      .from('game_state')
      .update({ state: next, rev: next.rev })
      .eq('game_id', game.id)
      .eq('rev', row!.rev)
      .select('game_id');
    if (!updated?.length) continue;

    // Bring the seats up to date, then write everything else at once.
    const writes: PromiseLike<unknown>[] = [];
    if ((action.type === 'join' || action.type === 'claimSeat') && seat) {
      holders.set(seat, uid);
      writes.push(admin.from('seats').upsert({ game_id: game.id, player_id: seat, user_id: uid }));
    }
    const seated = next.players.filter((p) => !p.isBot).map((p) => p.id);
    const seatsGone = [...holders.keys()].some((id) => !seated.includes(id));
    if (seatsGone) {
      for (const id of [...holders.keys()]) if (!seated.includes(id)) holders.delete(id);
      const gone = admin.from('seats').delete().eq('game_id', game.id);
      writes.push(seated.length ? gone.not('player_id', 'in', list(seated)) : gone);
    }
    writes.push(
      admin
        .from('games')
        .update({
          phase: next.phase,
          doors_open: !!next.doorsOpen,
          free_seats: next.players.filter((p) => p.away && p.alive).map((p) => ({ id: p.id, name: p.name })),
          updated_at: new Date().toISOString(),
        })
        .eq('id', game.id),
    );
    writes.push(writeViews(admin, game.id, game.host_user_id, next, holders, seatsGone));
    await Promise.all(writes);
    return json({ ok: true, changed: true });
  }
  return json({ error: 'busy, try again' }, 409);
}

/** Filter value for PostgREST's `in` operator. */
const list = (ids: string[]) => `(${ids.map((id) => `"${id.replaceAll('"', '')}"`).join(',')})`;

// deno-lint-ignore no-explicit-any
async function writeViews(admin: any, gameId: string, hostId: string, state: GameState, holders: Map<string, string>, prune: boolean) {
  const rows = [
    { game_id: gameId, seat: 'tv', viewer_id: hostId, is_tv: true, view: viewFor(state, TV), rev: state.rev },
    ...state.players
      .filter((p) => !p.isBot && holders.has(p.id))
      .map((p) => ({ game_id: gameId, seat: p.id, viewer_id: holders.get(p.id), is_tv: false, view: viewFor(state, p.id), rev: state.rev })),
  ];
  await admin.from('seat_views').upsert(rows, { onConflict: 'game_id,seat' });
  // A seat that was removed from the lobby should stop showing the game.
  if (prune) await admin.from('seat_views').delete().eq('game_id', gameId).not('seat', 'in', list(rows.map((r) => r.seat)));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
