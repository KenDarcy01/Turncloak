import { useState, type ReactNode } from 'react';
import { alive, eligibleVoters, murderTargets, playerById, voteTargets } from '../engine/game';
import { missionById } from '../engine/missions';
import type { Action, GameState, Player } from '../engine/types';
import type { GameConnection } from '../net/backend';
import { Avatar, Countdown, Logo, PlayerChoice, RoleCard, useView } from '../ui/components';
import { TableTalk } from './HostScreen';

/** A player's phone. Everything here is private to that player. */
export function PlayerScreen({ conn, top }: { conn: GameConnection; top?: ReactNode }) {
  const view = useView(conn);
  const me = view ? playerById(view, conn.viewer) : undefined;

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
  return false;
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
      return <MissionPhone view={view} me={me} traitor={traitor} />;

    case 'roundtable':
      return (
        <Wait
          eyebrow="The Round Table"
          title="Make your case"
          lead={traitor ? 'Blend in. Cast suspicion on a Faithful.' : 'Who has been acting strangely?'}
        >
          <Countdown endsAt={view.timerEndsAt} />
          <TableTalk view={view} max={3} />
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
            <p className="lead">Stand, and tell the castle who you really are.</p>
          ) : (
            mine && <p className="muted">You voted for {playerById(view, mine)?.name}.</p>
          )}
        </div>
      );
    }

    case 'night':
      return traitor ? <TraitorNight view={view} me={me} send={send} /> : <FaithfulNight view={view} me={me} send={send} />;

    case 'endgameVote':
      return <EndVote view={view} me={me} send={send} />;

    case 'gameOver': {
      const won = view.roles[me.id] === view.winner;
      return (
        <div className="stack center fade-in">
          <div className="eyebrow">{view.winner === 'traitor' ? 'The Traitors win' : 'The Faithful win'}</div>
          <h2 className={won ? 'gold' : 'red'}>{won ? (me.alive ? 'Victory is yours' : 'Your side won') : 'You were outplayed'}</h2>
          <p className="lead">You were {view.roles[me.id] === 'traitor' ? 'a Traitor' : 'Faithful'}.</p>
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
      <button className="btn primary block" disabled={!choice} onClick={() => choice && send({ type: 'castVote', playerId: me.id, targetId: choice })}>
        {choice ? `Lock in ${playerById(view, choice)?.name}` : 'Choose a name'}
      </button>
    </div>
  );
}

function TraitorNight({ view, me, send }: { view: GameState; me: Player; send: (a: Action) => void }) {
  const [text, setText] = useState('');
  const targets = murderTargets(view).map((id) => playerById(view, id)!);
  const traitors = alive(view).filter((p) => view.roles[p.id] === 'traitor');
  const pickersFor = (id: string) => traitors.filter((t) => view.nightPicks[t.id] === id).map((t) => (t.id === me.id ? 'you' : t.name));
  const agreed = traitors.length > 0 && traitors.every((t) => view.nightPicks[t.id] && view.nightPicks[t.id] === view.nightPicks[traitors[0].id]);
  const say = () => {
    if (!text.trim()) return;
    send({ type: 'traitorChat', playerId: me.id, text });
    setText('');
  };
  return (
    <div className="stack">
      <div className="banner red">
        <div className="eyebrow red">The Traitors meet</div>
        <div>
          {traitors.length > 1 ? `With ${traitors.filter((t) => t.id !== me.id).map((t) => t.name).join(', ')}. ` : 'You are alone tonight. '}
          Choose who will not wake up. {traitors.length > 1 && 'You must all agree.'}
        </div>
      </div>
      <PlayerChoice
        players={targets}
        selected={view.nightPicks[me.id]}
        onPick={(id) => send({ type: 'nightPick', playerId: me.id, targetId: id })}
        variant="traitor-pick"
        meta={(p) => pickersFor(p.id).join(', ')}
      />
      {agreed && <div className="center red display" style={{ fontSize: '0.85rem', letterSpacing: '0.15em' }}>THE CHOICE IS MADE</div>}
      {traitors.length > 1 && (
        <div className="panel stack" style={{ padding: 14 }}>
          <div className="eyebrow">Whisper to your fellow Traitors</div>
          <div className="chat">
            {view.traitorChat.slice(-30).map((m, i) => (
              <div className="msg" key={i}><b>{m.from === me.id ? 'You' : playerById(view, m.from)?.name}</b>{m.text}</div>
            ))}
            {view.traitorChat.length === 0 && <div className="muted">No whispers yet.</div>}
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="field" value={text} placeholder="Plot quietly..." onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && say()} />
            <button className="btn small" onClick={say}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Faithful get a task too, so a phone being used at night gives nothing away. */
function FaithfulNight({ view, me, send }: { view: GameState; me: Player; send: (a: Action) => void }) {
  const others = alive(view).filter((p) => p.id !== me.id);
  return (
    <div className="stack">
      <div className="eyebrow">Night {view.day}</div>
      <h2>Lock your door</h2>
      <p className="lead">While the Traitors plot, write in your secret diary: who do you suspect most?</p>
      <PlayerChoice players={others} selected={view.suspicions[me.id]} onPick={(id) => send({ type: 'suspect', playerId: me.id, targetId: id })} />
      <p className="muted center">Your diary is private. Keep tapping so nobody can tell who is plotting.</p>
    </div>
  );
}

function EndVote({ view, me, send }: { view: GameState; me: Player; send: (a: Action) => void }) {
  const mine = view.endVotes[me.id];
  return (
    <div className="stack">
      <div className="eyebrow">The endgame</div>
      <h2>Are all the Traitors gone?</h2>
      <p className="lead">If everyone votes to end, the game ends now. If you are wrong, the Traitors take everything.</p>
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
function MissionPhone({ view, me, traitor }: { view: GameState; me: Player; traitor: boolean }) {
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
      <p className="muted">
        {traitor
          ? 'A failed mission means less gold for the Faithful. Sabotage it if you dare, but do not get caught.'
          : 'Every success adds gold to the pot. Watch for anyone who seems to be holding the team back.'}
      </p>
    </div>
  );
}
