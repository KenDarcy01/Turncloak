import { useEffect, useRef, useState, type ReactNode } from 'react';
import { alive, eligibleVoters, murderTargets, playerById, voteTargets } from '../engine/game';
import { missionById } from '../engine/missions';
import type { Action, GameState, Player } from '../engine/types';
import type { GameConnection } from '../net/backend';
import { buzz, useKeepAwake } from '../native';
import { Avatar, Countdown, Logo, PlayerChoice, RoleCard, SendNotice, useView } from '../ui/components';
import { TableTalk } from './HostScreen';

/** A player's phone. Everything here is private to that player. */
export function PlayerScreen({ conn, top }: { conn: GameConnection; top?: ReactNode }) {
  const view = useView(conn);
  const me = view ? playerById(view, conn.viewer) : undefined;
  useKeepAwake();
  useBuzz(view, conn.viewer);

  if (!view) {
    return (
      <Shell>
        <p className="lead center">Looking for the castle...</p>
        <p className="muted center">Make sure the host screen is open.</p>
      </Shell>
    );
  }
  if (!me) {
    return (
      <Shell>
        <p className="lead center">{view.phase === 'lobby' ? 'Taking your seat...' : 'You are no longer at this table.'}</p>
      </Shell>
    );
  }

  const send = (a: Action) => conn.send(a);
  const role = view.roles[me.id];
  const fellows = view.players.filter((p) => p.id !== me.id && view.roles[p.id] === 'traitor');

  return (
    <Shell me={me} pot={view.phase === 'lobby' ? undefined : view.pot}>
      {top}
      <div className="phone-main">
        <Body view={view} me={me} send={send} />
      </div>
      {role && me.alive && view.phase !== 'gameOver' && <RoleCard role={role} fellows={fellows} />}
    </Shell>
  );
}

/** True when this player owes a move right now, so a shared phone can say whose turn it is. */
export function needsAction(view: GameState | undefined, id: string): boolean {
  const me = view && playerById(view, id);
  if (!view || !me?.alive) return false;
  if (view.phase === 'vote') return eligibleVoters(view).includes(id) && !view.votes[id];
  if (view.phase === 'night') return view.roles[id] === 'traitor' ? !view.nightPicks[id] : !view.suspicions[id];
  if (view.phase === 'endgameVote') return !view.endVotes[id];
  const play = view.phase === 'mission' ? view.mission?.play : undefined;
  if (play) return !play.counted && play.players.includes(id) && !play.picks[id];
  return false;
}

/** Buzzes the phone when something happens to this player: roles dealt, their turn, out of the game, game over. */
function useBuzz(view: GameState | null, id: string) {
  const phase = view?.phase;
  const alive = view ? playerById(view, id)?.alive : undefined;
  const turn = needsAction(view ?? undefined, id);
  const won = !!view?.winner && view.roles[id] === view.winner;
  const prev = useRef<{ phase?: string; alive?: boolean; turn?: boolean }>({});
  useEffect(() => {
    const p = prev.current;
    prev.current = { phase, alive, turn };
    // The first view is where this phone came in, not something that just happened.
    if (p.phase === undefined) return;
    if (phase === 'gameOver' && p.phase !== phase) buzz(won ? 'win' : 'lose');
    else if (phase === 'roleReveal' && p.phase !== phase) buzz('thud');
    else if (p.alive && alive === false) buzz('lose');
    else if (turn && !p.turn) buzz('turn');
  }, [phase, alive, turn, won]);
}

function Shell({ children, me, pot }: { children: ReactNode; me?: Player; pot?: number }) {
  return (
    <div className="castle phone">
      <div className="phone-top">
        {me && <Avatar player={me} />}
        <div>
          <Logo />
          {me && <div className="muted" style={{ fontSize: '0.95rem' }}>{me.name}</div>}
        </div>
        <div className="spacer" />
        {pot !== undefined && <div className="stat"><div className="k">Pot</div><div className="v" style={{ fontSize: '1.1rem' }}>{pot.toLocaleString()}</div></div>}
      </div>
      {children}
      <SendNotice />
    </div>
  );
}

