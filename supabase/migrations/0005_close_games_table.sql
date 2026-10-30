-- Phones now find a game with find_game(code). Nobody needs to read the table itself.
-- Applied after the web app that uses find_game was live.
drop policy "games are readable by signed in users" on public.games;
