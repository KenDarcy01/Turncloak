-- Turncloak in the shared "Family Quiz" Supabase project.
--
-- The project also hosts other family apps (quiz, Oma Kitchen, gift tracker), so
-- every Turncloak table is prefixed turncloak_ and the edge function is called
-- turncloak-game-action. This one file replaces supabase/migrations-legacy/, which
-- built the original standalone project. The old game_players and game_views
-- tables (superseded by seats in 0003) are not carried over.
--
-- Design: clients never write game state directly. Every move goes through the
-- turncloak-game-action edge function, which loads the full state (service role
-- only), runs the shared TypeScript reducer, then writes one redacted view per
-- seat. Row level security makes sure each phone can only read its own views.
-- Players sign in with Supabase anonymous auth, so auth.uid() is the device id.

create table public.turncloak_games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{4}$'),
  host_user_id uuid not null references auth.users (id) on delete cascade,
  phase text not null default 'lobby',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Public facts a phone needs before it has a seat.
  doors_open boolean not null default false,
  free_seats jsonb not null default '[]'::jsonb
);

-- The full, secret game state. No client policy at all: only the edge function
-- (service role, which bypasses RLS) can read or write it.
create table public.turncloak_game_state (
  game_id uuid primary key references public.turncloak_games (id) on delete cascade,
  state jsonb not null,
  rev integer not null default 0
);

-- Which device (auth user) holds each seat. Only the edge function reads or writes it.
create table public.turncloak_seats (
  game_id uuid not null references public.turncloak_games (id) on delete cascade,
  player_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (game_id, player_id)
);
create index turncloak_seats_user on public.turncloak_seats (game_id, user_id);
create index turncloak_seats_user_id on public.turncloak_seats (user_id);

-- One redacted view per seat. seat is 'tv' for the host screen, otherwise the
-- player id; viewer_id is the device holding it.
create table public.turncloak_seat_views (
  game_id uuid not null references public.turncloak_games (id) on delete cascade,
  seat text not null,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  is_tv boolean not null default false,
  view jsonb not null,
  rev integer not null,
  primary key (game_id, seat)
);
create index turncloak_seat_views_viewer on public.turncloak_seat_views (viewer_id);
create index turncloak_games_host on public.turncloak_games (host_user_id);

alter table public.turncloak_games enable row level security;
alter table public.turncloak_game_state enable row level security;
alter table public.turncloak_seats enable row level security;
alter table public.turncloak_seat_views enable row level security;

-- Anyone signed in can look up a game by code to join it. Only public columns live here.
create policy "turncloak: games readable by signed in users"
  on public.turncloak_games for select to authenticated using (true);

-- The heart of the secrecy: a device can only ever read the views of seats it holds.
create policy "turncloak: each device reads only its own seats"
  on public.turncloak_seat_views for select to authenticated
  using (viewer_id = (select auth.uid()));

-- No anon/authenticated access to the state or seat tables beyond RLS (which has no policies).
revoke all on public.turncloak_game_state, public.turncloak_seats from anon;
revoke all on public.turncloak_games, public.turncloak_seat_views from anon;

-- Realtime respects RLS, so a subscription only ever delivers the subscriber's rows.
alter publication supabase_realtime add table public.turncloak_seat_views;
