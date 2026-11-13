-- Turncloak: online backend.
--
-- Design: clients never write game state directly. Every move goes through the
-- `game-action` edge function, which loads the full state (service role only),
-- runs the shared TypeScript reducer, then writes one redacted view per screen.
-- Row level security makes sure each phone can only read its own view, so a
-- Faithful player's device never receives Traitor-only data.
--
-- Players sign in with Supabase anonymous auth, so auth.uid() is their player id.

create table public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{4}$'),
  host_user_id uuid not null references auth.users (id) on delete cascade,
  phase text not null default 'lobby',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The full, secret game state. No client policy at all: only the edge function
-- (service role, which bypasses RLS) can read or write it.
create table public.game_state (
  game_id uuid primary key references public.games (id) on delete cascade,
  state jsonb not null,
  rev integer not null default 0
);

create table public.game_players (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 18),
  joined_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

-- One row per screen: viewer is a player's user id, or the host's user id for
-- the TV. `view` is the output of viewFor() in src/engine/view.ts.
create table public.game_views (
  game_id uuid not null references public.games (id) on delete cascade,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  is_tv boolean not null default false,
  view jsonb not null,
  rev integer not null,
  primary key (game_id, viewer_id, is_tv)
);

alter table public.games enable row level security;
alter table public.game_state enable row level security;
alter table public.game_players enable row level security;
alter table public.game_views enable row level security;

-- Anyone signed in can look up a game by code to join it. Only public columns live here.
create policy "games are readable by signed in users"
  on public.games for select to authenticated using (true);

-- Security definer so the policy below does not recurse into game_players' own RLS.
create function public.is_at_table(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.game_players where game_id = gid and user_id = auth.uid())
      or exists (select 1 from public.games where id = gid and host_user_id = auth.uid());
$$;
revoke execute on function public.is_at_table(uuid) from public, anon;
grant execute on function public.is_at_table(uuid) to authenticated;

-- Players can see who else is in their game.
create policy "players see their table"
  on public.game_players for select to authenticated
  using (public.is_at_table(game_id));

-- The heart of the secrecy: you can only ever read your own view.
create policy "each screen reads only its own view"
  on public.game_views for select to authenticated
  using (viewer_id = auth.uid());

-- Writes to game_players and game_views happen only in the edge function.

-- Realtime: phones subscribe to changes on their own game_views row.
-- Realtime respects RLS, so a subscription only ever delivers the subscriber's row.
alter publication supabase_realtime add table public.game_views;

create index game_views_viewer on public.game_views (viewer_id);
