import type { GameState } from '../engine/types';
import { TV } from '../engine/view';
import { connectRemoteLocal, type GameConnection } from './backend';
import { randomId, storage } from './storage';
import { claimSeat, connectOnline, joinSeat, mySeats, ONLINE, tableInfo } from './supabase';

/** A seat at the table held by this phone. One phone can hold several. */
export interface SeatInfo {
  id: string;
  name: string;
}

/** What a phone can learn about a game before it has a seat. */
export interface TableInfo {
  phase: string;
  doorsOpen: boolean;
  /** Seats the host freed so their player can carry on from another phone. */
  freeSeats: SeatInfo[];
  isHost?: boolean;
}

/** Everything a phone does with a game: find its seats, take new ones, and connect to each. */
export interface Device {
  readonly code: string;
  seats(): Promise<SeatInfo[]>;
  /** Null when there is no such game. */
  info(): Promise<TableInfo | null>;
  /** Take a new seat and return its id. */
  join(name: string): Promise<string>;
  claim(id: string): Promise<void>;
  connect(seat: string): Promise<GameConnection>;
}

export function deviceFor(code: string): Device {
  return ONLINE ? onlineDevice(code) : localDevice(code);
}

/**
 * The seat id for a join, kept until the join is known to have worked. On a bad
 * connection the server can add the player and the reply still get lost; trying
 * again with the same id is then a no-op instead of a second seat with the same name.
 */
function pendingJoin(code: string, name: string) {
  const key = `turncloak:joining:${code}`;
  const held = storage.getJSON<{ id: string; name: string }>(key);
  const id = held && held.name === name ? held.id : randomId();
  storage.setJSON(key, { id, name });
  return { id, done: () => storage.set(key, '') };
}

function onlineDevice(code: string): Device {
  return {
    code,
    seats: () => mySeats(code),
    info: () => tableInfo(code),
    async join(name) {
      const { id, done } = pendingJoin(code, name);
      try {
        await joinSeat(code, id, name);
      } catch (e) {
        // A retry of a join that already landed: the seat is ours.
        if (!(await mySeats(code).catch(() => [])).some((s) => s.id === id)) throw e;
      }
      done();
      return id;
    },
    claim: (id) => claimSeat(code, id),
    connect: (seat) => connectOnline(code, seat),
  };
}

/**
 * Local mode: the host tab owns the game and this tab talks to it over
 * BroadcastChannel. The seats this tab holds are remembered in localStorage.
 */
function localDevice(code: string): Device {
  const key = `turncloak:seats:${code}`;
  const held = () => storage.getJSON<string[]>(key) ?? [];
  const watcher = connectRemoteLocal(code, TV);
  let latest: GameState | null = null;
  watcher.subscribe((v) => (latest = v));

  const waitFor = (test: (s: GameState) => boolean, ms = 3000) =>
    new Promise<boolean>((resolve) => {
      const started = Date.now();
      const check = () => {
        if (latest && test(latest)) return resolve(true);
        if (Date.now() - started > ms) return resolve(false);
        setTimeout(check, 100);
      };
      check();
    });

  const send = (seat: string, action: Parameters<GameConnection['send']>[0]) => {
    const c = connectRemoteLocal(code, seat);
    c.send(action);
    setTimeout(() => c.close(), 500);
  };

  return {
    code,
    async seats() {
      if (!(await waitFor(() => true))) return [];
      return held()
        .map((id) => latest!.players.find((p) => p.id === id))
        .filter((p) => !!p)
        .map((p) => ({ id: p!.id, name: p!.name }));
    },
    async info() {
      if (!(await waitFor(() => true))) return null;
      const s = latest!;
      return {
        phase: s.phase,
        doorsOpen: !!s.doorsOpen,
        freeSeats: s.players.filter((p) => p.away && p.alive).map((p) => ({ id: p.id, name: p.name })),
      };
    },
    async join(name) {
      const { id, done } = pendingJoin(code, name);
      send(id, { type: 'join', playerId: id, name });
      if (!(await waitFor((s) => s.players.some((p) => p.id === id)))) {
        throw new Error('The game has started. Ask the host to let new players in.');
      }
      done();
      storage.setJSON(key, [...held().filter((x) => x !== id), id]);
      return id;
    },
    async claim(id) {
      send(id, { type: 'claimSeat', playerId: id });
      if (!(await waitFor((s) => s.players.some((p) => p.id === id && !p.away)))) {
        throw new Error('Someone else has already picked up that seat.');
      }
      storage.setJSON(key, [...held().filter((x) => x !== id), id]);
    },
    async connect(seat) {
      return connectRemoteLocal(code, seat);
    },
  };
}
