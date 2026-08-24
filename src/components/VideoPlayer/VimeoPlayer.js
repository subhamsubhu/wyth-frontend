import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRoom } from '../../contexts/RoomContext';
import { useAuth } from '../../contexts/AuthContext';
import { Maximize, Minimize, RotateCw } from 'lucide-react';

const SYNC_THRESHOLD = 2; // seconds

// Singleton loader for Vimeo player.js
let vimeoApiPromise = null;
const loadVimeoAPI = () => {
  if (vimeoApiPromise) return vimeoApiPromise;
  vimeoApiPromise = new Promise((resolve, reject) => {
    if (window.Vimeo && window.Vimeo.Player) return resolve(window.Vimeo);
    const existing = document.querySelector('script[data-vimeo-player-api]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Vimeo));
      existing.addEventListener('error', reject);
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://player.vimeo.com/api/player.js';
    tag.setAttribute('data-vimeo-player-api', '1');
    tag.async = true;
    tag.onload = () => resolve(window.Vimeo);
    tag.onerror = reject;
    document.head.appendChild(tag);
  });
  return vimeoApiPromise;
};

const extractVimeoId = (url) => {
  if (!url) return null;
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
};

const VimeoPlayer = () => {
  const { videoState, playVideo, pauseVideo, seekVideo, currentRoom, playbackRate, changePlaybackRate, isInCall } = useRoom();
  const { user } = useAuth();
  const canControl = !!user && !!currentRoom;

  const containerRef = useRef(null);
  const mountRef = useRef(null);
  const playerRef = useRef(null);
  const isRemoteAction = useRef(false);
  const remoteTimer = useRef(null);

  const [ready, setReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [syncIndicator, setSyncIndicator] = useState({ status: 'synced', drift: 0 });
  const [showSpeed, setShowSpeed] = useState(false);

  const videoId = extractVimeoId(videoState.videoUrl);

  const markRemote = useCallback(() => {
    isRemoteAction.current = true;
    if (remoteTimer.current) clearTimeout(remoteTimer.current);
    remoteTimer.current = setTimeout(() => { isRemoteAction.current = false; }, 700);
  }, []);

  useEffect(() => {
    if (!videoId || !mountRef.current) return;
    let cancelled = false;

    loadVimeoAPI().then((Vimeo) => {
      if (cancelled || !mountRef.current) return;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (e) {}
        playerRef.current = null;
      }
      mountRef.current.innerHTML = '';
      const player = new Vimeo.Player(mountRef.current, {
        id: Number(videoId),
        responsive: true,
        autoplay: false,
        controls: true,
        playsinline: true,
      });
      playerRef.current = player;

      player.ready().then(() => {
        if (cancelled) return;
        setReady(true);
        // Apply current state on ready
        const t = videoState.currentTime || 0;
        const applyInitial = async () => {
          try {
            if (t > 0) { markRemote(); await player.setCurrentTime(t); }
            if (videoState.isPlaying) { markRemote(); await player.play().catch(() => {}); }
            else { markRemote(); await player.pause().catch(() => {}); }
          } catch (e) {}
        };
        applyInitial();
      });

      player.on('play', () => {
        if (isRemoteAction.current || !canControl) return;
        player.getCurrentTime().then((t) => playVideo(t || 0)).catch(() => playVideo(0));
      });
      player.on('pause', () => {
        if (isRemoteAction.current || !canControl) return;
        player.getCurrentTime().then((t) => pauseVideo(t || 0)).catch(() => pauseVideo(0));
      });
      player.on('seeked', (data) => {
        if (isRemoteAction.current || !canControl) return;
        const t = (data && typeof data.seconds === 'number') ? data.seconds : 0;
        seekVideo(t);
      });
    }).catch((e) => {
      console.error('Vimeo API load failed:', e);
    });

    return () => {
      cancelled = true;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (e) {}
      }
      playerRef.current = null;
      setReady(false);
    };
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply remote play/pause changes
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    (async () => {
      try {
        const paused = await p.getPaused();
        if (videoState.isPlaying && paused) { markRemote(); await p.play().catch(() => {}); }
        else if (!videoState.isPlaying && !paused) { markRemote(); await p.pause().catch(() => {}); }
      } catch (e) {}
    })();
  }, [videoState.isPlaying, ready, markRemote]);

  // Apply remote seek
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    (async () => {
      try {
        const cur = await p.getCurrentTime();
        const target = videoState.currentTime || 0;
        if (Math.abs(cur - target) > SYNC_THRESHOLD) {
          markRemote();
          await p.setCurrentTime(target);
        }
      } catch (e) {}
    })();
  }, [videoState.currentTime, ready, markRemote]);

  // Heartbeat-based drift correction (Vimeo)
  useEffect(() => {
    if (!ready) return;
    const driftInterval = setInterval(async () => {
      const p = playerRef.current;
      if (!p || isRemoteAction.current) return;
      try {
        const cur = await p.getCurrentTime();
        let expected = videoState.currentTime || 0;
        if (videoState.serverTimestamp && videoState.isPlaying) {
          const elapsed = (Date.now() - videoState.serverTimestamp) / 1000;
          expected += elapsed * (playbackRate || 1);
        }
        const drift = expected - cur;
        const abs = Math.abs(drift);
        // Relax thresholds during active calls (WebRTC spikes can briefly
        // stall iframe video; we don't want a constant hard-seek war).
        const greenThresh = isInCall ? 0.8 : 0.3;
        const yellowThresh = isInCall ? 3 : 1.5;
        const hardThresh = isInCall ? 6 : 2;
        if (abs < greenThresh) setSyncIndicator({ status: 'synced', drift });
        else if (abs < yellowThresh) setSyncIndicator({ status: 'correcting', drift });
        else setSyncIndicator({ status: 'desynced', drift });

        if (abs > hardThresh && videoState.isPlaying) {
          markRemote();
          await p.setCurrentTime(expected);
        }
      } catch (e) {}
    }, 500);
    return () => clearInterval(driftInterval);
  }, [ready, videoState.currentTime, videoState.serverTimestamp, videoState.isPlaying, playbackRate, markRemote, isInCall]);

  // Sync playback rate
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    (async () => {
      try { await p.setPlaybackRate(playbackRate || 1); } catch (e) {}
    })();
  }, [playbackRate, ready]);

  const toggleFS = () => {
    try {
      if (!document.fullscreenElement) { containerRef.current?.requestFullscreen(); setFullscreen(true); }
      else { document.exitFullscreen(); setFullscreen(false); }
    } catch (e) {}
  };

  const toggleLandscape = async () => {
    try {
      if (!landscape) {
        if (!document.fullscreenElement) {
          await containerRef.current?.requestFullscreen?.();
          setFullscreen(true);
        }
        try { await window.screen?.orientation?.lock?.('landscape'); } catch (e) {}
        setLandscape(true);
      } else {
        try { await window.screen?.orientation?.unlock?.(); } catch (e) {}
        if (document.fullscreenElement) {
          await document.exitFullscreen();
          setFullscreen(false);
        }
        setLandscape(false);
      }
    } catch (e) {}
  };

  if (!videoId) {
    return (
      <div className="relative w-full aspect-video bg-black rounded-2xl border border-purple-500/30 flex items-center justify-center text-slate-400 text-sm">
        Invalid Vimeo URL
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-purple-500/30"
      data-testid="vimeo-player-container"
    >
      <div ref={mountRef} className="absolute inset-0 [&_iframe]:w-full [&_iframe]:h-full" data-testid="vimeo-iframe-mount" />
      {/* Sync Status Indicator */}
      <div className="absolute top-2 left-2 flex items-center gap-2 z-10" data-testid="sync-indicator-vimeo">
        <div className={`px-2.5 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1.5 backdrop-blur-sm transition-colors shadow-lg ${
          syncIndicator.status === 'synced' ? 'bg-emerald-500/90 text-white' :
          syncIndicator.status === 'correcting' ? 'bg-yellow-500/90 text-white' :
          'bg-red-500/90 text-white'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            syncIndicator.status === 'synced' ? 'bg-white' :
            syncIndicator.status === 'correcting' ? 'bg-white animate-pulse' :
            'bg-white animate-ping'
          }`} />
          <span>
            {syncIndicator.status === 'synced' ? 'Synced' :
             syncIndicator.status === 'correcting' ? 'Syncing…' :
             'Resyncing'}
          </span>
        </div>
        <div className="px-2 py-0.5 bg-black/80 rounded text-[10px] text-purple-300 font-medium">
          Vimeo
        </div>
      </div>
      {!canControl && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-emerald-500/90 rounded-lg text-[10px] text-white pointer-events-none font-medium flex items-center gap-1 shadow-lg z-10" data-testid="viewer-mode-badge-vimeo">
          Synced playback
        </div>
      )}
      <div className="absolute top-2 right-2 flex gap-1.5 z-10">
        <div className="relative">
          <button onClick={() => setShowSpeed(s => !s)}
            className="px-2.5 py-2 bg-black/70 hover:bg-purple-500/40 backdrop-blur-sm rounded-lg text-white transition-all text-[10px] font-bold"
            data-testid="vimeo-speed" title="Playback speed">
            {playbackRate}x
          </button>
          {showSpeed && (
            <div className="absolute top-full right-0 mt-2 bg-slate-900/95 border border-purple-500/30 rounded-xl p-1.5 shadow-xl backdrop-blur-xl">
              {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(r => (
                <button key={r} onClick={() => { changePlaybackRate(r); setShowSpeed(false); }}
                  className={`block w-full px-3 py-1 text-xs rounded-lg transition-colors text-left ${playbackRate === r ? 'bg-orange-500/20 text-orange-300' : 'text-white/70 hover:bg-white/10'}`}>
                  {r}x {r === 1 && '(Normal)'}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={toggleLandscape}
          className="p-2 bg-black/70 hover:bg-purple-500/40 backdrop-blur-sm rounded-lg text-white transition-all"
          data-testid="vimeo-landscape" title={landscape ? 'Exit landscape' : 'Fit to screen (landscape)'}>
          <RotateCw className={`w-4 h-4 transition-transform ${landscape ? 'rotate-90' : ''}`} />
        </button>
        <button onClick={toggleFS}
          className="p-2 bg-black/70 hover:bg-purple-500/40 backdrop-blur-sm rounded-lg text-white transition-all"
          data-testid="vimeo-fullscreen" title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

export default VimeoPlayer;
