/** localStorage can be missing or throw (private windows, sandboxed previews). Never let that break the game. */
export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  getJSON<T>(key: string): T | null {
    const raw = storage.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setJSON(key: string, value: unknown) {
    storage.set(key, JSON.stringify(value));
  },
  /** Forgets everything this game saved on the device. */
  clear() {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
  },
};

export function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

/** A stable id for this browser in a given game, so a phone can reconnect after a refresh. */
export function playerIdFor(code: string): string {
  const k = `turncloak:player:${code}`;
  let id = storage.get(k);
  if (!id) {
    id = randomId();
    storage.set(k, id);
  }
  return id;
}
