import { useSyncExternalStore } from 'react';

/**
 * Whether this screen's moves are reaching the game. Online, a vote sent over
 * weak Wi-Fi can be lost; players need to know so they can try again.
 */
export interface SendStatus {
  /** Moves on their way to the server. */
  pending: number;
  /** Set when a move did not go through, cleared after a few seconds or on the next success. */
  failed: string | null;
}

let status: SendStatus = { pending: 0, failed: null };
const listeners = new Set<() => void>();
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function set(next: Partial<SendStatus>) {
  status = { ...status, ...next };
  listeners.forEach((l) => l());
}

export const sendStatus = {
  start() {
    set({ pending: status.pending + 1 });
  },
  done() {
    set({ pending: Math.max(0, status.pending - 1), failed: null });
  },
  fail(message: string) {
    set({ pending: Math.max(0, status.pending - 1), failed: message });
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => set({ failed: null }), 8000);
  },
};

export function useSendStatus(): SendStatus {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => status,
  );
}