function Body({ view, me, send }: { view: GameState; me: Player; send: (a: Action) => void }) {
  const traitor = view.roles[me.id] === 'traitor';

  if (!me.alive && view.phase !== 'gameOver') {
    return (
      <div className="stack center fade-in">
        <div className="eyebrow">You are out</div>
        <h2>{me.out?.by === 'murdered' ? 'You were murdered in the night' : me.out?.by === 'left' ? 'You have left the castle' : 'You were banished'}</h2>
        <p className="lead">Stay and watch, but keep what you know to yourself.</p>
      </div>
    );
  }

  switch (view.phase) {
    case 'lobby':
      return (
        <div className="stack center">
          <div className="eyebrow">You have arrived</div>
          <h2>Welcome to the castle, {me.name}</h2>
          <p className="lead">Watch the big screen. The host will begin when everyone is seated.</p>
          <p className="muted">{view.players.length} guests so far.</p>
        </div>
      );

    case 'roleReveal':
      return (
        <div className="stack center">
          <div className="eyebrow">Your fate is sealed</div>
          <h2>Learn your role</h2>
          <p className="lead">Hide your screen, then press and hold the card below.</p>
        </div>
      );

    case 'breakfast':
      return <Wait eyebrow={`Day ${view.day} · Breakfast`} title="Watch the big screen" lead="Who survived the night?" />;

    case 'mission':
      return view.mission?.play
        ? <PhoneGame key={me.id} view={view} me={me} send={send} />
        : <MissionPhone view={view} me={me} />;

    case 'roundtable':
      return (
        <Wait
          eyebrow="The Round Table"
          title="Make your case"
          lead="Who has been acting strangely? Say it out loud."

        >
          <Countdown endsAt={view.timerEndsAt} />
          <TableTalk view={view} compact />
        </Wait>
      );

    case 'vote':
      return <Vote view={view} me={me} send={send} />;

    case 'banishment': {
      const b = view.banishment!;
      const mine = b.votes[me.id];
      return (
        <div className="stack center">
          <div className="eyebrow">The votes are read</div>
          <h2>{b.banishedId === me.id && b.step === 'verdict' ? 'You have been banished' : 'Watch the big screen'}</h2>
          {b.banishedId === me.id && b.step === 'verdict' ? (
            <p className="lead">{view.endgame ? 'Your role stays secret until the end. Keep it to yourself.' : 'Stand, and tell everyone who you really are.'}</p>
          ) : (
            mine && <p className="muted">You voted for {playerById(view, mine)?.name}.</p>
          )}
        </div>
      );
    }

    case 'night':
      return <Night key={me.id} view={view} me={me} traitor={traitor} send={send} />;

    case 'endgameVote':
      return <EndVote view={view} me={me} send={send} />;

    case 'gameOver': {
      const won = view.roles[me.id] === view.winner;
      return (
        <div className="stack center fade-in">
          <div className="eyebrow">{view.winner === 'traitor' ? 'The Turncloaks win' : 'The Truecloaks win'}</div>
          <h2 className={won ? 'gold' : 'red'}>{won ? (me.alive ? 'Victory is yours' : 'Your side won') : 'You were outplayed'}</h2>
          <p className="lead">You were {view.roles[me.id] === 'traitor' ? 'a Turncloak' : 'a Truecloak'}.</p>
        </div>
      );
    }
  }
}

function Wait({ eyebrow, title, lead, children }: { eyebrow: string; title: string; lead: string; children?: ReactNode }) {
  return (
    <div className="stack center">
      <div className="eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
      <p className="lead">{lead}</p>
      {children}
    </div>
  );
}

function Vote({ view, me, send }: { view: GameState; me: Player; send: (a: Action) => void }) {
  const [choice, setChoice] = useState<string>();
  const cast = view.votes[me.id];
  if (!eligibleVoters(view).includes(me.id)) {
    return <Wait eyebrow="Revote" title="You are on trial" lead="You do not vote this round. The others are deciding your fate." />;
  }
  if (cast) {
    return (
      <Wait eyebrow="Vote cast" title={`You voted for ${playerById(view, cast)?.name}`} lead="Your vote is locked. Wait for the reveal.">
        <Countdown endsAt={view.timerEndsAt} />
      </Wait>
    );
  }
  const targets = voteTargets(view, me.id).map((id) => playerById(view, id)!);
  return (
    <div className="stack">
      <div className="row">
        <div>
          <div className="eyebrow">The vote</div>
          <h2>Who should be banished?</h2>
        </div>
        <div className="spacer" />
        <Countdown endsAt={view.timerEndsAt} />
      </div>
      <PlayerChoice players={targets} selected={choice} onPick={setChoice} />
      <button className="btn primary block" disabled={!choice} onClick={() => { if (!choice) return; buzz('tap'); send({ type: 'castVote', playerId: me.id, targetId: choice }); }}>
        {choice ? `Lock in ${playerById(view, choice)?.name}` : 'Choose a name'}
      </button>
    </div>
  );
}

