import { useEffect, useMemo, useState } from 'react';
import { makeCode } from './engine/game';
import { TV } from './engine/view';
import { connectRemoteLocal, LocalHost } from './net/backend';
import { playerIdFor, storage } from './net/storage';
import { Demo } from './screens/Demo';
import { HostScreen } from './screens/HostScreen';
import { PlayerScreen } from './screens/PlayerScreen';
import { Logo } from './ui/components';

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

export const go = (path: string) => (window.location.hash = `#/${path}`);

export function App() {
  const [route, code] = useHash();
  if (route === 'demo') return <Demo />;
  if (route === 'host' && code) return <Host code={code.toUpperCase()} />;
  if (route === 'join') return <Join initialCode={code} />;
  if (route === 'play' && code) return <Play code={code.toUpperCase()} />;
  // The hosted preview is a single page, so it opens straight into the demo.
  if (import.meta.env.MODE === 'singlefile' && route !== 'home') return <Demo />;
  return <Home />;
}

function Home() {
  return (
    <div className="castle home">
      <Logo tagline />
      <p className="lead muted" style={{ maxWidth: 560, margin: 0, fontStyle: 'italic', fontSize: '1.25rem' }}>
        A game of loyalty and betrayal for 4 to 22 players. Hidden Traitors murder by night. The Faithful must banish them by day.
      </p>
      <div className="home-cards">
        <div className="panel">
          <h3>Try it now</h3>
          <p className="muted" style={{ margin: 0 }}>Play a full game on this screen against bots.</p>
          <div className="spacer" />
          <button className="btn primary" onClick={() => go('demo')}>Play the demo</button>
        </div>
        <div className="panel">
          <h3>Host a game</h3>
          <p className="muted" style={{ margin: 0 }}>Put this on the TV. Everyone joins on their phone.</p>
          <div className="spacer" />
          <button className="btn" onClick={() => go(`host/${makeCode()}`)}>Open the castle</button>
        </div>
        <div className="panel">
          <h3>Join a game</h3>
          <p className="muted" style={{ margin: 0 }}>Enter the four letter code from the host screen.</p>
          <div className="spacer" />
          <button className="btn" onClick={() => go('join')}>Join</button>
        </div>
      </div>
      <p className="muted" style={{ fontSize: '0.9rem', maxWidth: 560 }}>
        Local mode: host and players must be tabs in the same browser for now. Phones across the room arrive with the online backend.
      </p>
    </div>
  );
}

function Host({ code }: { code: string }) {
  const host = useMemo(() => new LocalHost(code, { restore: true }), [code]);
  useEffect(() => () => host.destroy(), [host]);
  const conn = useMemo(() => host.connect(TV), [host]);
  const joinUrl = `${window.location.origin}${window.location.pathname}#/join/${code}`;
  return <HostScreen conn={conn} joinUrl={joinUrl} />;
}

function Join({ initialCode }: { initialCode?: string }) {
  const [code, setCode] = useState((initialCode ?? '').toUpperCase());
  const [name, setName] = useState(storage.get('turncloak:name') ?? '');
  const ok = code.length === 4 && name.trim().length > 0;
  const join = () => {
    storage.set('turncloak:name', name.trim());
    go(`play/${code}`);
  };
  return (
    <div className="castle home">
      <Logo />
      <div className="panel stack" style={{ width: 'min(400px, 100%)' }}>
        <label className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">Game code</span>
          <input className="field code" value={code} maxLength={4} autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
        </label>
        <label className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">Your name</span>
          <input className="field" value={name} maxLength={18} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok && join()} />
        </label>
        <button className="btn primary block" disabled={!ok} onClick={join}>Enter the castle</button>
      </div>
    </div>
  );
}

function Play({ code }: { code: string }) {
  const conn = useMemo(() => connectRemoteLocal(code, playerIdFor(code)), [code]);
  useEffect(() => () => conn.close(), [conn]);
  return <PlayerScreen conn={conn} name={storage.get('turncloak:name') ?? undefined} />;
}
