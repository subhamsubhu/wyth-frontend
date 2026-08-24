import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../../contexts/RoomContext';
import { useAuth } from '../../contexts/AuthContext';
import VideoPlayer from '../VideoPlayer/VideoPlayer';
import VideoUploader from '../VideoPlayer/VideoUploader';
import YouTubeBrowser from '../VideoPlayer/YouTubeBrowser';
import ChatPanel from '../Chat/ChatPanel';
import ChatOverlay from '../Chat/ChatOverlay';
import CallPanel from '../Call/CallPanel';
import UserList from './UserList';
import AnnouncementBanner from '../Common/AnnouncementBanner';
import { toast } from 'sonner';
import { LogOut, Plus, Copy, Check, Users, MessageSquare, Settings, X, Lock, Globe, RotateCw } from 'lucide-react';
import { pickDriveVideo } from '../../services/googleDrive';

// Clipboard helper that NEVER throws. The Emergent preview iframe (and some
// mobile in-app browsers) block `navigator.clipboard.writeText` via the
// Permissions-Policy header. We try the modern API first and fall back to a
// hidden textarea + document.execCommand('copy').
async function safeCopy(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through to fallback */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

const RoomView = () => {
  const { currentRoom, leaveRoom, videoState, messages, loadVideo, canControlPlayback } = useRoom();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isHostOrCo = currentRoom?.hostId === user?.uid || (currentRoom?.coHosts || []).includes(user?.uid);
  const [showUploader, setShowUploader] = useState(false);
  const [showYouTube, setShowYouTube] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sidePanel, setSidePanel] = useState(null); // null | 'users' | 'settings'
  const [chatOpen, setChatOpen] = useState(false);
  const [chatOriginRect, setChatOriginRect] = useState(null);
  const chatBtnRef = useRef(null);
  const [drivePicking, setDrivePicking] = useState(false);

  // Google Drive — open the picker, ensure file is publicly readable,
  // then push the streamable URL into the room via the existing sync
  // `loadVideo()` action. Only the host / co-host (`canControlPlayback`)
  // can pick a Drive video; everyone else gets a clear permission toast.
  const handleOpenDrive = async () => {
    if (drivePicking) return;
    if (!canControlPlayback) {
      toast.error('Only the host can change the Drive video');
      return;
    }
    setDrivePicking(true);
    try {
      const file = await pickDriveVideo();
      if (file && file.url) {
        loadVideo(file.url, 'direct');
        toast.success(`Loaded "${file.name || 'video'}" from Drive`);
      }
    } catch (err) {
      if (err && err.canceled) {
        // User closed the picker — silent, no toast.
      } else {
        // eslint-disable-next-line no-console
        console.error('[Drive]', err);
        toast.error(err?.message || 'Google Drive sign-in or selection failed');
      }
    } finally {
      setDrivePicking(false);
    }
  };

  // Unread chat message tracking
  const [unreadCount, setUnreadCount] = useState(0);
  const prevMsgLenRef = useRef(0);
  const initializedRef = useRef(false);

  useEffect(() => {
    // First time we receive messages (history load) - mark all as seen, no badge
    if (!initializedRef.current) {
      initializedRef.current = true;
      prevMsgLenRef.current = messages.length;
      return;
    }
    const prev = prevMsgLenRef.current;
    prevMsgLenRef.current = messages.length;

    if (chatOpen) {
      // Chat is open - keep counter at zero
      if (unreadCount !== 0) setUnreadCount(0);
      return;
    }
    if (messages.length > prev) {
      const newMsgs = messages.slice(prev);
      const fromOthers = newMsgs.filter(m => m.userId !== user?.uid).length;
      if (fromOthers > 0) setUnreadCount(c => c + fromOthers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Reset unread count when chat panel is opened
  useEffect(() => {
    if (chatOpen) setUnreadCount(0);
  }, [chatOpen]);

  const copyRoomId = async () => {
    const ok = await safeCopy(currentRoom?.id || '');
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Room ID copied', { duration: 1500 });
    } else {
      toast.error('Copy blocked by browser — long-press to copy: ' + (currentRoom?.id || ''), { duration: 4000 });
    }
  };

  const inviteLink = `${window.location.origin}?room=${currentRoom?.id}`;

  const copyInviteLink = async () => {
    const ok = await safeCopy(inviteLink);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Invite link copied', { duration: 1500 });
    } else {
      toast.error('Copy blocked by browser — long-press to copy: ' + inviteLink, { duration: 4000 });
    }
  };

  const openPanel = (key) => setSidePanel(prev => prev === key ? null : key);
  const closePanel = () => setSidePanel(null);

  const openChat = () => {
    try {
      const rect = chatBtnRef.current?.getBoundingClientRect?.();
      if (rect) setChatOriginRect(rect);
    } catch (e) { /* ignore */ }
    setChatOpen(true);
  };
  const closeChat = () => setChatOpen(false);

  const triggerLandscape = () => {
    try { window.dispatchEvent(new CustomEvent('wyth:toggle-landscape')); } catch (e) { /* ignore */ }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950 overflow-hidden" data-testid="room-view">
      <AnnouncementBanner />
      {/* Top bar */}
      <header className="relative flex items-center justify-between gap-3 px-3 sm:px-5 py-3 bg-slate-900/80 backdrop-blur-xl border-b border-purple-500/20 shrink-0 z-30 overflow-hidden">
        {/* subtle aurora glow behind the header (decorative only) */}
        <div aria-hidden="true" className="pointer-events-none absolute -top-10 -left-10 w-40 h-40 rounded-full bg-purple-500/20 blur-3xl"></div>
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-12 left-1/3 w-48 h-24 rounded-full bg-pink-500/10 blur-3xl"></div>

        <div className="relative flex flex-col min-w-0 flex-1 justify-center">
          {/* Room name — larger / more prominent now that the logo is gone */}
          <h1
            className="text-lg sm:text-2xl font-extrabold tracking-tight leading-tight truncate bg-gradient-to-r from-white via-purple-100 to-pink-200 bg-clip-text text-transparent"
            title={currentRoom?.name || 'WYTH'}
            data-testid="room-name-title"
          >
            {currentRoom?.name || 'WYTH'}
          </h1>

          {/* Room ID + copy — clearly visible, properly aligned */}
          <div className="mt-1 flex items-center gap-2 min-w-0">
            <span className="text-[11px] sm:text-xs text-slate-400/90 shrink-0">Room ID:</span>
            <span
              className="text-[12px] sm:text-sm font-mono font-semibold tracking-wider text-white truncate min-w-0"
              title={currentRoom?.id}
              data-testid="room-id-text"
            >
              {currentRoom?.id}
            </span>
            <button
              onClick={copyRoomId}
              className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all active:scale-90 ${
                copied
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                  : 'bg-white/[0.04] border-purple-400/30 hover:border-purple-400/60 text-purple-200 hover:text-white hover:bg-purple-500/15'
              }`}
              data-testid="copy-room-id"
              aria-label="Copy Room ID"
              title={copied ? 'Copied!' : 'Copy Room ID'}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Action row: [Call] [Video] [Chat] [Leave] */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0" data-testid="header-action-row">
          <CallPanel />

          {/* Chat button — visually matches Call/Video (btn-luxe pill) */}
          <button
            ref={chatBtnRef}
            onClick={openChat}
            className="relative btn-luxe btn-luxe-pill px-4 py-2 text-sm chat-luxe"
            data-testid="open-chat-btn"
            title="Open Chat"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Chat</span>
            {unreadCount > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-pink-500 text-white text-[10px] font-bold flex items-center justify-center shadow-lg shadow-pink-500/40 ring-2 ring-slate-900 animate-pulse"
                data-testid="open-chat-btn-badge"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={async () => { await leaveRoom(); navigate('/lobby', { replace: true }); }}
            className="btn-luxe btn-luxe-danger btn-luxe-pill px-4 py-2 text-sm"
            data-testid="leave-room-btn"
            title="Leave room"
          >
            <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      {/* Main content - video area takes full width */}
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0 flex flex-col p-3 sm:p-4 overflow-auto">
          {/* Player + YouTube browser overlay container */}
          <div className="relative">
            <div className={`transition-all duration-500 ease-out ${showYouTube ? '-translate-x-3 opacity-30 scale-[0.985] pointer-events-none' : 'translate-x-0 opacity-100 scale-100'}`}>
              <VideoPlayer />
            </div>

            {/* Floating top-right overlay on the player: [Members] [Landscape] */}
            <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-20 flex items-center gap-2" data-testid="player-overlay-controls">
              <button
                onClick={() => openPanel('users')}
                className="group inline-flex items-center justify-center p-2 rounded-xl bg-black/55 hover:bg-purple-600/30 backdrop-blur-xl border border-purple-400/30 hover:border-purple-300/70 text-white transition-all shadow-lg shadow-black/40 hover:scale-105 active:scale-95"
                data-testid="open-members-btn"
                title="Members"
                aria-label="Members"
              >
                <Users className="w-4 h-4 text-purple-200 group-hover:text-white transition-colors" />
              </button>
              <button
                onClick={triggerLandscape}
                className="group inline-flex items-center justify-center p-2 rounded-xl bg-black/55 hover:bg-white/10 backdrop-blur-xl border border-white/15 hover:border-white/35 text-white transition-all shadow-lg shadow-black/40 hover:scale-105 active:scale-95"
                data-testid="player-landscape-btn"
                title="Landscape"
                aria-label="Landscape"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Video controls bar */}
          <div className="mt-3 flex items-start justify-between flex-wrap gap-3">
            {/* Stacked media source buttons: Load Video / YouTube / Drive */}
            <div className="flex flex-col gap-2 w-full sm:w-auto sm:min-w-[200px]" data-testid="media-source-buttons">
              {/* Load Video */}
              <button
                onClick={() => setShowUploader(true)}
                className="group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-sm font-semibold transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-purple-900/30"
                data-testid="add-video-btn"
                title="Upload a video or paste a link"
              >
                <Plus className="w-4 h-4" />
                <span>Load Video</span>
              </button>

              {/* YouTube */}
              <button
                onClick={() => setShowYouTube(true)}
                disabled={!canControlPlayback}
                className={`group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  canControlPlayback
                    ? 'bg-[#FF0000] hover:bg-[#cc0000] text-white hover:scale-[1.02] active:scale-95 shadow-lg shadow-red-900/30'
                    : 'bg-slate-800/60 text-slate-500 cursor-not-allowed'
                }`}
                title={canControlPlayback ? 'Browse YouTube' : 'Only the host can browse YouTube'}
                data-testid="open-youtube-btn"
              >
                <span className={`w-6 h-[18px] rounded-[4px] flex items-center justify-center shrink-0 ${canControlPlayback ? 'bg-white' : 'bg-slate-700'}`}>
                  <svg viewBox="0 0 24 24" className={`w-3.5 h-3.5 ${canControlPlayback ? 'text-[#FF0000]' : 'text-slate-500'}`} fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
                <span>YouTube</span>
              </button>

              {/* Google Drive — host / controller only */}
              <button
                type="button"
                onClick={handleOpenDrive}
                disabled={!canControlPlayback || drivePicking}
                className={`group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${
                  canControlPlayback
                    ? 'bg-white hover:bg-slate-100 text-slate-800 hover:scale-[1.02] active:scale-95 shadow-lg shadow-black/30 border border-slate-200'
                    : 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-700/60'
                } ${drivePicking ? 'opacity-70 cursor-wait' : ''}`}
                title={canControlPlayback ? 'Pick or upload a video from Google Drive' : 'Only the host can browse Google Drive'}
                data-testid="open-drive-btn"
                aria-label="Pick a video from Google Drive"
              >
                {/* Official Google Drive triangle logo */}
                <svg viewBox="0 0 87.3 78" className="w-5 h-5 shrink-0" aria-hidden="true">
                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
                  <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z" fill="#00ac47" />
                  <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 11.5z" fill="#ea4335" />
                  <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
                  <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
                  <path d="M73.4 26.5 60.7 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
                </svg>
                <span>{drivePicking ? 'Opening…' : 'Drive'}</span>
              </button>

              {videoState.videoUrl && !showYouTube && (
                <span className="text-[11px] text-slate-500 truncate max-w-full pt-1" data-testid="now-playing-label">
                  Playing: {videoState.videoUrl.substring(0, 50)}...
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <PlaybackControlToggle isHostOrCo={isHostOrCo} />
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-green-400">Synced</span>
              </div>
            </div>
          </div>
        </div>

        {/* Full-screen YouTube browser overlay (slides over the room main area) */}
        <YouTubeBrowser
          open={showYouTube}
          onClose={() => setShowYouTube(false)}
          onSelect={(video) => {
            if (!canControlPlayback) {
              toast.error('Only the host can change the video');
              return;
            }
            loadVideo(video.url, 'youtube');
            toast.success(`Loading: ${video.title.slice(0, 60)}${video.title.length > 60 ? '…' : ''}`, { duration: 2500 });
            setShowYouTube(false);
          }}
        />

        {/* Backdrop when panel open (mobile) */}
        <div
          className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 z-40 sm:hidden ${
            sidePanel ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={closePanel}
          data-testid="panel-backdrop"
        />

        {/* Slide-in side drawer (Members / Settings only — Chat is now a floating overlay) */}
        <aside
          className={`absolute top-0 right-0 h-full w-full sm:w-96 bg-slate-900/95 backdrop-blur-xl border-l border-purple-500/30 shadow-2xl shadow-purple-900/50 flex flex-col z-50 transition-transform duration-300 ease-out ${
            sidePanel ? 'translate-x-0' : 'translate-x-full'
          }`}
          data-testid="side-panel"
          aria-hidden={!sidePanel}
        >
          {/* Drawer header with tabs and close */}
          <div className="flex items-center border-b border-purple-500/20 shrink-0">
            <div className="flex flex-1">
              {[
                { key: 'users', icon: Users, label: 'Members' },
                { key: 'settings', icon: Settings, label: 'Settings' },
              ].map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setSidePanel(key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-all duration-200 relative ${
                    sidePanel === key
                      ? 'text-purple-300 border-b-2 border-purple-500 bg-purple-500/5'
                      : 'text-slate-500 hover:text-slate-300 border-b-2 border-transparent'
                  }`}
                  data-testid={`panel-tab-${key}`}
                >
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
            <button
              onClick={closePanel}
              className="p-3 text-slate-400 hover:text-white hover:bg-red-500/20 transition-colors"
              data-testid="close-panel-btn"
              title="Close panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {sidePanel === 'users' && (
              <div className="p-3 overflow-y-auto h-full"><UserList /></div>
            )}
            {sidePanel === 'settings' && (
              <div className="p-4 space-y-4 overflow-y-auto h-full">
                <h3 className="text-sm font-semibold text-white">Room Settings</h3>
                {!isHostOrCo && (
                  <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
                    Only the host or co-hosts can change settings.
                  </p>
                )}
                <div className="space-y-3">
                  <ToggleSetting label="Allow Chat" settingKey="allowChat" disabled={!isHostOrCo} />
                  <ToggleSetting label="Allow Voice Calls" settingKey="allowVoiceCall" disabled={!isHostOrCo} />
                  <ToggleSetting label="Allow Video Calls" settingKey="allowVideoCall" disabled={!isHostOrCo} />
                  <ToggleSetting label="Allow Screen Share" settingKey="allowScreenShare" disabled={!isHostOrCo} />
                  <ToggleSetting label="Auto Sync" settingKey="autoSync" disabled={!isHostOrCo} />
                </div>
                <div className="pt-4 border-t border-purple-500/20">
                  <p className="text-xs text-slate-500">Room ID: <span className="font-mono text-slate-400">{currentRoom?.id}</span></p>
                  <p className="text-xs text-slate-500 mt-1">Host: <span className="text-slate-400">{currentRoom?.hostName}</span></p>
                  <p className="text-xs text-slate-500 mt-1">Created: {new Date(currentRoom?.createdAt).toLocaleString()}</p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Video uploader modal */}
      {showUploader && <VideoUploader onClose={() => setShowUploader(false)} />}

      {/* Premium floating Chat overlay (Apple-style emerge animation) */}
      <ChatOverlay open={chatOpen} onClose={closeChat} originRect={chatOriginRect} />
    </div>
  );
};

