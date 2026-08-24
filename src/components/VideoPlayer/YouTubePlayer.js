import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRoom } from '../../contexts/RoomContext';
import { useAuth } from '../../contexts/AuthContext';
import { Maximize, Minimize, RotateCw } from 'lucide-react';

const SYNC_THRESHOLD = 2; // seconds

// Singleton loader for YouTube IFrame API
let ytApiPromise = null;
const loadYouTubeAPI = () => {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') { try { prev(); } catch (e) {} }
      resolve(window.YT);
    };
    if (!document.querySelector('script[data-yt-iframe-api]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.setAttribute('data-yt-iframe-api', '1');
      tag.async = true;
      document.head.appendChild(tag);
    }
  });
  return ytApiPromise;
};

const extractYouTubeId = (url) => {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?[^#]*v=)([\w-]{6,})/,
    /(?:youtu\.be\/)([\w-]{6,})/,
    /(?:youtube\.com\/embed\/)([\w-]{6,})/,
    /(?:youtube\.com\/shorts\/)([\w-]{6,})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
};

const YouTubePlayer = () => {
  const { videoState, playVideo, pauseVideo, seekVideo, currentRoom, playbackRate, changePlaybackRate, isInCall } = useRoom();
  const { user } = useAuth();
  const canControl = !!user && !!currentRoom;

  const containerRef = useRef(null);
  const playerDivRef = useRef(null);
  const playerRef = useRef(null);
  const isRemoteAction = useRef(false);
  const remoteTimer = useRef(null);
  const lastEmittedSeek = useRef(0);
  const lastEmittedSeekAt = useRef(0);
  const bufferingUntil = useRef(0);

  const [ready, setReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [syncIndicator, setSyncIndicator] = useState({ status: 'synced', drift: 0 });
  const [showSpeed, setShowSpeed] = useState(false);

  const videoId = extractYouTubeId(videoState.videoUrl);

  const markRemote = useCallback(() => {
    isRemoteAction.current = true;
    if (remoteTimer.current) clearTimeout(remoteTimer.current);
    remoteTimer.current = setTimeout(() => { isRemoteAction.current = false; }, 600);
  }, []);

  // Initialise player whenever videoId changes
  useEffect(() => {
    if (!videoId || !playerDivRef.current) return;
    let cancelled = false;
    let player;

    loadYouTubeAPI().then((YT) => {
      if (cancelled || !playerDivRef.current) return;
      // Destroy any existing player
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try { playerRef.current.destroy(); } catch (e) {}
        playerRef.current = null;
      }
      player = new YT.Player(playerDivRef.current, {
        videoId,
        playerVars: {
          autoplay: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            playerRef.current = player;
            setReady(true);
            // Apply current sync state immediately on ready. Clamp the
            // requested seek target against the actual video duration so a
            // stale / out-of-range timestamp can never push the IFrame
            // player into the broken / black state (this is the safety
            // net for the blank-player-on-rejoin bug).
            try {
              let t = videoState.currentTime || 0;
              const dur = typeof player.getDuration === 'function' ? player.getDuration() : 0;
              if (dur && t >= dur - 0.5) t = 0;
              if (t < 0) t = 0;
              if (t > 0) player.seekTo(t, true);
              if (videoState.isPlaying) { markRemote(); player.playVideo(); }
              else { markRemote(); player.pauseVideo(); }
            } catch (e) {}
          },
          onStateChange: (e) => {
            if (!canControl) return;
            const YTState = window.YT && window.YT.PlayerState;
            if (!YTState) return;
            // Skip events that were caused by remote sync application
            if (isRemoteAction.current) return;
            try {
              const t = player.getCurrentTime ? player.getCurrentTime() : 0;
              if (e.data === YTState.PLAYING) playVideo(t);
              else if (e.data === YTState.PAUSED) pauseVideo(t);
              else if (e.data === YTState.BUFFERING) bufferingUntil.current = Date.now() + 400;
            } catch (err) {}
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
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
    try {
      const YTState = window.YT && window.YT.PlayerState;
      const state = p.getPlayerState ? p.getPlayerState() : -1;
      const isPlaying = YTState && state === YTState.PLAYING;
      if (videoState.isPlaying && !isPlaying) { markRemote(); p.playVideo(); }
      else if (!videoState.isPlaying && isPlaying) { markRemote(); p.pauseVideo(); }
    } catch (e) {}
  }, [videoState.isPlaying, ready, markRemote]);

  // Apply remote seek. The server is the single source of truth, so we
  // apply ANY incoming seek that's outside the ~SYNC_THRESHOLD tolerance —
  // including for the originator (this snaps the originator's player back
  // to the authoritative server timestamp and prevents the "I stayed at X
  // but others moved forward" drift). To prevent a self-echo loop right
  // after WE just emitted a seek, we suppress re-seeks for 1.2s when the
  // incoming target is within 0.5s of the value we just emitted.
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    try {
      const cur = p.getCurrentTime ? p.getCurrentTime() : 0;
      let target = videoState.currentTime || 0;
      // Safety net: never seek past the actual video duration, which would
      // put the YouTube IFrame player into a broken / black state. If the
      // saved timestamp is past the end, snap back to the beginning.
      const dur = typeof p.getDuration === 'function' ? p.getDuration() : 0;
      if (dur && target >= dur - 0.5) target = 0;
      if (target < 0) target = 0;

      const justEmittedSelf =
        Math.abs(target - lastEmittedSeek.current) < 0.5 &&
        (Date.now() - lastEmittedSeekAt.current) < 1200;

      if (!justEmittedSelf && Math.abs(cur - target) > SYNC_THRESHOLD) {
        markRemote();
        p.seekTo(target, true);
      }
    } catch (e) {}
  }, [videoState.currentTime, ready, markRemote]);

  // Detect local seeks (YouTube doesn't fire a 'seek' event, so poll while
  // playing). Two important guards:
  //   1. Initialise `lastTime` from the actual player time on first tick so
  //      the very first poll doesn't mistakenly classify the natural
  //      starting offset as a 1.5s+ "jump" and emit a phantom seek.
  //   2. While `isRemoteAction` is true we keep updating `lastTime` to the
  //      current player position, so when the guard clears the next tick
  //      doesn't see the remote-applied jump as a local seek.
  useEffect(() => {
    let lastTime = null;
    let interval;
    const check = () => {
      const p = playerRef.current;
      if (!p || !ready) return;
      if (isRemoteAction.current) {
        try { lastTime = p.getCurrentTime ? p.getCurrentTime() : lastTime; } catch (e) {}
        return;
      }
      if (Date.now() < bufferingUntil.current) {
        try { lastTime = p.getCurrentTime ? p.getCurrentTime() : lastTime; } catch (e) {}
        return;
      }
      try {
        const cur = p.getCurrentTime();
        if (lastTime === null) { lastTime = cur; return; }
        // A jump larger than the natural ~0.5s playback delta between
        // polls (we tolerate up to 1.5s for buffering hiccups) is treated
        // as a real user seek.
        if (Math.abs(cur - lastTime) > 0.8) {
          lastEmittedSeek.current = cur;
          lastEmittedSeekAt.current = Date.now();
          if (canControl) seekVideo(cur);
        }
        lastTime = cur;
      } catch (e) {}
    };
    interval = setInterval(check, 500);
    return () => clearInterval(interval);
  }, [ready, canControl, seekVideo]);

  // Heartbeat-based drift correction (YouTube)
  useEffect(() => {
    if (!ready) return;
    const driftInterval = setInterval(() => {
      const p = playerRef.current;
      if (!p || isRemoteAction.current) return;
      try {
        const cur = p.getCurrentTime ? p.getCurrentTime() : 0;
        let expected = videoState.currentTime || 0;
        if (videoState.serverTimestamp && videoState.isPlaying) {
          const elapsed = (Date.now() - videoState.serverTimestamp) / 1000;
          expected += elapsed * (playbackRate || 1);
        }
        const drift = expected - cur;
        const abs = Math.abs(drift);
        // Relax thresholds during active calls to avoid hard-seek jitter
        // when WebRTC CPU/network spikes briefly stall the player.
        const greenThresh = isInCall ? 0.8 : 0.3;
        const yellowThresh = isInCall ? 3 : 1.5;
        const hardThresh = isInCall ? 6 : 2;
        if (abs < greenThresh) setSyncIndicator({ status: 'synced', drift });
        else if (abs < yellowThresh) setSyncIndicator({ status: 'correcting', drift });
        else setSyncIndicator({ status: 'desynced', drift });

        if (abs > hardThresh && videoState.isPlaying) {
          markRemote();
          p.seekTo(expected, true);
        }
      } catch (e) {}
    }, 500);
    return () => clearInterval(driftInterval);
  }, [ready, videoState.currentTime, videoState.serverTimestamp, videoState.isPlaying, playbackRate, markRemote, isInCall]);

  // Sync playback rate (YouTube IFrame API supports setPlaybackRate)
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    try {
      if (typeof p.setPlaybackRate === 'function') {
        p.setPlaybackRate(playbackRate || 1);
      }
    } catch (e) {}
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
        Invalid YouTube URL
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-purple-500/30"
      data-testid="youtube-player-container"
    >
      <div ref={playerDivRef} className="w-full h-full" data-testid="youtube-iframe-mount" />
      {/* Sync Status Indicator */}
      <div className="absolute top-2 left-2 flex items-center gap-2 z-10" data-testid="sync-indicator-yt">
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
          YouTube
        </div>
      </div>
      {!canControl && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-emerald-500/90 rounded-lg text-[10px] text-white pointer-events-none font-medium flex items-center gap-1 shadow-lg z-10" data-testid="viewer-mode-badge-yt">
          Synced playback
        </div>
      )}
      <div className="absolute top-2 right-2 flex gap-1.5 z-10">
        <div className="relative">
          <button onClick={() => setShowSpeed(s => !s)}
            className="px-2.5 py-2 bg-black/70 hover:bg-purple-500/40 backdrop-blur-sm rounded-lg text-white transition-all text-[10px] font-bold"
            data-testid="yt-speed" title="Playback speed">
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
          data-testid="yt-landscape" title={landscape ? 'Exit landscape' : 'Fit to screen (landscape)'}>
          <RotateCw className={`w-4 h-4 transition-transform ${landscape ? 'rotate-90' : ''}`} />
        </button>
        <button onClick={toggleFS}
          className="p-2 bg-black/70 hover:bg-purple-500/40 backdrop-blur-sm rounded-lg text-white transition-all"
          data-testid="yt-fullscreen" title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

export default YouTubePlayer;
