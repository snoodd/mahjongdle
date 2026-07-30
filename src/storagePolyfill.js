// Claude's artifact sandbox provides window.storage natively. Outside of
// that environment (e.g. this app self-hosted on Vercel/Netlify/GitHub
// Pages), it doesn't exist — so this fills in the same interface backed by
// the browser's localStorage. Only personal (non-shared) storage is
// meaningful for a single self-hosted deployment, since there's no shared
// backend across different visitors' browsers.

function keyFor(key, shared) {
  return `mahjong-solitaire:${shared ? "shared" : "personal"}:${key}`;
}

if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key, shared = false) {
      const raw = window.localStorage.getItem(keyFor(key, shared));
      if (raw === null) throw new Error("Key not found");
      return { key, value: raw, shared };
    },
    async set(key, value, shared = false) {
      window.localStorage.setItem(keyFor(key, shared), value);
      return { key, value, shared };
    },
    async delete(key, shared = false) {
      window.localStorage.removeItem(keyFor(key, shared));
      return { key, deleted: true, shared };
    },
    async list(prefix = "", shared = false) {
      const fullPrefix = keyFor(prefix, shared);
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(fullPrefix)) {
          keys.push(k.slice(`mahjong-solitaire:${shared ? "shared" : "personal"}:`.length));
        }
      }
      return { keys, prefix, shared };
    },
  };
}
