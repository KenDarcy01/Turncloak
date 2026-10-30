import { useCallback, useEffect, useState } from 'react';
import type { GameState } from '../engine/types';
import type { GameConnection } from '../net/backend';
import type { Device, SeatInfo, TableInfo } from '../net/device';
import { storage } from '../net/storage';
import { Logo } from '../ui/components';
import { needsAction, PlayerScreen } from './PlayerScreen';

/**
 * A phone at the table. It may hold one seat or several (pass-and-play), and it
 * finds its seats again after a refresh. With no seat yet, it offers to join,
 * or to pick up a seat the host freed for a new phone.
 */
export function PhoneHub({ device }: { device: Device }) {
  const { code } = device;
  const [seats, setSeats] = useState<SeatInfo[] | null>(null);
  const [info, setInfo] = useState<TableInfo | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [active, setActiveRaw] = useState<string | null>(storage.get(`turncloak:active:${code}`));
  const [covered, setCovered] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // The join started from the Join page. Until it lands, don't offer the seat form:
  // on a slow connection a second tap there used to add the player twice.
  const [joining, setJoining] = useState(false);

  const setActive = (id: string) => {
    setActiveRaw(id);
    storage.set(`turncloak:active:${code}`, id);
  };

  const reload = useCallback(async () => {
    try {
      const [s, i] = await Promise.all([device.seats(), device.info()]);
      setSeats(s);
      setInfo(i);
      return { seats: s, info: i };
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [device]);

  // Came here from the Join page with a name: take the first seat straight away.
  useEffect(() => {
    reload().then(async (r) => {
      const name = storage.get('turncloak:name');
      if (!r || r.seats.length || !r.info || storage.get('turncloak:autojoin') !== code || !name) return;
      storage.set('turncloak:autojoin', '');
      if (r.info.phase !== 'lobby' && !r.info.doorsOpen) return;
      setJoining(true);
      try {
        setActive(await device.join(name));
        await reload();
      } catch (e) {
        setError((e as Error).message);
      }
      setJoining(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const views = useSeatViews(device, seats);

  if (seats === null || info === undefined) return <Note text={error || 'Finding your seat at the table...'} quiet={!error} />;
  if (info === null) return <Note text={`There is no game with the code ${code}. Check the code on the host screen.`} />;
  if (joining) return <Note text="Taking your seat at the table..." quiet />;

  const current = seats.find((s) => s.id === active) ?? seats[0];
  const doorOpen = (v?: GameState) => (v ? v.phase === 'lobby' || !!v.doorsOpen : info.phase === 'lobby' || info.doorsOpen);

  if (!current || adding) {
    return (
      <TakeSeat
        info={info}
        first={!current}
        onCancel={current ? () => setAdding(false) : undefined}
        onRefresh={reload}
        onJoin={async (name) => {
          const id = await device.join(name);
          if (!current) storage.set('turncloak:name', name);
          await reload();
          setAdding(false);
          // Mid-game, the new player's screen stays hidden until they have the phone.
          if (current && info.phase !== 'lobby') setCovered(id);
          else setActive(id);
        }}
        onClaim={async (id) => {
          await device.claim(id);
          await reload();
          setAdding(false);
          setActive(id);
        }}
      />
    );
  }

  const view = views[current.id]?.view;
  const inPlay = view && view.phase !== 'lobby';
  const switchTo = (id: string) => {
    if (id === current.id) return;
    // Mid-game, hide the screen until the next person has the phone.
    if (inPlay) setCovered(id);
    else setActive(id);
  };

  if (covered) {
    const next = seats.find((s) => s.id === covered);
    return (
      <div className="castle phone">
        <div className="phone-main stack center">
          <Logo />
          <div className="eyebrow">Pass the phone</div>
          <h2>Hand this phone to {next?.name}</h2>
          <p className="lead">Nobody else should see the screen.</p>
          <button className="btn primary block" onClick={() => { setActive(covered); setCovered(null); }}>
            I am {next?.name}, show me
          </button>
          <button className="btn block" onClick={() => setCovered(null)}>Go back</button>
        </div>
      </div>
    );
  }

  const conn = views[current.id]?.conn;
  if (!conn) return <Note text="Finding your seat at the table..." quiet />;

  const bar =
    seats.length > 1 || doorOpen(view) ? (
      <div className="seat-bar">
        {seats.length > 1 && <span className="muted">This phone:</span>}
        {seats.length > 1 &&
          seats.map((s) => (
            <button key={s.id} className={`chip ${s.id === current.id ? 'on' : ''}`} onClick={() => switchTo(s.id)}>
              {s.name}
              {s.id !== current.id && needsAction(views[s.id]?.view, s.id) && <span className="dot" title="Their turn" />}
            </button>
          ))}
        {doorOpen(view) && (
          <button className="chip add" onClick={() => setAdding(true)}>+ Add a player on this phone</button>
        )}
      </div>
    ) : null;

  return <PlayerScreen key={current.id} conn={conn} top={bar} />;
}

/** Open a connection for every seat this phone holds, so it can tell whose turn it is. */
function useSeatViews(device: Device, seats: SeatInfo[] | null) {
  const [views, setViews] = useState<Record<string, { conn: GameConnection; view?: GameState }>>({});
  const ids = (seats ?? []).map((s) => s.id).join(',');
  useEffect(() => {
    if (!ids) return;
    let live = true;
    const opened: GameConnection[] = [];
    for (const id of ids.split(',')) {
      device.connect(id).then((conn) => {
        if (!live) return conn.close();
        opened.push(conn);
        setViews((v) => ({ ...v, [id]: { conn, view: v[id]?.view } }));
        conn.subscribe((view) => setViews((v) => ({ ...v, [id]: { conn, view } })));
      });
    }
    return () => {
      live = false;
      opened.forEach((c) => c.close());
    };
  }, [device, ids]);
  return views;
}

function TakeSeat({
  info,
  first,
  onJoin,
  onClaim,
  onCancel,
  onRefresh,
}: {
  info: TableInfo;
  first: boolean;
  onJoin: (name: string) => Promise<void>;
  onClaim: (id: string) => Promise<void>;
  onCancel?: () => void;
  onRefresh: () => void;
}) {
  const [name, setName] = useState(first ? storage.get('turncloak:name') ?? '' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = info.phase === 'lobby' || info.doorsOpen;
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await f();
    } catch (e) {
      setError((e as Error).message);
      onRefresh();
    }
    setBusy(false);
  };

  return (
    <div className="castle home">
      <Logo />
      <div className="panel stack" style={{ width: 'min(400px, 100%)' }}>
        {open && (
          <>
            <div className="eyebrow">{first ? 'Take your seat' : 'Add another player to this phone'}</div>
            {info.phase !== 'lobby' && <p className="muted" style={{ margin: 0 }}>The game has started. New players join as Truecloaks.</p>}
            <input
              className="field"
              placeholder="Name"
              value={name}
              maxLength={18}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && !busy && run(() => onJoin(name.trim()))}
            />
            <button className="btn primary block" disabled={!name.trim() || busy} onClick={() => run(() => onJoin(name.trim()))}>
              Join the game
            </button>
          </>
        )}
        {info.freeSeats.length > 0 && (
          <>
            <div className="eyebrow">Carry on from this phone</div>
            {info.freeSeats.map((s) => (
              <button key={s.id} className="btn block" disabled={busy} onClick={() => run(() => onClaim(s.id))}>
                I am {s.name}
              </button>
            ))}
          </>
        )}
        {!open && info.freeSeats.length === 0 && (
          <>
            <p className="lead" style={{ margin: 0 }}>This game has already started.</p>
            <p className="muted" style={{ margin: 0 }}>
              To join, ask the host to open Players and let new players in. If you were already playing on another phone, ask the host to move your seat to a new phone.
            </p>
            <button className="btn block" onClick={onRefresh}>Check again</button>
          </>
        )}
        {error && <p className="red" style={{ margin: 0 }}>{error}</p>}
        {onCancel && <button className="btn block" onClick={onCancel}>Back</button>}
      </div>
    </div>
  );
}

function Note({ text, quiet }: { text: string; quiet?: boolean }) {
  return (
    <div className="castle home">
      <Logo />
      <p className={quiet ? 'muted' : 'lead'} style={{ maxWidth: 480 }}>{text}</p>
      {!quiet && <a className="btn" href="#/">Back to the start</a>}
    </div>
  );
}
