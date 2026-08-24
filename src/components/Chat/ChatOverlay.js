import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRoom } from '../../contexts/RoomContext';
import { useAuth } from '../../contexts/AuthContext';
import { Send, X, Smile } from 'lucide-react';

const EMOJIS = ['😂', '❤️', '🔥', '👍', '😍', '🎬', '🍿', '🎉', '😮', '👏', '💯', '😎'];

// Pleasant deterministic avatar color per user (matches mockup vibe)
const AVATAR_COLORS = [
  'from-fuchsia-500 to-pink-500',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-green-500',
  'from-amber-500 to-orange-500',
  'from-violet-500 to-purple-500',
  'from-rose-500 to-red-500',
  'from-teal-500 to-cyan-500',
];
const colorFor = (id = '') => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

const formatTime = (ts) => {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch (e) { return ''; }
};

/**
 * Premium floating Chat overlay (Apple/iPhone-style open animation).
 * Re-uses the existing chat data (messages + sendMessage) from RoomContext.
 * No backend / firebase changes.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - originRect: DOMRect | null  – the bounding rect of the launching Chat
 *                                  button, used to make the overlay visually
 *                                  emerge from that exact point.
 */
const ChatOverlay = ({ open, onClose, originRect }) => {
  const { messages, sendMessage } = useRoom();
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const messagesEndRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Mount / unmount with animation (Apple style: scale + fade from origin)
  useEffect(() => {
    if (open) {
      setMounted(true);
      // next frame -> animate in
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else if (mounted) {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 260);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Auto-scroll to newest message whenever messages change or overlay opens.
  useEffect(() => {
    if (!visible) return;
    const el = scrollRef.current;
    if (!el) return;
    // Use rAF so layout is settled (fixes "top messages clipped" issue)
    const id = requestAnimationFrame(() => {
      try { el.scrollTop = el.scrollHeight; } catch (e) { /* ignore */ }
    });
    return () => cancelAnimationFrame(id);
  }, [messages, visible]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput('');
    setShowEmoji(false);
  };

  const addEmoji = (emoji) => {
    setInput(prev => prev + emoji);
    inputRef.current?.focus();
  };

  if (!mounted) return null;

  // Origin point (center of Chat button) for the iPhone-style emerge effect.
  let originStyle = {};
  if (originRect) {
    const cx = originRect.left + originRect.width / 2;
    const cy = originRect.top + originRect.height / 2;
    const ox = cx - (window.innerWidth / 2);
    const oy = cy - (window.innerHeight / 2);
    originStyle = {
      // transform-origin in absolute coords relative to overlay centre
      transformOrigin: `calc(50% + ${ox}px) calc(50% + ${oy}px)`
    };
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[2147483600] flex items-center justify-center transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      data-testid="chat-overlay-root"
      aria-hidden={!visible}
    >
      {/* Click-outside backdrop */}
      <button
        type="button"
        aria-label="Close chat"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        data-testid="chat-overlay-backdrop"
      />

      {/* Floating panel — 80vw × 70vh on mobile, capped on desktop */}
      <div
        style={{
          ...originStyle,
          transform: visible ? 'scale(1)' : 'scale(0.18)',
        }}
        className={`relative w-[80vw] h-[70vh] max-w-[460px] max-h-[680px] sm:max-w-[480px]
                    rounded-3xl overflow-hidden flex flex-col
                    bg-slate-900/80 backdrop-blur-2xl
                    border border-purple-400/30
                    shadow-[0_30px_80px_-20px_rgba(168,85,247,0.45),0_10px_40px_-10px_rgba(0,0,0,0.6)]
                    transition-all duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]
                    ${visible ? 'opacity-100' : 'opacity-0'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Chat"
        data-testid="chat-overlay-panel"
      >
        {/* Aurora accents inside the glass */}
        <div aria-hidden className="pointer-events-none absolute -top-20 -left-16 w-56 h-56 rounded-full bg-purple-500/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-16 w-56 h-56 rounded-full bg-pink-500/20 blur-3xl" />

        {/* Header */}
        <div className="relative flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0">
          <h3 className="text-white font-bold text-lg tracking-tight" data-testid="chat-overlay-title">Chat</h3>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            data-testid="chat-overlay-close"
            aria-label="Close chat"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages (scrollable) */}
        <div
          ref={scrollRef}
          className="relative flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3"
          data-testid="chat-overlay-messages"
          style={{ overscrollBehavior: 'contain' }}
        >
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <p className="text-slate-400 text-sm">No messages yet. Say something!</p>
            </div>
          )}
          {messages.map((msg, i) => {
            const isMe = msg.userId === user?.uid;
            const displayMsg = typeof msg.message === 'object' ? '[Encrypted]' : msg.message;
            const name = msg.userName || 'User';
            const initial = (name[0] || 'U').toUpperCase();
            const color = colorFor(msg.userId || name);
            return (
              <div key={msg.id || i} className="flex items-start gap-2.5" data-testid="chat-overlay-message">
                <div className={`shrink-0 w-9 h-9 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-sm font-bold ring-1 ring-white/15 shadow-md`}>
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-sm font-semibold truncate ${isMe ? 'text-purple-200' : 'text-white'}`}>
                      {isMe ? 'You' : name}
                    </span>
                    <span className="text-[10.5px] text-slate-400 shrink-0 tabular-nums">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                  <div className="mt-1 inline-block max-w-full px-3 py-2 rounded-2xl bg-white/[0.06] border border-white/10 text-slate-100 text-sm leading-snug whitespace-pre-wrap break-words">
                    {displayMsg}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Emoji picker (collapsible) */}
        {showEmoji && (
          <div className="relative px-3 py-2 border-t border-white/10 flex flex-wrap gap-1 bg-slate-900/40">
            {EMOJIS.map(e => (
              <button key={e} type="button" onClick={() => addEmoji(e)} className="p-1.5 hover:bg-white/10 rounded-lg text-lg transition-colors">
                {e}
              </button>
            ))}
          </div>
        )}

        {/* Input (fixed at bottom) */}
        <form
          onSubmit={handleSend}
          className="relative shrink-0 px-3 py-3 border-t border-white/10 bg-slate-900/40 flex items-center gap-2"
        >
          <button
            type="button"
            onClick={() => setShowEmoji(v => !v)}
            className="p-2 text-slate-300 hover:text-purple-300 hover:bg-white/5 rounded-full transition-colors shrink-0"
            data-testid="chat-overlay-emoji-btn"
            aria-label="Emoji picker"
          >
            <Smile className="w-5 h-5" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 min-w-0 bg-white/[0.06] border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-purple-400/60 focus:bg-white/[0.09] transition-colors"
            data-testid="chat-overlay-input"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shadow-lg shadow-purple-900/40 flex items-center justify-center"
            data-testid="chat-overlay-send-btn"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default ChatOverlay;
