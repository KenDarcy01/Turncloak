import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GameConnection } from '../net/backend';
import type { GameState, Player, Role } from '../engine/types';

export function useView(conn: GameConnection | null): GameState | null {
  const [view, setView] = useState<GameState | null>(null);
  useEffect(() => {
    if (!conn) return;
    return conn.subscribe(setView);
  }, [conn]);
  return view;
}

export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// The turned hood: a cloak worn gold on one side and blood red on the other. Kept in step with public/favicon.svg.
export function LogoMark({ className = 'logo-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 128 128" aria-hidden>
      <path d="M64 8C36 12 24 42 26 74c1 20-5 32-16 46h108c-11-14-17-26-16-46C104 42 92 12 64 8Z" fill="#d4af5f" />
      <path d="M64 8c28 4 40 34 38 66-1 20 5 32 16 46H64Z" fill="#8e1b22" />
      <path d="M64 32c-15 2-21 20-19 38 1 12 9 21 19 26 10-5 18-14 19-26 2-18-4-36-19-38Z" fill="#0b0708" />
      <path d="M51 63c4-3 8-3 10 0-3 2-7 2-10 0Z" fill="#f3d58c" />
      <path d="M67 63c2-3 6-3 10 0-3 2-7 2-10 0Z" fill="#c62a33" />
    </svg>
  );
}

export function Logo({ tagline = false }: { tagline?: boolean }) {
  return (
    <div className="logo">
      <span className="logo-row">
        <LogoMark />
        Turncloak
      </span>
      {tagline && <small>Trust no one at the table</small>}
    </div>
  );
}

export function Avatar({ player, size, voted }: { player: Player; size?: 'lg'; voted?: boolean }) {
  return (
    <div
      className={`avatar ${size ?? ''} ${player.alive ? '' : 'dead'}`}
      style={{ ['--c' as string]: player.color }}
      aria-hidden
    >
      {player.name.slice(0, 1).toUpperCase()}
      {voted && <span className="badge">✓</span>}
    </div>
  );
}

export function Seat({ player, role, voted, note }: { player: Player; role?: Role; voted?: boolean; note?: ReactNode }) {
  return (
    <div className="seat">
      <Avatar player={player} voted={voted} />
      <div className="name">{player.name}</div>
      {!player.alive && (
        <div className={`tag ${role === 'traitor' ? 'red' : role ? 'gold' : 'muted'}`}>
          {player.out?.by === 'murdered' ? 'murdered' : player.out?.by === 'left' ? `left${role ? ` · ${role}` : ''}` : role ?? 'out'}
        </div>
      )}
      {player.alive && player.away && <div className="tag muted">new phone</div>}
      {note}
    </div>
  );
}

export function Seats({ view, voted }: { view: GameState; voted?: (id: string) => boolean }) {
  return (
    <div className="seats">
      {view.players.map((p) => (
        <Seat key={p.id} player={p} role={view.roles[p.id]} voted={voted?.(p.id)} />
      ))}
    </div>
  );
}

export function Countdown({ endsAt }: { endsAt: number | null }) {
  const now = useNow();
  if (!endsAt) return null;
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, '0');
  return <div className={`timer ${left <= 10 ? 'low' : ''}`}>{m}:{s}</div>;
}

export function Gold({ amount }: { amount: number }) {
  return <span className="reward">{amount.toLocaleString()} gold</span>;
}

/** Press and hold to peek, so nobody glancing at your phone sees your role. */
export function RoleCard({ role, fellows }: { role: Role; fellows: Player[] }) {
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => setShown(true);
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setShown(false);
  };
  return (
    <div
      className={`role-card ${shown ? `shown ${role}` : ''}`}
      onPointerDown={show}
      onPointerUp={hide}
      onPointerLeave={hide}
      onPointerCancel={hide}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && show()}
      onKeyUp={hide}
      onContextMenu={(e) => e.preventDefault()}
      role="button"
      tabIndex={0}
      aria-label="Press and hold to see your role"
    >
      {shown ? (
        <>
          <div className="eyebrow">You are</div>
          <div className={`role-name ${role === 'traitor' ? 'red' : 'gold'}`}>{role === 'traitor' ? 'A Traitor' : 'Faithful'}</div>
          {role === 'traitor' ? (
            <div className="muted">
              {fellows.length ? <>Your fellow Traitors: {fellows.map((f) => f.name).join(', ')}</> : 'You walk alone.'}
            </div>
          ) : (
            <div className="muted">Find the Traitors before they find you.</div>
          )}
        </>
      ) : (
        <>
          <div className="eyebrow">Your role</div>
          <div className="muted">Press and hold to peek. Shield your screen.</div>
        </>
      )}
    </div>
  );
}

export function PlayerChoice({
  players,
  selected,
  onPick,
  variant,
  meta,
  disabled,
}: {
  players: Player[];
  selected?: string;
  onPick: (id: string) => void;
  variant?: 'traitor-pick';
  meta?: (p: Player) => ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="choice-list">
      {players.map((p) => (
        <button
          key={p.id}
          className={`choice ${variant ?? ''} ${selected === p.id ? 'selected' : ''}`}
          onClick={() => onPick(p.id)}
          disabled={disabled}
        >
          <Avatar player={p} />
          <span>{p.name}</span>
          {meta && <span className="meta">{meta(p)}</span>}
        </button>
      ))}
    </div>
  );
}
