// Edge function: the only writer of game state in online mode.
//
// POST { code, action }  with the caller's Supabase auth token.
// 1. Load the full state for the game (service role, bypasses RLS).
// 2. Check the caller may send this action (host-only actions, own playerId).
// 3. Run the shared reducer from src/engine (copied into ./engine by
//    `npm run sync:engine` before deploy).
// 4. Write the new state, then upsert one redacted view per screen. RLS on
//    game_views means each phone can only ever read its own row.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { newGame, reduce } from './engine/game.ts';
import { HOST_ACTIONS, type Action, type GameState } from './engine/types.ts';
import { TV, viewFor } from './engine/view.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: auth } = await admin.auth.getUser(jwt);
  const uid = auth.user?.id;
  if (!uid) return json({ error: 'not signed in' }, 401);

  const { code, action } = (await req.json()) as { code: string; action: Action | { type: 'create' } };

  if (action.type === 'create') {
    const { data: game, error } = await admin.from('games').insert({ code, host_user_id: uid }).select().single();
    // 23505: the code is taken. The client picks another and retries.
    if (error) return json({ error: error.code === '23505' ? 'code taken' : error.message }, error.code === '23505' ? 409 : 400);
    const state = newGame(code);
    await admin.from('game_state').insert({ game_id: game.id, state, rev: 0 });
    await writeViews(admin, game.id, uid, state);
    return json({ ok: true });
  }

  const { data: game } = await admin.from('games').select('id, host_user_id').eq('code', code).single();
  if (!game) return json({ error: 'no such game' }, 404);
  const isHost = game.host_user_id === uid;

  if (HOST_ACTIONS.includes(action.type) ? !isHost : !('playerId' in action) || action.playerId !== uid) {
    return json({ error: 'not allowed' }, 403);
  }

  // Optimistic concurrency: retry if another action landed first.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row } = await admin.from('game_state').select('state, rev').eq('game_id', game.id).single();
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

    if (action.type === 'join') {
      await admin.from('game_players').upsert({ game_id: game.id, user_id: uid, name: action.name });
    }
    await admin.from('games').update({ phase: next.phase, updated_at: new Date().toISOString() }).eq('id', game.id);
    await writeViews(admin, game.id, game.host_user_id, next);
    return json({ ok: true, changed: true });
  }
  return json({ error: 'busy, try again' }, 409);
});

// deno-lint-ignore no-explicit-any
async function writeViews(admin: any, gameId: string, hostId: string, state: GameState) {
  const rows = [
    { game_id: gameId, viewer_id: hostId, is_tv: true, view: viewFor(state, TV), rev: state.rev },
    ...state.players
      .filter((p) => !p.isBot)
      .map((p) => ({ game_id: gameId, viewer_id: p.id, is_tv: false, view: viewFor(state, p.id), rev: state.rev })),
  ];
  await admin.from('game_views').upsert(rows);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
