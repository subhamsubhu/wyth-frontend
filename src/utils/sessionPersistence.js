// WYTH session persistence (router-migration trim-down)
// ---------------------------------------------------------------
// After the migration to React Router, the URL is the primary
// source of truth for the current screen. The previous `view` /
// `lobbyView` keys are no longer needed and have been removed
// to avoid confusion.
//
// This helper now only persists the active `roomId` so that:
//   • a deep-link to /room/:roomId can transparently rejoin the
//     same room (URL is still the source of truth — this is just
//     a safety net if the user ever lands on / without a roomId
//     in the URL but had a live session in the previous tab).
//   • leaveRoom / kick / ban handlers can clear the saved roomId
//     so the next refresh does not try to rejoin.
//
// It intentionally does NOT touch auth, Firebase, sockets, room
// logic, chat, calls or video playback.
// ---------------------------------------------------------------

const NAV_KEY = 'wyth:nav';

const safeStorage = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
};

export const readNavState = () => {
  const ls = safeStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(NAV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    // Forward-compatibility: ignore any legacy fields (view, lobbyView)
    // that may still be present in older localStorage payloads.
    const { roomId } = parsed;
    return roomId ? { roomId } : {};
  } catch {
    return null;
  }
};

export const writeNavState = (patch) => {
  const ls = safeStorage();
  if (!ls) return;
  try {
    const current = readNavState() || {};
    // Only the `roomId` field is persisted by this helper now.
    const next = { ...current, ...(patch || {}) };
    Object.keys(next).forEach((k) => {
      // Strip any legacy keys silently.
      if (k !== 'roomId') {
        delete next[k];
        return;
      }
      if (next[k] === null || next[k] === undefined) delete next[k];
    });
    ls.setItem(NAV_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private-mode errors */
  }
};

export const clearNavState = () => {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.removeItem(NAV_KEY);
  } catch {
    /* noop */
  }
};
