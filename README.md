# Turncloak

A party game of loyalty and betrayal for 4 to 22 players. A host screen on the TV runs the game; everyone plays on their phone. Hidden Turncloaks murder by night, the Truecloaks try to banish them at the Round Table, and missions build a prize pot that the winners split.

"Turncloak" is a working name. The game is inspired by the reality show format but uses its own name, copy, missions and look.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests, including full bot-played games
npm run build:preview   # single-file build of the demo (dist-preview/)
```

- `#/demo` plays a whole game on one screen: you run the host screen and hold one phone, bots fill the other seats.
- `#/host/ABCD` opens a host screen; `#/join/ABCD` joins. Without Supabase settings (local mode) the host and players must be tabs in the same browser. With them, phones join from anywhere.

## How a game runs

1. **Lobby.** Players join with a four letter code. The host sets the number of bots with − and +, and the number of Turncloaks (auto: 1 for up to 6 players, 2 for up to 11, then 3; never more than leaves the Truecloaks a clear majority).
2. **Roles.** Each phone shows a press-and-hold role card. Turncloaks also see who the other Turncloaks are.
3. **Day.** Breakfast reveals who was murdered (from day 2), then a mission card for the room. The host records Success, Half or Failed, which adds gold to the pot.
4. **Round Table.** Optional debate timer, then a timed vote on phones. Votes are read out one by one on the TV. A tie triggers one revote among the tied players (who sit out); a second tie is settled at random. The banished player's role is revealed.
5. **Night.** Turncloaks pick a Truecloak to murder and can chat privately. Truecloak phones get a decoy task (a private suspicion diary) so every phone looks busy.
6. **Endgame.** When `finalCount` players remain (default 4, or 3 for tables of six or fewer so there is still a murder first), everyone votes to end the game or banish again. A unanimous "end" finishes the game: if any Turncloak is left, the Turncloaks take the whole pot, otherwise the Truecloaks split it.

The game also ends early if every Turncloak is banished, or if Turncloaks reach parity with the Truecloaks.

## Phone apps

The same build ships to the App Store and Google Play through Capacitor (`ios/`, `android/`, `capacitor.config.ts`), built in the cloud by GitHub Actions. Setup, secrets and store listing notes: [docs/app-stores.md](docs/app-stores.md).

## Code layout

```
src/engine/     Pure, framework-free game logic. Shared by the browser and the server.
  types.ts      State and actions
  game.ts       The reducer: reduce(state, action, { rng, now })
  view.ts       viewFor(state, viewer) - what each screen is allowed to see
  bots.ts       Bot players for demos and tests
  missions.ts   Mission deck
src/net/        Backends. The UI only talks to the GameConnection interface.
  authority.ts  Holds state, applies actions, runs bots and timers (local mode)
  backend.ts    Local host (in-tab and BroadcastChannel) and remote-tab connections
src/screens/    HostScreen (TV), PlayerScreen (phone), Demo
supabase/       Online backend draft: schema, RLS, edge function
```

## Secrecy

`viewFor()` is the single place that decides who knows what: the TV sees public information, a Truecloak sees only their own role, a Turncloak also sees fellow Turncloaks, the murder pick and the Turncloak chat. Votes stay hidden until read out, and a murder victim looks alive until the breakfast reveal.

## Online play (Supabase)

The hosted build (`npm run build`, published to GitHub Pages by `.github/workflows/pages.yml`) plays online through the Supabase project in `.env.production`. That project ("Family Quiz") is shared with other family apps, so every Turncloak table is prefixed `turncloak_` and the edge function is `turncloak-game-action`. The schema is `supabase/migrations/20261113000000_turncloak_shared_project.sql`; `supabase/migrations-legacy/` built the original standalone project and is kept for history.

- Everyone signs in as a guest (Supabase anonymous auth), so `auth.uid()` is the device id. The client stores its session under its own key (`turncloak-auth`) so it never shares a session with another app on the same site.
- `turncloak_game_state` holds the full secret state. RLS is on with no client policies, so only the edge function (service role) can touch it.
- `supabase/functions/turncloak-game-action` receives every move, checks it (host-only actions, players acting only for the seats they hold), runs the same reducer, then writes one redacted row per seat into `turncloak_seat_views`.
- RLS on `turncloak_seat_views` lets each device read only the seats it holds. Screens listen over Realtime and poll every few seconds as a fallback.
- "Reset my data" deletes the guest user. If the caller is a real account shared with another app, it deletes only that account's Turncloak rows.

To change the rules on the server: edit `src/engine`, run `npm run sync:engine`, then redeploy the function (`supabase functions deploy turncloak-game-action`).

## Ideas queued for later

Recruitment of a new Turncloak, ultimatum murders, shields won in missions, a dagger that doubles a vote, in-app mission mini-games, sound and music, remote play over video.
