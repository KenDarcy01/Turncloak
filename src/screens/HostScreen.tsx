import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import {
  aliveIds,
  autoTraitorCount,
  eligibleVoters,
  endgameReady,
  maxTraitors,
  MIN_PLAYERS,
  playerById,
  tally,
  traitorCountFor,
} from '../engine/game';
import { hostTickNeeded } from '../engine/bots';
import { MISSION_PACKS, type MissionPack } from '../engine/missions';
import type { Action, GameState } from '../engine/types';
import { HIDDEN } from '../engine/view';
import type { GameConnection } from '../net/backend';
import { storage } from '../net/storage';
import { shareInvite, useKeepAwake } from '../native';
import { Avatar, Countdown, Gold, Logo, SendNotice, Seats, useView } from '../ui/components';
import { MissionBoard } from './MissionBoard';

interface Props {
  conn: GameConnection;
  joinUrl?: string;
  /** Hide the "add bot" and join instructions in places where they make no sense. */
  compact?: boolean;
  /** Online games have no local game loop, so the host screen sends the bot heartbeat. */
  online?: boolean;
}

/** The shared screen everyone in the room watches. Shows only public information. */
export function HostScreen({ conn, joinUrl, compact, online }: Props) {
  const view = useView(conn);
  const [panel, setPanel] = useState(false);
  useBotHeartbeat(online ? conn : null, view);
  useMissionHistory(compact ? null : conn, view);
  useKeepAwake();
  if (!view) return <div className="castle tv"><div className="tv-stage muted">Lighting the candles...</div></div>;
  const send = (a: Action) => conn.send(a);
  const night = view.phase === 'night';

  return (
    <div className={`castle tv ${night ? 'night-sky' : ''}`}>
      <div className="tv-top">
        <Logo />
        <div className="spacer" />
        {view.phase !== 'lobby' && (
          <>
            <div className="stat"><div className="k">Day</div><div className="v">{view.day}</div></div>
            <div className="stat"><div className="k">Remaining</div><div className="v">{aliveIds(view).length}</div></div>
            <div className="stat"><div className="k">Prize pot</div><div className="v">{view.pot.toLocaleString()}</div></div>
          </>
        )}
        {!compact && (
          <button className={`btn ${view.doorsOpen ? 'primary' : ''}`} onClick={() => setPanel(true)}>
            Players{view.doorsOpen ? ' · doors open' : ''}
          </button>
        )}
      </div>
      <Stage view={view} send={send} joinUrl={joinUrl} compact={compact} online={online} />
      {panel && <PlayersPanel view={view} send={send} joinUrl={joinUrl} online={online} onClose={() => setPanel(false)} />}
      <SendNotice />
    </div>
  );
}

const HISTORY_KEY = 'turncloak:history';

/**
 * Remember on this device which missions and prompts were played, and hand
 * them to each new game it hosts, so the same cards don't come round every game.
 */
function useMissionHistory(conn: GameConnection | null, view: GameState | null) {
  const loaded = useRef(false);
  const fresh = !!view && view.phase === 'lobby' && view.usedMissions.length === 0;
  useEffect(() => {
    if (!conn || !fresh || loaded.current) return;
    loaded.current = true;
    const h = storage.getJSON<{ missions?: string[]; prompts?: string[] }>(HISTORY_KEY);
    if (h?.missions?.length) conn.send({ type: 'loadHistory', missions: h.missions, prompts: h.prompts ?? [] });
  }, [conn, fresh]);
  const missions = view?.usedMissions;
  const prompts = view?.usedPrompts;
  useEffect(() => {
    if (conn && missions?.length) storage.setJSON(HISTORY_KEY, { missions, prompts: prompts ?? [] });
  }, [conn, missions, prompts]);
}

/** Ask the server to let the bots act every couple of seconds, and to close a vote whose time is up. */
function useBotHeartbeat(conn: GameConnection | null, view: GameState | null) {
  const needed = !!view && hostTickNeeded(view);
  useEffect(() => {
    if (!conn || !needed) return;
    const t = setInterval(() => conn.send({ type: 'botTick' }), 2000);
    return () => clearInterval(t);
  }, [conn, needed]);
}