const PanelToggle = ({ icon: Icon, active, onClick, testId, title, badge = 0 }) => (
  <button
    onClick={onClick}
    title={title}
    className={`relative p-2 rounded-lg transition-all ${
      active
        ? 'bg-purple-500/30 text-purple-200'
        : 'text-slate-400 hover:text-purple-300 hover:bg-purple-500/10'
    }`}
    data-testid={testId}
  >
    <Icon className="w-4 h-4" />
    {badge > 0 && (
      <span
        className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-pink-500 text-white text-[10px] font-bold flex items-center justify-center shadow-lg shadow-pink-500/40 ring-2 ring-slate-900 animate-pulse"
        data-testid={`${testId}-badge`}
      >
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
);

const ToggleSetting = ({ label, settingKey, disabled }) => {
  const { currentRoom, updateSettings } = useRoom();
  const on = currentRoom?.settings?.[settingKey] !== false;
  const [saving, setSaving] = useState(false);
  const handleToggle = async () => {
    if (disabled || saving) return;
    setSaving(true);
    await updateSettings({ [settingKey]: !on });
    setSaving(false);
  };
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${disabled ? 'text-slate-500' : 'text-slate-300'}`}>{label}</span>
      <button
        onClick={handleToggle}
        disabled={disabled || saving}
        className={`w-10 h-5 rounded-full transition-all relative ${on ? 'bg-purple-500' : 'bg-slate-700'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        data-testid={`setting-${settingKey}`}
      >
        <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all duration-200 ${on ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );
};

const PlaybackControlToggle = ({ isHostOrCo }) => {
  const { currentRoom, updateSettings, canControlPlayback } = useRoom();
  const mode = currentRoom?.settings?.playbackControl || 'everyone';
  const [saving, setSaving] = useState(false);

  const toggle = async (next) => {
    if (!isHostOrCo || saving || next === mode) return;
    setSaving(true);
    await updateSettings({ playbackControl: next });
    setSaving(false);
  };

  // Read-only badge for non-hosts so they understand the mode
  if (!isHostOrCo) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-medium ${
          mode === 'everyone'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : canControlPlayback
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            : 'bg-slate-700/40 border-slate-600/40 text-slate-400'
        }`}
        data-testid="playback-control-badge"
        title={
          mode === 'everyone'
            ? 'Everyone in this room can play / pause / skip the video'
            : canControlPlayback
            ? 'Host has allowed you to control playback'
            : 'Only the host can control playback in this room'
        }
      >
        {mode === 'everyone' ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
        {mode === 'everyone'
          ? 'Everyone can control'
          : canControlPlayback
          ? 'You can control'
          : 'Hosts-only control'}
      </div>
    );
  }

  // Host / co-host segmented control
  return (
    <div
      className="inline-flex items-center bg-slate-800/60 border border-purple-500/30 rounded-xl p-0.5 text-xs"
      data-testid="playback-control-toggle"
      role="group"
      aria-label="Playback control"
    >
      <button
        type="button"
        onClick={() => toggle('hosts-only')}
        disabled={saving}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
          mode === 'hosts-only'
            ? 'bg-purple-500/30 text-purple-100 shadow-sm'
            : 'text-slate-400 hover:text-purple-200'
        } disabled:opacity-50`}
        data-testid="playback-control-hosts-only"
        title="Only host, co-hosts, and allowed members can control playback"
      >
        <Lock className="w-3 h-3" /> Hosts only
      </button>
      <button
        type="button"
        onClick={() => toggle('everyone')}
        disabled={saving}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
          mode === 'everyone'
            ? 'bg-emerald-500/30 text-emerald-100 shadow-sm'
            : 'text-slate-400 hover:text-emerald-200'
        } disabled:opacity-50`}
        data-testid="playback-control-everyone"
        title="Anyone in the room can play / pause / skip / seek"
      >
        <Globe className="w-3 h-3" /> Everyone
      </button>
    </div>
  );
};

export default RoomView;
