import { ctxNow, newGame, reduce } from '../engine/game';
import type { Action, GameState } from '../engine/types';
import { storage } from './storage';

type Listener = (s: GameState) => void;

/**
 * The single place where game state changes. In local mode it lives in the host
 * screen's browser tab; with Supabase the same reducer runs in an edge function.
 */
export class Authority {
  state: GameState;
  private listeners = new Set<Listener>();
  private tick: ReturnType<typeof setInterval> | null = null;
  private persist: boolean;

  constructor(code: string, opts: { persist?: boolean; restore?: boolean } = {}) {
    const saved = opts.restore ? storage.getJSON<GameState>(key(code)) : null;
    // Older saves may miss newer fields, so lay them over a fresh game.
    this.state = saved ? { ...newGame(code), ...saved } : newGame(code);
    this.persist = opts.persist ?? true;
    this.tick = setInterval(() => this.onTick(), 1000);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  dispatch(action: Action) {
    const next = reduce(this.state, action, ctxNow());
    if (next === this.state) return;
    this.state = next;
    if (this.persist) storage.setJSON(key(next.code), next);
    this.listeners.forEach((l) => l(next));
  }

  /** Replace the state wholesale. Used by the demo to set up a scenario. */
  replace(next: GameState) {
    this.state = { ...next, rev: this.state.rev + 1 };
    this.listeners.forEach((l) => l(this.state));
  }

  destroy() {
    if (this.tick) clearInterval(this.tick);
    this.listeners.clear();
  }

  private onTick() {
    this.dispatch({ type: 'botTick' });
  }
}

export const key = (code: string) => `turncloak:game:${code}`;
