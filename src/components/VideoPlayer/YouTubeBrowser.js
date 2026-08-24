import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useRoom } from '../../contexts/RoomContext';
import {
  Search, X, ArrowLeft, Loader2, Flame, Eye, Clock, ChevronRight
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Full-screen YouTube-style picker. Mounted as a sibling to the player
// inside the room; parent slides the player out and the browser in.
const YouTubeBrowser = ({ open, onClose, onSelect }) => {
  const { user } = useAuth();
  const { canControlPlayback } = useRoom();
  const [q, setQ] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [results, setResults] = useState([]);
  const [trending, setTrending] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const inputRef = useRef(null);
  const sentinelRef = useRef(null);
  const suggestTimer = useRef(null);

  const authHeader = user?.token ? { Authorization: `Bearer ${user.token}` } : {};

  // Load trending when opened with no active search.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadTrending = async () => {
      if (trending.length) return;
      setLoading(true);
      setError('');
      try {
        const r = await axios.get(`${BACKEND_URL}/api/youtube/trending`, { headers: authHeader });
        if (!cancelled && r.data?.success) setTrending(r.data.items || []);
      } catch (e) {
        if (!cancelled) setError('Couldn\'t load trending. Check your connection or API key.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadTrending();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus search input on open (after slide-in animation).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 380);
    return () => clearTimeout(t);
  }, [open]);

  // Suggestions (debounced) while typing.
  useEffect(() => {
    if (!open) return;
    if (!q.trim()) { setSuggestions([]); return; }
    clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(async () => {
      try {
        const r = await axios.get(`${BACKEND_URL}/api/youtube/suggest`, {
          params: { q }, headers: authHeader,
        });
        setSuggestions(r.data?.suggestions || []);
      } catch (e) { setSuggestions([]); }
    }, 220);
    return () => clearTimeout(suggestTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  const runSearch = useCallback(async (query) => {
    const term = (query ?? q).trim();
    if (!term) return;
    setActiveQuery(term);
    setQ(term);
    setShowSugg(false);
    setLoading(true);
    setError('');
    setResults([]);
    setNextPageToken(null);
    try {
      const r = await axios.get(`${BACKEND_URL}/api/youtube/search`, {
        params: { q: term }, headers: authHeader,
      });
      if (r.data?.success) {
        setResults(r.data.items || []);
        setNextPageToken(r.data.nextPageToken || null);
      } else {
        setError(r.data?.error || 'Search failed');
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Search failed');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const loadMore = useCallback(async () => {
    if (!activeQuery || !nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await axios.get(`${BACKEND_URL}/api/youtube/search`, {
        params: { q: activeQuery, pageToken: nextPageToken },
        headers: authHeader,
      });
      if (r.data?.success) {
        setResults((prev) => [...prev, ...(r.data.items || [])]);
        setNextPageToken(r.data.nextPageToken || null);
      }
    } catch (e) { /* ignore */ }
    setLoadingMore(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuery, nextPageToken, loadingMore]);

  // Infinite scroll on the results page.
  useEffect(() => {
    if (!open || !nextPageToken) return;
    const node = sentinelRef.current;
    if (!node) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    }, { rootMargin: '400px' });
    io.observe(node);
    return () => io.disconnect();
  }, [open, nextPageToken, loadMore]);

  const handleSelect = (video) => {
    if (!canControlPlayback) return;
    onSelect?.(video);
  };

  const showingResults = !!activeQuery;
  const items = showingResults ? results : trending;

  return (
    <div
      className={`absolute inset-0 z-[60] bg-gradient-to-br from-slate-950 via-slate-950 to-purple-950/40 flex flex-col transition-all duration-500 ease-out ${
        open ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'
      }`}
      data-testid="youtube-browser"
      aria-hidden={!open}
    >
      {/* Header */}
      <div className="shrink-0 px-3 sm:px-5 py-3 bg-slate-900/80 backdrop-blur-xl border-b border-purple-500/20 flex items-center gap-2 sm:gap-3">
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          data-testid="yt-browser-close"
          title="Back to room"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* YouTube wordmark */}
        <div className="flex items-center gap-1.5 shrink-0 select-none">
          <div className="w-7 h-5 rounded-md bg-red-600 flex items-center justify-center shadow-md shadow-red-600/30">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white fill-current"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <span className="hidden sm:inline text-white font-bold tracking-tight text-base">YouTube</span>
        </div>

        {/* Search bar */}
        <div className="flex-1 relative max-w-2xl mx-auto">
          <div className="flex items-center bg-slate-800/70 border border-purple-500/30 rounded-full overflow-hidden focus-within:border-purple-400 transition-colors">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); setShowSugg(true); }}
              onFocus={() => setShowSugg(true)}
              onBlur={() => setTimeout(() => setShowSugg(false), 180)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              placeholder="Search YouTube"
              className="flex-1 bg-transparent text-white px-4 py-2 text-sm outline-none placeholder:text-slate-500"
              data-testid="yt-search-input"
            />
            {q && (
              <button onClick={() => { setQ(''); setActiveQuery(''); setResults([]); }}
                className="p-1.5 text-slate-400 hover:text-white" title="Clear" data-testid="yt-search-clear">
                <X className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => runSearch()} className="px-4 py-2 text-slate-300 hover:text-white border-l border-purple-500/30" data-testid="yt-search-btn">
              <Search className="w-4 h-4" />
            </button>
          </div>

          {/* Suggestions dropdown */}
          {showSugg && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900/95 backdrop-blur-xl border border-purple-500/30 rounded-2xl shadow-2xl shadow-purple-900/40 overflow-hidden z-10" data-testid="yt-suggestions">
              {suggestions.map((s, i) => (
                <button
                  key={`${s}-${i}`}
                  onMouseDown={() => runSearch(s)}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-purple-500/15 hover:text-white flex items-center gap-2 transition-colors"
                  data-testid={`yt-suggest-${i}`}
                >
                  <Search className="w-3.5 h-3.5 text-slate-500" />
                  <span className="truncate">{s}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section header */}
      <div className="shrink-0 px-3 sm:px-5 pt-4 pb-2 flex items-center gap-2">
        {showingResults ? (
          <>
            <Search className="w-4 h-4 text-purple-300" />
            <h2 className="text-sm font-semibold text-white">
              Results for <span className="text-purple-300">"{activeQuery}"</span>
            </h2>
          </>
        ) : (
          <>
            <Flame className="w-4 h-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-white">Trending now</h2>
          </>
        )}
        <span className="ml-auto text-[10px] uppercase tracking-wider text-purple-300/70">
          {canControlPlayback ? 'Tap any video to load into the room' : 'Host-only selection'}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 pb-6">
        {error && (
          <div className="my-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-video bg-slate-800/50 rounded-xl" />
                <div className="h-3 bg-slate-800/50 rounded mt-3 w-3/4" />
                <div className="h-3 bg-slate-800/40 rounded mt-2 w-1/2" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-slate-500 text-sm">
            {showingResults ? 'No videos found. Try another search.' : 'Nothing here yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4" data-testid="yt-results-grid">
            {items.map((v) => (
              <VideoCard key={v.id} v={v} disabled={!canControlPlayback} onClick={() => handleSelect(v)} />
            ))}
          </div>
        )}

        {/* Infinite-scroll sentinel */}
        {showingResults && nextPageToken && (
          <div ref={sentinelRef} className="flex items-center justify-center py-6 text-slate-500 text-xs">
            {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Scroll for more</span>}
          </div>
        )}

        {!canControlPlayback && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-amber-500/90 text-white text-xs rounded-full shadow-lg shadow-amber-500/30 flex items-center gap-1.5">
            Only the host can select a video
          </div>
        )}
      </div>
    </div>
  );
};

const VideoCard = ({ v, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`group text-left rounded-2xl overflow-hidden bg-slate-900/40 border border-purple-500/10 hover:border-purple-400/40 transition-all ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:scale-[1.015] hover:bg-slate-900/70 active:scale-[0.99]'}`}
    data-testid={`yt-card-${v.id}`}
    title={v.title}
  >
    <div className="relative aspect-video bg-slate-800 overflow-hidden">
      {v.thumbnail && (
        <img
          src={v.thumbnail}
          alt={v.title}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      )}
      {v.duration && (
        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/85 text-white text-[10px] font-medium font-mono flex items-center gap-1">
          <Clock className="w-3 h-3" /> {v.duration}
        </span>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
        <div className="opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all bg-red-600/90 rounded-full px-3 py-1.5 text-white text-xs font-semibold flex items-center gap-1 shadow-lg shadow-red-900/40">
          Play in room <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
    <div className="p-3">
      <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug">{v.title}</h3>
      <p className="text-xs text-slate-400 mt-1 truncate">{v.channel}</p>
      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500">
        <Eye className="w-3 h-3" />
        <span>{v.viewsText}</span>
        <span>·</span>
        <span>{v.publishedAgo}</span>
      </div>
    </div>
  </button>
);

export default YouTubeBrowser;
