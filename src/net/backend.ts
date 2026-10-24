import { HOST_ACTIONS, type Action, type GameState } from '../engine/types';
import { TV, viewFor } from '../engine/view';
import { Authority } from './authority';

/**
 * One screen's link to a game: the host TV or a player's phone.
 * The UI only ever talks to this interface, so the local mock and Supabase
 * backends are interchangeable.
 */
export interface GameConnection {
  readonly code: string;
  /** TV for the host screen, otherwise the player's id. */
  readonly viewer: string;
  subscribe(fn: (view: GameState) => void): () => void;
  send(action: Action): void;
  close(): void;
}

type Wire =
  | { t: 'hello' }
  | { t: 'state'; state: GameState }
  | { t: 'action'; from: string; action: Action };

function channel(code: string): BroadcastChannel | null {
  try {
    return new BroadcastChannel(`turncloak:${code}`);
  } catch {
    return null; // Sandboxed or very old browsers: same-tab play still works.
  }
}

/** Player actions must come from the player they name; host actions only from the host screen. */
export function allowed(viewer: string, action: Action): boolean {
  if (HOST_ACTIONS.includes(action.type)) return viewer === TV;
  return 'playerId' in action && action.playerId === viewer;
}

/**
 * Local backend. The host screen's tab owns the game; phones in other tabs of the
 * same browser connect over BroadcastChannel. Good for development and demos.
 * Real phones across a room need the Supabase backend.
 */
export class LocalHost {
  readonly authority: Authority;
  private bc: BroadcastChannel | null;

  constructor(readonly code: string, opts: { restore?: boolean; persist?: boolean } = {}) {
    this.authority = new Authority(code, opts);
    this.bc = channel(code);
    if (this.bc) {
      this.bc.onmessage = (e: MessageEvent<Wire>) => {
        const m = e.data;
        if (m.t === 'hello') this.broadcast(this.authority.state);
        if (m.t === 'action' && allowed(m.from, m.action)) this.authority.dispatch(m.action);
      };
      this.authority.subscribe((s) => this.broadcast(s));
    }
  }

  private broadcast(state: GameState) {
    this.bc?.postMessage({ t: 'state', state } satisfies Wire);
  }

  /** A connection inside this same tab, for the TV or a seat in demo mode. */
  connect(viewer: string): GameConnection {
    const a = this.authority;
    return {
      code: this.code,
      viewer,
      subscribe: (fn) => a.subscribe((s) => fn(viewFor(s, viewer))),
      send: (action) => allowed(viewer, action) && a.dispatch(action),
      close: () => {},
    };
  }

  destroy() {
    this.authority.destroy();
    this.bc?.close();
  }
}

/** A phone in another tab, talking to a LocalHost over BroadcastChannel. */
export function connectRemoteLocal(code: string, viewer: string): GameConnection {
  const bc = channel(code);
  const listeners = new Set<(v: GameState) => void>();
  let last: GameState | null = null;
  if (bc) {
    bc.onmessage = (e: MessageEvent<Wire>) => {
      if (e.data.t !== 'state') return;
      if (last && e.data.state.rev < last.rev && e.data.state.code === last.code) return;
      last = e.data.state;
      const view = viewFor(last, viewer);
      listeners.forEach((l) => l(view));
    };
    bc.postMessage({ t: 'hello' } satisfies Wire);
  }
  return {
    code,
    viewer,
    subscribe(fn) {
      listeners.add(fn);
      if (last) fn(viewFor(last, viewer));
      return () => listeners.delete(fn);
    },
    send(action) {
      bc?.postMessage({ t: 'action', from: viewer, action } satisfies Wire);
    },
    close() {
      bc?.close();
    },
  };
}
