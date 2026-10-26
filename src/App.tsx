import { useEffect, useMemo, useState } from 'react';
import { makeCode } from './engine/game';
import { TV } from './engine/view';
import { LocalHost, type GameConnection } from './net/backend';
import { deviceFor } from './net/device';
import { connectOnline, deleteMe, hostGame, ONLINE } from './net/supabase';
import { storage } from './net/storage';
import { NATIVE, WEB_URL } from './native';
import { Demo } from './screens/Demo';
import { HostScreen } from './screens/HostScreen';
import { PhoneHub } from './screens/PhoneHub';
import { Logo, LogoMark } from './ui/components';

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
    <div className="castle landing">
      <header className="landing-hero">
        <LogoMark className="hero-mark" />
        <h1 className="logo hero-word">Turncloak</h1>
        <p className="hero-tag">Trust no one at the table</p>
      </header>
      <p className="landing-pitch">
        Hidden Traitors murder by night. The Faithful must banish them by day. <span className="nowrap">4 to 22 players.</span>
      </p>
      <Continue />
      <Doors />
      {!ONLINE && <p className="landing-note">Local mode: host and players must be tabs in the same browser.</p>}
      <Footer />
    </div>
  );
}

/** The three ways in, most used first: guests join, one person hosts, newcomers try the demo. */
function Doors() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const host = async () => {
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
    <div className="doors">
      <Door kind="primary" title="Join a game" sub="Got a code from the TV? Start here." onClick={() => go('join')} />
      <Door title={busy ? 'Opening...' : 'Host a game'} sub="Put this on the TV. Phones join in." onClick={host} disabled={busy} />
      <Door kind="ghost" title="Try the demo" sub="A full game on this screen against bots." onClick={() => go('demo')} />
      {error && <p className="red" style={{ margin: 0 }}>Could not create the game: {error}</p>}
    </div>
  );
}

function Door({ title, sub, kind = '', onClick, disabled }: { title: string; sub: string; kind?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button className={`door ${kind}`} onClick={onClick} disabled={disabled}>
      <span className="door-title">{title}</span>
      <span className="door-sub">{sub}</span>
      <span className="door-arrow" aria-hidden>›</span>
    </button>
  );
}

function Footer() {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const reset = async () => {
    if (!window.confirm('Delete your games and everything this device has saved? This cannot be undone.')) return;
    setState('busy');
    let ok = true;
    try {
      if (ONLINE) await deleteMe();
    } catch {
      ok = false;
    }
    storage.clear();
    setState(ok ? 'done' : 'failed');
  };
  return (
    <footer className="landing-links">
      <a href="privacy.html">Privacy</a>
      <span aria-hidden>·</span>
      <a href="support.html">Help</a>
      <span aria-hidden>·</span>
      <button className="link" disabled={state === 'busy'} onClick={reset}>Reset my data</button>
      {state === 'done' && <span className="landing-note">Your data has been deleted.</span>}
      {state === 'failed' && <span className="red">Cleared this device, but the server could not be reached. Try again later.</span>}
    </footer>
  );
}

function joinUrlFor(code: string) {
  // Inside the app the page address is local to the phone, so invites point at the web game.
  const base = NATIVE ? WEB_URL : `${window.location.origin}${window.location.pathname}`;
  return `${base}#/join/${code}`;
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
    <div className="panel stack continue">
      <h3>Continue a game</h3>
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
