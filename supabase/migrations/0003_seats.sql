-- Seats: a player is no longer the same thing as a signed-in device.
-- One phone can hold several seats (pass-and-play), and a seat can move to a
-- new phone when the host frees it. These tables replace game_players and
-- game_views, which only allowed one player per device.

-- Which device (auth user) holds each seat. Only the edge function reads or writes it.
create table public.seats (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (game_id, player_id)
);
create index seats_user on public.seats (game_id, user_id);
alter table public.seats enable row level security;

-- One redacted view per seat. seat is 'tv' for the host screen, otherwise the
-- player id; viewer_id is the device holding it.
create table public.seat_views (
  game_id uuid not null references public.games (id) on delete cascade,
  seat text not null,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  is_tv boolean not null default false,
  view jsonb not null,
  rev integer not null,
  primary key (game_id, seat)
);
create index seat_views_viewer on public.seat_views (viewer_id);
alter table public.seat_views enable row level security;

-- The heart of the secrecy: a device can only ever read the views of seats it holds.
create policy "each device reads only its own seats"
  on public.seat_views for select to authenticated
  using (viewer_id = (select auth.uid()));

alter publication supabase_realtime add table public.seat_views;

-- Public facts a phone needs before it has a seat: can new players get in,
-- and which seats are waiting to be picked up on another phone.
alter table public.games add column doors_open boolean not null default false;
alter table public.games add column free_seats jsonb not null default '[]'::jsonb;
