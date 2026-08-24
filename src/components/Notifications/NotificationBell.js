/**
 * Premium bell + unread-badge button for the Lobby header.
 *
 * Behaviour:
 *   • Polls /api/support/notifications every 30s while mounted.
 *   • If there are unread notifications, the bell plays a "mail flutter"
 *     animation EVERY time the app opens / refreshes (see useEffect on
 *     mount). The animation is then replayed every 8s while unread > 0.
 *   • Tapping the bell opens <NotificationCenter />. The bell itself does
 *     NOT mark anything read; reads happen when the user opens an
 *     individual notification card.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Bell } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import NotificationCenter from './NotificationCenter';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const POLL_MS = 30_000;
const REPLAY_MS = 8_000;

const NotificationBell = () => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const replayTimer = useRef(null);

  const unread = items.filter(n => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    if (!user?.token) return;
    try {
      const r = await axios.get(`${BACKEND_URL}/api/support/notifications`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (r.data?.success) setItems(r.data.notifications || []);
    } catch (e) { /* silent */ }
  }, [user]);

  // Initial load + poll
  useEffect(() => {
    fetchNotifications();
    const t = setInterval(fetchNotifications, POLL_MS);
    return () => clearInterval(t);
  }, [fetchNotifications]);

  // Replay the flutter animation on mount + every REPLAY_MS while unread > 0.
  useEffect(() => {
    if (replayTimer.current) { clearInterval(replayTimer.current); replayTimer.current = null; }
    if (unread > 0) {
      setAnimKey(k => k + 1); // play once immediately
      replayTimer.current = setInterval(() => setAnimKey(k => k + 1), REPLAY_MS);
    }
    return () => { if (replayTimer.current) clearInterval(replayTimer.current); };
  }, [unread]);

  const markRead = async (id) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    try {
      await axios.post(`${BACKEND_URL}/api/support/notifications/${id}/read`, {}, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
    } catch (e) { /* refresh below */ }
    fetchNotifications();
  };

  const deleteOne = async (id) => {
    setItems(prev => prev.filter(n => n.id !== id));
    try {
      await axios.delete(`${BACKEND_URL}/api/support/notifications/${id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
    } catch (e) { /* refresh below */ }
    fetchNotifications();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`relative p-2.5 rounded-full transition-all
                    bg-slate-800/40 backdrop-blur-xl border
                    ${unread > 0
                      ? 'border-purple-400/60 shadow-[0_0_22px_rgba(168,85,247,0.45)] hover:bg-slate-800/70'
                      : 'border-purple-500/20 hover:border-purple-500/40 hover:bg-slate-800/70'}`}
        title="Notifications"
        data-testid="notification-bell-btn"
      >
        <Bell
          key={animKey}
          className={`w-5 h-5 transition-colors ${unread > 0 ? 'text-purple-200 wyth-bell-flutter' : 'text-slate-300'}`}
        />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1
                       flex items-center justify-center
                       text-[10px] font-bold leading-none text-white
                       bg-gradient-to-br from-red-500 to-pink-500
                       rounded-full ring-2 ring-slate-950
                       shadow-[0_0_10px_rgba(239,68,68,0.7)]
                       wyth-bell-badge-pulse"
            data-testid="notification-unread-badge"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <NotificationCenter
          notifications={items}
          onClose={() => setOpen(false)}
          onOpen={markRead}
          onDelete={deleteOne}
        />
      )}
    </>
  );
};

export default NotificationBell;
