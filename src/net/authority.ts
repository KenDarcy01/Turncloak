import { BOT_TRAITOR_LINES, botActions } from '../engine/bots';
import { aliveTraitors, ctxNow, newGame, reduce } from '../engine/game';
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
  private phaseKey = '';
  private phaseStartedAt = Date.now();
  private chattedThisNight = false;
  private persist: boolean;

  constructor(code: string, opts: { persist?: boolean; restore?: boolean } = {}) {
    const saved = opts.restore ? storage.getJSON<GameState>(key(code)) : null;
    this.state = saved ?? newGame(code);
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
    const s = this.state;
    const pk = `${s.phase}:${s.day}:${s.voteRound}`;
    if (pk !== this.phaseKey) {
      this.phaseKey = pk;
      this.phaseStartedAt = Date.now();
      this.chattedThisNight = false;
    }
    const elapsed = Date.now() - this.phaseStartedAt;

    if (s.phase === 'vote' && s.timerEndsAt && Date.now() > s.timerEndsAt) {
      this.dispatch({ type: 'closeVoting' });
      return;
    }

    // Bots act at a human-ish pace. At night they give a human Traitor time to choose first.
    const minWait = s.phase === 'night' ? 7000 : 2500;
    if (elapsed < minWait) return;
    for (const a of botActions(s, Math.random)) {
      if (Math.random() < 0.3) this.dispatch(a);
    }

    if (s.phase === 'night' && !this.chattedThisNight && elapsed > 4000) {
      const humanTraitor = aliveTraitors(s).some((p) => !p.isBot);
      const bot = aliveTraitors(s).find((p) => p.isBot);
      if (humanTraitor && bot) {
        this.chattedThisNight = true;
        const line = BOT_TRAITOR_LINES[Math.floor(Math.random() * BOT_TRAITOR_LINES.length)];
        this.dispatch({ type: 'traitorChat', playerId: bot.id, text: line });
      }
    }
  }
}

export const key = (code: string) => `turncloak:game:${code}`;
