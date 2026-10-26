import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GameConnection } from '../net/backend';
import type { GameState, Player, Role } from '../engine/types';
import { buzz } from '../native';

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

// Cloak and dagger: a gold dagger driven down through a crimson cloak. Kept in step with public/favicon.svg.
export function LogoMark({ className = 'logo-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 128 128" aria-hidden>
      <path d="M34 34c10-6 50-6 60 0 4 14 10 40 22 66-16 6-26-2-32-12-6 10-14 14-20 14s-14-4-20-14c-6 10-16 18-32 12 12-26 18-52 22-66Z" fill="#8e1b22" />
      <path d="M34 34c10-6 50-6 60 0-2 10-6 30-10 54-6 10-14 14-20 14s-14-4-20-14c-4-24-8-44-10-54Z" fill="#6a1218" />
      <circle cx="64" cy="12" r="6" fill="#d4af5f" />
      <rect x="60" y="16" width="8" height="16" fill="#9c8045" />
      <rect x="38" y="28" width="52" height="9" rx="3" fill="#d4af5f" />
      <path d="M58 37h12v66l-6 20-6-20Z" fill="#d4af5f" />
      <path d="M64 37h6v66l-6 20Z" fill="#f3d58c" />
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

/** What players call each role. The stored ids stay 'traitor' and 'faithful' so saved games keep working. */
export const roleName = (role: Role) => (role === 'traitor' ? 'turncloak' : 'truecloak');

export function Seat({ player, role, voted, note }: { player: Player; role?: Role; voted?: boolean; note?: ReactNode }) {
  return (
    <div className="seat">
      <Avatar player={player} voted={voted} />
      <div className="name">{player.name}</div>
      {!player.alive && (
        <div className={`tag ${role === 'traitor' ? 'red' : role ? 'gold' : 'muted'}`}>
          {player.out?.by === 'murdered' ? 'struck down' : player.out?.by === 'left' ? `left${role ? ` · ${roleName(role)}` : ''}` : role ? roleName(role) : 'out'}
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
  const show = () => {
    if (!shown) buzz('tap');
    setShown(true);
  };
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
          <div className={`role-name ${role === 'traitor' ? 'red' : 'gold'}`}>{role === 'traitor' ? 'A Turncloak' : 'A Truecloak'}</div>
          {role === 'traitor' ? (
            <div className="muted">
              {fellows.length ? <>Your fellow Turncloaks: {fellows.map((f) => f.name).join(', ')}</> : 'You walk alone.'}
            </div>
          ) : (
            <div className="muted">Find the Turncloaks before they find you.</div>
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
