/**
 * Premium Notification Center modal.
 *
 * Per spec: cards display ONLY the original request, the admin reply, and
 * a relative timestamp. No emails, no uids, no type labels, no read/unread
 * badges. Cards have a trash icon; swipe-left also deletes on touch
 * devices.
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, Trash2, Inbox, Mail } from 'lucide-react';

const NotificationCenter = ({ notifications, onClose, onOpen, onDelete }) => {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-6 wyth-fade-in"
      onClick={onClose}
      data-testid="notification-center"
    >
      <div
        className="relative w-full sm:max-w-lg max-h-[100vh] sm:max-h-[88vh]
                   bg-gradient-to-b from-slate-900/95 to-slate-950/95
                   backdrop-blur-2xl border border-purple-500/25
                   rounded-none sm:rounded-3xl shadow-2xl shadow-purple-900/40
                   flex flex-col overflow-hidden wyth-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-purple-500/15">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-purple-400/30 flex items-center justify-center">
              <Inbox className="w-4 h-4 text-purple-200" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Notifications</h3>
              <p className="text-[11px] text-slate-400">
                {notifications.length === 0 ? 'You\'re all caught up' : `${notifications.length} message${notifications.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-full transition-all"
            data-testid="notification-close-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-2.5 wyth-scroll">
          {notifications.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-800/50 border border-purple-500/15 flex items-center justify-center mb-3">
                <Mail className="w-7 h-7 text-slate-500" />
              </div>
              <p className="text-sm text-slate-400">No notifications yet.</p>
              <p className="text-xs text-slate-500 mt-1">Admin replies will appear here.</p>
            </div>
          )}

          {notifications.map(n => (
            <NotificationCard
              key={n.id}
              item={n}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const NotificationCard = ({ item, onOpen, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const touchStartX = useRef(null);

  const open = () => {
    if (!expanded) {
      setExpanded(true);
      if (!item.read) onOpen?.(item.id);
    }
  };

  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchMove = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    if (dx < 0) setSwipeX(Math.max(dx, -120));
  };
  const onTouchEnd = () => {
    if (swipeX < -80) onDelete?.(item.id);
    setSwipeX(0);
    touchStartX.current = null;
  };

  return (
    <div className="relative" data-testid={`notification-card-${item.id}`}>
      {/* swipe-revealed delete background */}
      {swipeX < 0 && (
        <div className="absolute inset-0 flex items-center justify-end pr-6 bg-red-500/15 rounded-2xl">
          <Trash2 className="w-5 h-5 text-red-300" />
        </div>
      )}
      <div
        onClick={open}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(${swipeX}px)` }}
        className="relative bg-slate-900/60 hover:bg-slate-900/80 backdrop-blur-xl
                   border border-purple-500/20 hover:border-purple-400/40
                   rounded-2xl p-4 transition-all cursor-pointer
                   shadow-sm hover:shadow-purple-500/10"
      >
        {/* Top row: icon + time + delete */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/25 to-pink-500/25 border border-purple-400/25 flex items-center justify-center">
              <Mail className="w-4 h-4 text-purple-200" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white tracking-tight">Admin Reply</p>
              <p className="text-[11px] text-slate-500">{timeAgo(item.createdAt)}</p>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(item.id); }}
            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
            title="Delete"
            data-testid={`notification-delete-${item.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-2.5 pl-1">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Your Request</p>
            <p className={`text-sm text-slate-300 leading-relaxed whitespace-pre-wrap ${expanded ? '' : 'line-clamp-2'}`}>
              {item.originalRequest || '—'}
            </p>
          </div>
          <div className="pt-1.5 border-t border-purple-500/10">
            <p className="text-[10px] uppercase tracking-wider text-purple-300/80 mb-0.5">Reply</p>
            <p className={`text-sm text-slate-100 leading-relaxed whitespace-pre-wrap ${expanded ? '' : 'line-clamp-3'}`}>
              {item.replyText || '—'}
            </p>
          </div>
          {!expanded && (item.originalRequest?.length > 100 || item.replyText?.length > 140) && (
            <p className="text-[11px] text-purple-300/70">Tap to read more</p>
          )}
        </div>
      </div>
    </div>
  );
};

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const dd = Math.floor(h / 24);
  if (dd < 7) return `${dd} day${dd === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

export default NotificationCenter;