function Controls({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="tv-controls">
      {hint && <div className="hint">{hint}</div>}
      {children}
    </div>
  );
}

function Stage({ view, send, joinUrl, compact, online }: { view: GameState; send: (a: Action) => void; joinUrl?: string; compact?: boolean; online?: boolean }) {
  const name = (id: string | null | undefined) => playerById(view, id)?.name ?? 'Nobody';
  const next = (label: string, primary = true) => (
    <button className={`btn ${primary ? 'primary' : ''}`} onClick={() => send({ type: 'advance' })}>{label}</button>
  );

  switch (view.phase) {
    case 'lobby': {
      const n = view.players.length;
      const table = Math.max(n, MIN_PLAYERS);
      const bots = view.players.filter((p) => p.isBot);
      const lastBot = bots[bots.length - 1];
      const announce = !!view.settings.announceTraitors;
      return (
        <>
          <div className="tv-stage">
            <div className="eyebrow">Join on your phone with code</div>
            <div className="join-code">{view.code}</div>
            {joinUrl && !compact && (online ? <JoinQr url={joinUrl} /> : <div className="muted">{joinUrl}</div>)}
            {joinUrl && !compact && <ShareButton code={view.code} url={joinUrl} />}
            <Seats view={view} />
            {n === 0 && <div className="tv-sub muted">Waiting for players to join...</div>}
          </div>
          <Controls hint={`${n} of at least ${MIN_PLAYERS} players`}>
            <div className="row lobby-setting">
              <span className="muted">Bots</span>
              <button className="btn small stepper" aria-label="Remove a bot" disabled={!lastBot} onClick={() => lastBot && send({ type: 'removePlayer', targetId: lastBot.id })}>−</button>
              <span className="count">{bots.length}</span>
              <button className="btn small stepper" aria-label="Add a bot" onClick={() => send({ type: 'addBot' })}>+</button>
            </div>
            <label className="row lobby-setting">
              <span className="muted">Turncloaks</span>
              <select
                className="field compact"
                value={view.settings.traitorCount}
                onChange={(e) => send({ type: 'updateSettings', settings: { traitorCount: Number(e.target.value) } })}
              >
                <option value={0}>{announce ? `Auto: ${autoTraitorCount(table)}${n >= MIN_PLAYERS ? ` for ${n} players` : ''}` : 'Auto'}</option>
                {[1, 2, 3].map((k) => (
                  <option key={k} value={k} disabled={k > maxTraitors(table)}>
                    {k}{k > maxTraitors(table) ? ` (needs ${2 * k + 1}+ players)` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="row lobby-setting">
              <span className="muted">How many</span>
              <select
                className="field compact"
                value={announce ? 'told' : 'secret'}
                onChange={(e) => send({ type: 'updateSettings', settings: { announceTraitors: e.target.value === 'told' } })}
              >
                <option value="secret">Kept secret</option>
                <option value="told">Told to everyone</option>
              </select>
            </label>
            <label className="row lobby-setting">
              <span className="muted">Missions</span>
              <select
                className="field compact"
                value={view.settings.missionPack}
                onChange={(e) => send({ type: 'updateSettings', settings: { missionPack: e.target.value as MissionPack } })}
              >
                {MISSION_PACKS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <button className="btn primary" disabled={n < MIN_PLAYERS} onClick={() => send({ type: 'start' })}>
              Begin the game
            </button>
            <p className="lobby-help muted">
              Bots fill empty seats. They vote, plot and argue, and play the phone games, but sit out the other missions.
              Turncloaks is how many players are secretly dealt the Turncloak role.
              {announce
                ? ' Auto picks 1 for up to 6 players, 2 for up to 11, then 3.'
                : ' Auto picks a fair number for the table. With the number kept secret, nobody can count their way to the answer.'}
              {announce && view.settings.traitorCount > maxTraitors(table) && ` With ${n} players only ${traitorCountFor(view)} can be dealt.`}
              {' '}Best with 5 or more: with 4, the endgame starts after the first banishment.
            </p>
          </Controls>
        </>
      );
    }

    case 'roleReveal':
      return (
        <>
          <div className="tv-stage">
            <div className="eyebrow">The doors close</div>
            <div className="tv-title slow-in">
              {view.settings.announceTraitors
                ? `Among you are ${traitorCountFor(view)} ${traitorCountFor(view) === 1 ? 'Turncloak' : 'Turncloaks'}`
                : 'Turncloaks walk among you. How many, nobody knows.'}
            </div>
            <div className="tv-sub">Look at your phone. Press and hold to learn your role. Tell no one.</div>
            <Seats view={view} />
          </div>
          <Controls hint="When everyone has seen their role">{next('Begin day one')}</Controls>
        </>
      );

    case 'breakfast': {
      const victim = playerById(view, view.murdered);
      return (
        <>
          <div className="tv-stage">
            <div className="eyebrow">Day {view.day} · Breakfast</div>
            {!view.breakfastRevealed ? (
              <>
                <div className="tv-title fade-in">Who did not make it to breakfast?</div>
                <div className="tv-sub">The Turncloaks struck in the night. Look around the table.</div>
              </>
            ) : victim ? (
              <>
                <Avatar player={victim} size="lg" />
                <div className="tv-title slow-in">{victim.name} was murdered</div>
                <div className="tv-sub">They were a Truecloak. They may stay to watch, but must not speak of the game.</div>
              </>
            ) : (
              <div className="tv-title slow-in">Everyone survived the night</div>
            )}
            <Seats view={view} />
          </div>
          <Controls>{view.breakfastRevealed ? next('To the mission') : next('Reveal the murder')}</Controls>
        </>
      );
    }

    case 'mission': {
      const m = view.mission!;
      const r = m.result;
      return (
        <>
          <div className="tv-stage mission-stage">
            <div className="eyebrow">Day {view.day} · Mission</div>
            <MissionBoard view={view} send={send} />
          </div>
          <Controls hint={m.play ? (m.play.counted ? 'The phones have been counted' : 'The phones are playing. The result counts itself.') : 'Record the result'}>
            {m.play ? null : <>
            <button className={`btn ${r === 'success' ? 'on' : ''}`} onClick={() => send({ type: 'missionResult', result: 'success' })}>Success</button>
            <button className={`btn ${r === 'partial' ? 'on' : ''}`} onClick={() => send({ type: 'missionResult', result: 'partial' })}>Half</button>
            <button className={`btn ${r === 'fail' ? 'on' : ''}`} onClick={() => send({ type: 'missionResult', result: 'fail' })}>Failed</button>
            </>}
            {r !== 'pending' && next('To the Round Table')}
          </Controls>
        </>
      );
    }

    case 'roundtable': {
      const endgame = !!view.endgame;
      return (
        <>
          <div className="tv-stage">
            <div className="eyebrow">Day {view.day} · The Round Table</div>
            <div className="tv-title fade-in">{endgame ? 'Another banishment' : 'Who do you suspect?'}</div>
            <div className="tv-sub">Speak your suspicions. Defend yourself. When the vote opens, each of you chooses one name on your phone.</div>
            <Countdown endsAt={view.timerEndsAt} />
            <TableTalk view={view} />
            <Seats view={view} />
          </div>
          <Controls>
            {view.timerEndsAt ? (
              <button className="btn" onClick={() => send({ type: 'clearTimer' })}>Stop timer</button>
            ) : (
              <button className="btn" onClick={() => send({ type: 'startTimer', seconds: view.settings.discussionSeconds })}>
                Start {Math.round(view.settings.discussionSeconds / 60)} minute debate
              </button>
            )}
            {next('Open the vote')}
          </Controls>
        </>
      );
    }

    case 'vote': {
      const voters = eligibleVoters(view);
      const done = voters.filter((v) => view.votes[v]).length;
      return (
        <>
          <div className="tv-stage">
            <div className="eyebrow">{view.voteRound > 1 ? 'Revote between the tied players' : 'The vote is open'}</div>
            <div className="tv-title">Cast your vote</div>
            {view.voteCandidates && (
              <div className="tv-sub">Choose between {view.voteCandidates.map(name).join(' and ')}.</div>
            )}
            <Countdown endsAt={view.timerEndsAt} />
            <div className="muted">{done} of {voters.length} votes cast</div>
            <Seats view={view} voted={(id) => !!view.votes[id]} />
          </div>
          <Controls hint="Votes lock automatically when everyone has voted">
            <button
              className="btn"
              onClick={() => {
                const missing = voters.length - done;
                if (missing > 0 && !window.confirm(`${missing} ${missing === 1 ? 'vote is' : 'votes are'} still out. Close voting anyway?`)) return;
                send({ type: 'closeVoting' });
              }}
            >
              Close voting now
            </button>
          </Controls>
        </>
      );
    }

    case 'banishment':
      return <Banishment view={view} send={send} name={name} />;

    case 'night': {
      return (
        <>
          <div className="tv-stage">
            <div className="eyebrow">Night {view.day}</div>
            <div className="tv-title slow-in">Night falls</div>
            <div className="tv-sub">Everyone, look at your phone and keep tapping. The Turncloaks are choosing their victim.</div>
            <div className="muted">{view.nightAgreed ? 'The Turncloaks have chosen.' : 'The Turncloaks are still choosing...'}</div>
          </div>
          <Controls hint={view.nightAgreed ? 'When everyone is ready' : 'Waiting for the Turncloaks to agree'}>
            <button
              className={`btn ${view.nightAgreed ? 'primary' : ''}`}
              onClick={() => {
                // Morning before they agree means a victim chosen at random.
                if (!view.nightAgreed && !window.confirm('The Turncloaks have not agreed yet. Bring the morning anyway? A victim will be chosen at random.')) return;
                send({ type: 'advance' });
              }}
            >
              Morning comes
            </button>
          </Controls>
        </>
      );
    }

    case 'endgameVote': {
      const ids = aliveIds(view);
      const ready = endgameReady(view);
      const voted = ids.filter((id) => view.endVotes[id]).length;
      return (
        <>
          <div className="tv-stage">
            <div className="eyebrow">The endgame · {ids.length} remain</div>
            <div className="tv-title fade-in">Are all the Turncloaks gone?</div>
            <div className="tv-sub">
              If every one of you votes to end the game, it ends. If a Turncloak is still among you, they take the whole pot.
            </div>
            {!ready ? (
              <div className="muted">{voted} of {ids.length} have decided</div>
            ) : (
              <div className="vote-board">
                {ids.map((id, i) => (
                  <div key={id} className="vote-line" style={{ animationDelay: `${i * 0.6}s` }}>
                    <span>{name(id)}</span>
                    <span className="arrow">votes to</span>
                    <span className={view.endVotes[id] === 'end' ? 'gold' : 'red'}>{view.endVotes[id] === 'end' ? 'End the game' : 'Banish again'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Controls>{ready && next(ids.every((id) => view.endVotes[id] === 'end') ? 'Reveal the truth' : 'Back to the Round Table')}</Controls>
        </>
      );
    }

    case 'gameOver': {
      const traitorsWon = view.winner === 'traitor';
      const winners = view.players.filter((p) => p.alive && view.roles[p.id] === (traitorsWon ? 'traitor' : 'faithful'));
      const share = winners.length ? Math.floor(view.pot / winners.length) : 0;
      const traitors = view.players.filter((p) => view.roles[p.id] === 'traitor');
      return (
        <>
          <div className="tv-stage">
            <div className="eyebrow">The game is over</div>
            <div className={`reveal-role ${traitorsWon ? 'traitor' : 'faithful'} display`}>
              {traitorsWon ? 'The Turncloaks win' : 'The Truecloaks win'}
            </div>
            <div className="tv-sub">
              {winners.length > 0 ? (
                <>
                  {winners.map((w) => w.name).join(', ')} {winners.length === 1 ? 'takes' : 'share'} <Gold amount={view.pot} />
                  {winners.length > 1 && <> ({share.toLocaleString()} each)</>}.
                </>
              ) : (
                'Nobody claims the pot.'
              )}
            </div>
            <div className="muted">The Turncloaks were {traitors.map((t) => t.name).join(' and ')}.</div>
            <Seats view={view} />
          </div>
          <Controls>
            <button className="btn primary" onClick={() => send({ type: 'restart' })}>Play again with the same players</button>
          </Controls>
        </>
      );
    }
  }
}

function Banishment({ view, send, name }: { view: GameState; send: (a: Action) => void; name: (id?: string | null) => string }) {
  const b = view.banishment!;
  const shown = b.order.slice(0, b.revealed);
  const counts = tally(Object.fromEntries(shown.map((v) => [v, b.votes[v]]).filter(([, t]) => t !== HIDDEN)));
  const max = Math.max(1, ...Object.values(counts));
  const banished = playerById(view, b.banishedId);
  const role = b.banishedId ? view.roles[b.banishedId] : undefined;

  if (b.step === 'role' && banished && view.endgame && !role) {
    return (
      <>
        <div className="tv-stage">
          <Avatar player={banished} size="lg" />
          <div className="tv-title slow-in">{banished.name} leaves the game</div>
          <div className="tv-sub">In the endgame, roles stay secret until the very end.</div>
        </div>
        <Controls>
          <button className="btn primary" onClick={() => send({ type: 'advance' })}>Continue</button>
        </Controls>
      </>
    );
  }

  if (b.step === 'role' && banished) {
    return (
      <>
        <div className="tv-stage">
          <Avatar player={banished} size="lg" />
          <div className="tv-sub">{banished.name}, please tell everyone who you really are.</div>
          <div className="eyebrow">I am</div>
          <div className={`reveal-role display ${role}`}>{role === 'traitor' ? 'A Turncloak' : 'A Truecloak'}</div>
        </div>
        <Controls>
          <button className="btn primary" onClick={() => send({ type: 'advance' })}>Continue</button>
        </Controls>
      </>
    );
  }

  return (
    <>
      <div className="tv-stage">
        <div className="eyebrow">The votes are in</div>
        {b.step === 'verdict' && banished ? (
          <>
            <Avatar player={banished} size="lg" />
            <div className="tv-title slow-in">{banished.name}, you have been banished</div>
            {b.tied.length > 1 && <div className="muted">Still tied after the revote, so fate decided.</div>}
          </>
        ) : b.step === 'tie' ? (
          <>
            <div className="tv-title fade-in">A tie</div>
            <div className="tv-sub">{b.tied.map(name).join(' and ')} must face a revote. They do not vote this time.</div>
          </>
        ) : (
          <div className="tv-title">{b.revealed === 0 ? 'Reveal your votes' : `${b.revealed} of ${b.order.length}`}</div>
        )}
        <div className="vote-board">
          {b.step === 'votes' && shown.slice(-1).map((v) => (
            <div key={v} className="vote-line">
              <span>{name(v)}</span>
              <span className="arrow">voted for</span>
              <span className="gold display">{name(b.votes[v])}</span>
            </div>
          ))}
          {Object.entries(counts)
            .sort((a, c) => c[1] - a[1])
            .map(([id, c]) => (
              <div key={id} className="tally">
                <span>{name(id)}</span>
                <div className="bar" style={{ width: `${(c / max) * 100}%` }} />
                <span className="gold">{c}</span>
              </div>
            ))}
        </div>
      </div>
      <Controls>
        {b.step === 'votes' && (
          <button className="btn primary" onClick={() => send({ type: 'revealNext' })}>
            {b.revealed < b.order.length ? 'Reveal next vote' : 'Count the votes'}
          </button>
        )}
        {b.step === 'tie' && <button className="btn primary" onClick={() => send({ type: 'advance' })}>Hold the revote</button>}
        {b.step === 'verdict' && (
          <button className="btn primary" onClick={() => send({ type: 'advance' })}>{view.endgame ? 'Continue' : 'Reveal their role'}</button>
        )}
      </Controls>
    </>
  );
}

/** The host's list of everyone at the table: add, remove, or move a player to a new phone. */
function PlayersPanel({
  view,
  send,
  joinUrl,
  online,
  onClose,
}: {
  view: GameState;
  send: (a: Action) => void;
  joinUrl?: string;
  online?: boolean;
  onClose: () => void;
}) {
  const lobby = view.phase === 'lobby';
  const over = view.phase === 'gameOver';
  const remove = (id: string, name: string) => {
    const msg = lobby
      ? `Remove ${name} from the table?`
      : view.endgame
        ? `Remove ${name} from the game? In the endgame their role stays secret until the end.`
        : `Remove ${name} from the game? They leave and everyone sees whether they were a Turncloak.`;
    if (window.confirm(msg)) send({ type: 'removePlayer', targetId: id });
  };
  const doorsShown = !lobby && !over;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel players-panel stack" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h3 style={{ margin: 0 }}>Players</h3>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>Done</button>
        </div>

        <div className="players-list">
          {view.players.map((p) => (
            <div key={p.id} className={`player-row ${p.alive ? '' : 'out'}`}>
              <Avatar player={p} />
              <div className="who">
                <div>{p.name}</div>
                <div className="muted small">
                  {p.isBot ? 'Bot' : 'Player'}
                  {p.away && p.alive ? ' · waiting to be picked up on a new phone' : ''}
                  {!p.alive && p.out ? ` · ${p.out.by}` : ''}
                </div>
              </div>
              {!over && (lobby || p.alive) && (
                <>
                  {!p.isBot && !lobby && !p.away && (
                    <button className="btn small" onClick={() => send({ type: 'releaseSeat', targetId: p.id })}>
                      Move to a new phone
                    </button>
                  )}
                  <button className="btn small danger" onClick={() => remove(p.id, p.name)}>Remove</button>
                </>
              )}
            </div>
          ))}
          {view.players.length === 0 && <div className="muted">Nobody has joined yet.</div>}
        </div>

        {view.players.some((p) => p.away && p.alive) && (
          <p className="muted small" style={{ margin: 0 }}>
            On the new phone, open the join link, enter code {view.code}, and tap "I am ...".
          </p>
        )}

        {!over && (
          <div className="row wrap">
            <button className="btn" onClick={() => send({ type: 'addBot' })}>Add a bot</button>
            {doorsShown && (
              <button className={`btn ${view.doorsOpen ? 'primary' : ''}`} onClick={() => send({ type: 'setDoors', open: !view.doorsOpen })}>
                {view.doorsOpen ? 'Close the doors' : 'Let new players join'}
              </button>
            )}
          </div>
        )}
        {doorsShown && (
          <p className="muted small" style={{ margin: 0 }}>
            New players and bots who arrive mid-game are always Truecloaks.
          </p>
        )}
        {doorsShown && view.doorsOpen && joinUrl && (
          <div className="stack center">
            <div className="eyebrow">Join with code</div>
            <div className="join-code">{view.code}</div>
            {online ? <JoinQr url={joinUrl} /> : <div className="muted">{joinUrl}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function JoinQr({ url }: { url: string }) {
  const src = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createDataURL(6, 2);
  }, [url]);
  return (
    <div className="join-qr">
      <img src={src} alt="QR code to join the game" width={180} height={180} />
      <div className="muted">Scan to join, or open<br /><span className="gold">{url}</span></div>
    </div>
  );
}

/**
 * Everything the bots have said at this Round Table, newest first. The list
 * scrolls, and stays on the newest line unless someone has scrolled down to
 * read back, in which case it holds their place as new lines arrive on top.
 */
export function TableTalk({ view, compact = false }: { view: GameState; compact?: boolean }) {
  const lines = view.talk.filter((l) => l.day === view.day && l.at >= view.phaseSince).reverse();
  const box = useRef<HTMLDivElement>(null);
  const reading = useRef(false);
  const height = useRef(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.scrollTop = reading.current ? el.scrollTop + el.scrollHeight - height.current : 0;
    height.current = el.scrollHeight;
  }, [lines.length]);
  if (!lines.length) return null;
  return (
    <div
      className={`table-talk${compact ? ' compact' : ''}`}
      ref={box}
      onScroll={(e) => {
        reading.current = e.currentTarget.scrollTop > 40;
      }}
    >
      {lines.map((l, i) => {
        const p = playerById(view, l.from);
        return p ? (
          <div className="talk-line" key={`${lines.length - i}-${l.from}-${l.at}`}>
            <Avatar player={p} />
            <div>
              <div className="who">{p.name}</div>
              <div className="said">“{l.text}”</div>
            </div>
          </div>
        ) : null;
      })}
    </div>
  );
}

/** Sends the invite through the phone's share sheet. Hidden where there is none. */
function ShareButton({ code, url }: { code: string; url: string }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <button className="btn small" onClick={async () => !(await shareInvite(code, url)) && setGone(true)}>
      Share the invite
    </button>
  );
}
