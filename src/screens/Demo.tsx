import { useEffect, useMemo, useState } from 'react';
import { makeCode } from '../engine/game';
import { MISSION_PACKS, type MissionPack } from '../engine/missions';
import type { Role } from '../engine/types';
import { TV } from '../engine/view';
import { LocalHost } from '../net/backend';
import { Logo, roleName, useView } from '../ui/components';
import { HostScreen } from './HostScreen';
import { PlayerScreen } from './PlayerScreen';

const ME = 'you';

/**
 * Play a whole game alone: you run the host screen and hold one phone, and bots
 * fill the other seats.
 */
export function Demo() {
  const [setup, setSetup] = useState<{ name: string; bots: number; role: Role | 'random'; pack: MissionPack } | null>(null);
  return setup ? <DemoGame {...setup} onQuit={() => setSetup(null)} /> : <DemoSetup onStart={setSetup} />;
}

function DemoSetup({ onStart }: { onStart: (s: { name: string; bots: number; role: Role | 'random'; pack: MissionPack }) => void }) {
  const [name, setName] = useState('');
  const [bots, setBots] = useState(7);
  const [role, setRole] = useState<Role | 'random'>('random');
  const [pack, setPack] = useState<MissionPack>('resort');
  return (
    <div className="castle home">
      <Logo tagline />
      <div className="panel stack" style={{ width: 'min(440px, 100%)', textAlign: 'left' }}>
        <h3 className="gold">Try a game with bots</h3>
        <p className="muted" style={{ margin: 0 }}>
          You control the host screen and play one seat on the phone. Bots take the other seats.
        </p>
        <label className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">Your name</span>
          <input className="field" value={name} maxLength={18} placeholder="Ken" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">Bots at the table: {bots}</span>
          <input type="range" min={3} max={11} value={bots} onChange={(e) => setBots(Number(e.target.value))} />
        </label>
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">Your role</span>
          <div className="seg">
            {(['random', 'faithful', 'traitor'] as const).map((r) => (
              <button key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>{r === 'random' ? r : roleName(r)}</button>
            ))}
          </div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">Missions</span>
          <div className="seg">
            {MISSION_PACKS.map((p) => (
              <button key={p.id} className={pack === p.id ? 'on' : ''} onClick={() => setPack(p.id)}>{p.name}</button>
            ))}
          </div>
          <span className="muted" style={{ fontSize: '0.95rem' }}>{MISSION_PACKS.find((p) => p.id === pack)?.blurb}</span>
        </div>
        <button className="btn primary block" onClick={() => onStart({ name: name.trim() || 'You', bots, role, pack })}>
          Enter the castle
        </button>
        <a className="muted center" href="#/home">About Turncloak</a>
      </div>
    </div>
  );
}

function DemoGame({ name, bots, role, pack, onQuit }: { name: string; bots: number; role: Role | 'random'; pack: MissionPack; onQuit: () => void }) {
  const host = useMemo(() => new LocalHost(makeCode(), { persist: false }), []);
  const [tab, setTab] = useState<'tv' | 'phone'>('tv');

  useEffect(() => {
    const a = host.authority;
    a.dispatch({ type: 'join', playerId: ME, name });
    for (let i = 0; i < bots; i++) a.dispatch({ type: 'addBot' });
    a.dispatch({ type: 'updateSettings', settings: { missionPack: pack } });
    // Honour the chosen role by swapping with a bot once roles are dealt.
    const off = a.subscribe((s) => {
      if (role === 'random' || s.phase !== 'roleReveal' || s.roles[ME] === role) return;
      const swap = s.players.find((p) => p.isBot && s.roles[p.id] === role);
      if (swap) a.replace({ ...s, roles: { ...s.roles, [ME]: role, [swap.id]: s.roles[ME] } });
    });
    return () => {
      off();
      host.destroy();
    };
  }, [host, name, bots, role, pack]);

  const tv = useMemo(() => host.connect(TV), [host]);
  const me = useMemo(() => host.connect(ME), [host]);
  const myView = useView(me);
  // On small screens, flag the phone tab when it needs you.
  const phoneNeedsYou =
    !!myView &&
    ((myView.phase === 'vote' && !myView.votes[ME]) ||
      (myView.phase === 'night' && myView.roles[ME] === 'traitor' && !myView.nightPicks[ME]) ||
      (myView.phase === 'night' && myView.roles[ME] === 'faithful' && !myView.suspicions[ME]) ||
      (myView.phase === 'endgameVote' && !myView.endVotes[ME]) ||
      myView.phase === 'roleReveal');

  return (
    <div className="demo castle">
      <div className="demo-bar">
        <Logo />
        <span className="muted" style={{ fontSize: '0.9rem' }}>Demo with {bots} bots</span>
        <div className="spacer" />
        <div className="demo-tabs seg">
          <button className={tab === 'tv' ? 'on' : ''} onClick={() => setTab('tv')}>Host screen</button>
          <button className={tab === 'phone' ? 'on' : ''} onClick={() => setTab('phone')}>
            Your phone{phoneNeedsYou && tab !== 'phone' && <span className="ping" />}
          </button>
        </div>
        <button className="btn ghost small" onClick={onQuit}>Leave</button>
      </div>
      <div className="demo-body">
        <div className={`demo-pane tv-pane ${tab === 'tv' ? 'active' : ''}`}>
          <div className="pane-label">Host screen · on the TV</div>
          <HostScreen conn={tv} compact />
        </div>
        <div className={`demo-pane ${tab === 'phone' ? 'active' : ''}`}>
          <div className="pane-label">Your phone · {name}</div>
          <PlayerScreen conn={me} />
        </div>
      </div>
    </div>
  );
}