/**
 * Night on every phone. Turncloaks choose a victim and whisper; Truecloaks keep a
 * diary. Both screens share one layout and colour, so a glance across the table
 * at night gives nothing away. Only the small print differs.
 */
function Night({ view, me, traitor, send }: { view: GameState; me: Player; traitor: boolean; send: (a: Action) => void }) {
  const [text, setText] = useState('');
  // A Truecloak's diary stays on this phone. It exists so their screen looks like a Turncloak's.
  const [diary, setDiary] = useState<{ from: string; text: string }[]>([]);
  const traitors = alive(view).filter((p) => view.roles[p.id] === 'traitor');
  const others = traitors.filter((t) => t.id !== me.id);
  const players = traitor ? murderTargets(view).map((id) => playerById(view, id)!) : alive(view).filter((p) => p.id !== me.id);
  const selected = traitor ? view.nightPicks[me.id] : view.suspicions[me.id];
  const pickersFor = (id: string) => traitors.filter((t) => view.nightPicks[t.id] === id).map((t) => (t.id === me.id ? 'you' : t.name));
  const agreed = traitors.length > 0 && traitors.every((t) => view.nightPicks[t.id] && view.nightPicks[t.id] === view.nightPicks[traitors[0].id]);
  const messages = traitor ? view.traitorChat.slice(-30) : diary;
  const say = () => {
    const t = text.trim();
    if (!t) return;
    if (traitor) send({ type: 'traitorChat', playerId: me.id, text: t });
    else setDiary((d) => [...d, { from: me.id, text: t }].slice(-30));
    setText('');
  };
  const pick = (id: string) =>
    send(traitor ? { type: 'nightPick', playerId: me.id, targetId: id } : { type: 'suspect', playerId: me.id, targetId: id });

  return (
    <div className="stack">
      <div className="eyebrow">Night {view.day}</div>
      <h2>Choose a name</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {traitor
          ? `${others.length ? `With ${others.map((t) => t.name).join(', ')}. You must all agree. ` : ''}Choose who will not wake up.`
          : 'Write in your secret diary: who do you suspect most?'}
      </p>
      <PlayerChoice players={players} selected={selected} onPick={pick} meta={traitor ? (p) => pickersFor(p.id).join(', ') : undefined} />
      <p className="muted center small" style={{ margin: 0 }}>
        {traitor ? (agreed ? 'The choice is made.' : 'Not chosen yet.') : selected ? 'Saved in your diary.' : 'Not chosen yet.'}
      </p>
      <div className="panel stack" style={{ padding: 14 }}>
        <div className="eyebrow">Notes</div>
        <div className="chat">
          {messages.map((m, i) => (
            <div className="msg" key={i}><b>{m.from === me.id ? 'You' : playerById(view, m.from)?.name}</b>{m.text}</div>
          ))}
          {messages.length === 0 && <div className="muted">Nothing written yet.</div>}
        </div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input className="field" value={text} placeholder="Write quietly..." onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && say()} />
          <button className="btn small" onClick={say}>Send</button>
        </div>
      </div>
      <p className="muted center small" style={{ margin: 0 }}>Keep tapping and writing, so nobody can tell who is plotting.</p>
    </div>
  );
}

function EndVote({ view, me, send }: { view: GameState; me: Player; send: (a: Action) => void }) {
  const mine = view.endVotes[me.id];
  return (
    <div className="stack">
      <div className="eyebrow">The endgame</div>
      <h2>Are all the Turncloaks gone?</h2>
      <p className="lead">If everyone votes to end, the game ends now. If you are wrong, the Turncloaks take everything.</p>
      <button className={`btn block ${mine === 'end' ? 'primary' : ''}`} disabled={!!mine} onClick={() => send({ type: 'endVote', playerId: me.id, choice: 'end' })}>
        End the game
      </button>
      <button className={`btn block ${mine === 'banish' ? 'primary' : ''}`} disabled={!!mine} onClick={() => send({ type: 'endVote', playerId: me.id, choice: 'banish' })}>
        Banish again
      </button>
      {mine && <p className="muted center">Your choice is locked.</p>}
    </div>
  );
}

