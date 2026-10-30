-- Look up one game by its code, instead of letting every signed-in guest read
-- the whole games table (which listed every live code and freed seat).
create function public.find_game(p_code text)
returns table (id uuid, phase text, doors_open boolean, free_seats jsonb, is_host boolean)
language sql stable security definer set search_path = '' as $$
  select g.id, g.phase, g.doors_open, g.free_seats, g.host_user_id = (select auth.uid())
  from public.games g
  where g.code = upper(p_code);
$$;
revoke execute on function public.find_game(text) from public, anon;
grant execute on function public.find_game(text) to authenticated;

-- Tidy up every night: games idle for a week, and guest accounts that have not
-- signed in for a month and no longer sit at any game. Deleting a guest cascades
-- to anything left of theirs.
create extension if not exists pg_cron;

create function private.cleanup() returns void
language sql security definer set search_path = '' as $$
  delete from public.games where updated_at < now() - interval '7 days';
  delete from auth.users u
  where u.is_anonymous
    and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '30 days'
    and not exists (select 1 from public.games g where g.host_user_id = u.id)
    and not exists (select 1 from public.seats s where s.user_id = u.id);
$$;
revoke execute on function private.cleanup() from public, anon, authenticated;

select cron.schedule('turncloak-cleanup', '17 3 * * *', 'select private.cleanup()');

-- Leftovers from the first online version, replaced by seats and seat_views in 0003.
drop table public.game_views;
drop function private.is_at_table(uuid);
drop table public.game_players;
