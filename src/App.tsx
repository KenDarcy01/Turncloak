import { useEffect, useMemo, useState } from 'react';
import { makeCode } from './engine/game';
import { TV } from './engine/view';
import { LocalHost, type GameConnection } from './net/backend';
import { deviceFor } from './net/device';
import { connectOnline, hostGame, ONLINE } from './net/supabase';
import { storage } from './net/storage';
import { Demo } from './screens/Demo';
import { HostScreen } from './screens/HostScreen';
import { PhoneHub } from './screens/PhoneHub';
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
      <Continue />
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
          <HostButton />
        </div>
        <div className="panel">
          <h3>Join a game</h3>
          <p className="muted" style={{ margin: 0 }}>Enter the four letter code from the host screen.</p>
          <div className="spacer" />
          <button className="btn" onClick={() => go('join')}>Join</button>
        </div>
      </div>
      {!ONLINE && (
        <p className="muted" style={{ fontSize: '0.9rem', maxWidth: 560 }}>
          Local mode: host and players must be tabs in the same browser.
        </p>
      )}
    </div>
  );
}

function HostButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = async () => {
    if (!ONLINE) return go(`host/${makeCode()}`);
    setBusy(true);
    setError('');
    try {
      go(`host/${await hostGame()}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <button className="btn" disabled={busy} onClick={open}>{busy ? 'Opening...' : 'Open the castle'}</button>
      {error && <p className="red" style={{ margin: 0, fontSize: '0.95rem' }}>Could not create the game: {error}</p>}
    </>
  );
}

function joinUrlFor(code: string) {
  return `${window.location.origin}${window.location.pathname}#/join/${code}`;
}

function Host({ code }: { code: string }) {
  useEffect(() => remember(code, true), [code]);
  return ONLINE ? <OnlineHost code={code} /> : <LocalHostScreen code={code} />;
}

function LocalHostScreen({ code }: { code: string }) {
  const host = useMemo(() => new LocalHost(code, { restore: true }), [code]);
  useEffect(() => () => host.destroy(), [host]);
  const conn = useMemo(() => host.connect(TV), [host]);
  return <HostScreen conn={conn} joinUrl={joinUrlFor(code)} />;
}

/** Runs an async connect and closes the connection when the screen goes away. */
function useOnline<T extends GameConnection>(open: () => Promise<T>, deps: unknown[]) {
  const [conn, setConn] = useState<T | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    let opened: T | null = null;
    open()
      .then((c) => {
        opened = c;
        if (live) setConn(c);
        else c.close();
      })
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
      opened?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { conn, error };
}

function OnlineHost({ code }: { code: string }) {
  const { conn, error } = useOnline(() => connectOnline(code, TV), [code]);
  if (error || (conn && conn.missing())) {
    return <Problem text={error || `This screen is not the host of game ${code}. Open the castle again from the home page.`} />;
  }
  if (!conn) return <Problem text="Lighting the candles..." quiet />;
  return <HostScreen conn={conn} joinUrl={joinUrlFor(code)} online />;
}

function Problem({ text, quiet }: { text: string; quiet?: boolean }) {
  return (
    <div className="castle home">
      <Logo />
      <p className={quiet ? 'muted' : 'lead'} style={{ maxWidth: 480 }}>{text}</p>
      {!quiet && <a className="btn" href="#/">Back to the start</a>}
    </div>
  );
}

function Join({ initialCode }: { initialCode?: string }) {
  const [code, setCode] = useState((initialCode ?? '').toUpperCase());
  const [name, setName] = useState(storage.get('turncloak:name') ?? '');
  const ok = code.length === 4 && name.trim().length > 0;
  const join = () => {
    storage.set('turncloak:name', name.trim());
    storage.set('turncloak:autojoin', code);
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
  useEffect(() => remember(code, false), [code]);
  const device = useMemo(() => deviceFor(code), [code]);
  return <PhoneHub key={code} device={device} />;
}

/** Games this browser hosted or played recently, so they can be picked up again from the home page. */
interface Recent {
  code: string;
  host: boolean;
  at: number;
}

const RECENT_KEY = 'turncloak:recent';
const recentGames = () =>
  (storage.getJSON<Recent[]>(RECENT_KEY) ?? []).filter((r) => Date.now() - r.at < 3 * 24 * 3600 * 1000);

function remember(code: string, host: boolean) {
  const rest = recentGames().filter((r) => !(r.code === code && r.host === host));
  storage.setJSON(RECENT_KEY, [{ code, host, at: Date.now() }, ...rest].slice(0, 6));
}

function forget(r: Recent) {
  storage.setJSON(RECENT_KEY, recentGames().filter((x) => !(x.code === r.code && x.host === r.host)));
}

function Continue() {
  const [list, setList] = useState(recentGames);
  if (!list.length) return null;
  return (
    <div className="panel stack" style={{ width: 'min(560px, 100%)' }}>
      <h3 style={{ margin: 0 }}>Continue a game</h3>
      {list.map((r) => (
        <div key={`${r.code}-${r.host}`} className="row">
          <button className="btn primary" style={{ flex: 1 }} onClick={() => go(`${r.host ? 'host' : 'play'}/${r.code}`)}>
            {r.host ? 'Host screen' : 'My phone'} · {r.code}
          </button>
          <button className="btn" aria-label="Forget this game" onClick={() => { forget(r); setList(recentGames()); }}>✕</button>
        </div>
      ))}
    </div>
  );
}