/** Your part in the mission, including any secret prompt only you can see. */
function MissionPhone({ view, me }: { view: GameState; me: Player }) {
  const m = view.mission!;
  const card = missionById(m.cardId);
  const mine = m.items.map((it, i) => ({ ...it, i })).filter((it) => it.assignee === me.id && it.text);
  const myRole = card.roles && m.roleHolders.includes(me.id) ? card.roles : null;
  const rounds = (card.prompts?.count ?? 0) > 1;
  return (
    <div className="stack">
      <div className="eyebrow">Day {view.day} · Mission</div>
      <h2>{card.title}</h2>
      {myRole && (
        <div className="banner">
          <div className="eyebrow">You are the {myRole.name.toLowerCase()}</div>
          <div>{myRole.duty}</div>
        </div>
      )}
      {mine.map((it) => (
        <div className="secret-card" key={it.i}>
          <div className="eyebrow">
            Only you can see this{rounds ? ` · your turn is number ${it.i + 1}` : ''}
          </div>
          <div className="prompt-text">{it.text}</div>
          <div className="muted">Keep it to yourself until it is your turn.</div>
        </div>
      ))}
      {!myRole && mine.length === 0 && <p className="lead">Follow the instructions on the big screen.</p>}
      <p className="muted">Every success adds gold to the pot. Watch for anyone who seems to be holding the team back.</p>
    </div>
  );
}

/** A mission played on the phone: guard or sabotage, or answer the questions. */
function PhoneGame({ view, me, send }: { view: GameState; me: Player; send: (a: Action) => void }) {
  const m = view.mission!;
  const play = m.play!;
  const card = missionById(m.cardId);
  const sabotage = card.phone?.game === 'sabotage';
  const [choices, setChoices] = useState<(number | undefined)[]>([]);
  const sent = play.picks[me.id];
  const playing = play.players.includes(me.id) && me.alive;
  const submit = (picks: number[]) => { buzz('tap'); send({ type: 'missionPlay', playerId: me.id, picks }); };

  const head = (
    <>
      <div className="eyebrow">Day {view.day} · Mission</div>
      <h2>{card.title}</h2>
    </>
  );
  if (play.counted) {
    return (
      <div className="stack">
        {head}
        <p className="lead">{sabotage ? 'The votes are counted. Watch the big screen.' : 'Answers are in. Watch the big screen.'}</p>
      </div>
    );
  }
  if (!playing) {
    return (
      <div className="stack">
        {head}
        <p className="lead">You are not on the crew this time. Watch their faces.</p>
      </div>
    );
  }
  if (sent) {
    return (
      <div className="stack">
        {head}
        <p className="lead">{sabotage ? 'Your choice is locked. Put your phone face down.' : 'Your answers are locked.'}</p>
        <p className="muted">Waiting for the others.</p>
      </div>
    );
  }

  if (sabotage) {
    return (
      <div className="stack">
        {head}
        <p className="lead">Shield your screen and choose.</p>
        <button className="btn block" onClick={() => submit([0])}>Guard</button>
        {/* Both buttons work for everyone, so the screen looks the same whoever holds it. A Truecloak's sabotage counts as a guard. */}
        <button className="btn primary block" onClick={() => submit([1])}>Sabotage</button>
        <p className="muted">
          Only a Turncloak&rsquo;s sabotage counts. One halves the gold; two lose it all. The TV shows how many, never who.
        </p>
      </div>
    );
  }

  const ready = m.items.every((_, i) => choices[i] !== undefined);
  return (
    <div className="stack">
      {head}
      <p className="muted">
        {card.phone?.game === 'consensus' ? 'Pick what you think most of the table will pick.' : 'Answer every question. No conferring.'}
      </p>
      {m.items.map((it, i) => (
        <div className="stack" key={i}>
          <div className="eyebrow">Question {i + 1}</div>
          <div className="prompt-text">{it.text}</div>
          <div className="choice-list">
            {(it.choices ?? []).map((c, j) => (
              <button
                key={j}
                className={`choice ${choices[i] === j ? 'selected' : ''}`}
                onClick={() => setChoices((x) => Object.assign([...x], { [i]: j }))}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button className="btn primary block" disabled={!ready} onClick={() => submit(choices as number[])}>
        Lock in my answers
      </button>
    </div>
  );
}
