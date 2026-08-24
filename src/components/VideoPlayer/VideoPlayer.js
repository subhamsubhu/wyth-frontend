import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useRoom } from '../../contexts/RoomContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  Play, Pause, Volume2, VolumeX, Volume1,
  Maximize, Minimize, PictureInPicture2,
  SkipBack, SkipForward, Loader2,
  Rewind, FastForward, RotateCcw, Settings, RotateCw, ExternalLink
} from 'lucide-react';
import YouTubePlayer from './YouTubePlayer';
import VimeoPlayer from './VimeoPlayer';

const SYNC_THRESHOLD = 2;

const VideoPlayer = () => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const progressRef = useRef(null);
  const isRemoteAction = useRef(false);
  const hideTimer = useRef(null);
  const lastTapRef = useRef({ time: 0, side: null, timer: null });

  const { videoState, playVideo, pauseVideo, seekVideo, currentRoom, canControlPlayback, playbackRate, changePlaybackRate, isInCall } = useRoom();
  const { user } = useAuth();

  // Whether THIS user can control playback in THIS room.
  // Per room setting `playbackControl`:
  //   - 'everyone'   → all members can play / pause / seek
  //   - 'hosts-only' (default) → only host / co-hosts / members in playbackAllowList
  const canControl = !!user && !!currentRoom && !!canControlPlayback;

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverPos, setHoverPos] = useState(0);
  const [showSpeed, setShowSpeed] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [skipFeedback, setSkipFeedback] = useState(null); // 'left' | 'right' | null
  const [landscape, setLandscape] = useState(false);
  const [syncIndicator, setSyncIndicator] = useState({ status: 'synced', drift: 0 });
  const driftCheckInterval = useRef(null);
  const isCorrectingDrift = useRef(false);

  // Detect embed vs direct.
  // Drive videos always route through the iframe embed path — Google no
  // longer allows reliable cross-origin HTML5 streaming of Drive media
  // URLs, so the embedded preview is the only option that works for
  // arbitrary file sizes and codecs.
  const isEmbed = useCallback(() => {
    const url = videoState.videoUrl || '';
    return url.includes('drive.google.com') || url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com');
  }, [videoState.videoUrl]);

  const getEmbedUrl = useCallback(() => {
    const url = videoState.videoUrl || '';
    if (url.includes('drive.google.com')) {
      const m = url.match(/[-\w]{25,}/);
      if (m) return `https://drive.google.com/file/d/${m[0]}/preview`;
    }
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const m = url.match(/(?:v=|youtu\.be\/)([^&\s?]+)/);
      if (m) return `https://www.youtube.com/embed/${m[1]}?autoplay=0&rel=0&origin=${window.location.origin}`;
    }
    if (url.includes('vimeo.com')) {
      const m = url.match(/vimeo\.com\/(\d+)/);
      if (m) return `https://player.vimeo.com/video/${m[1]}`;
    }
    return url;
  }, [videoState.videoUrl]);

  // Remote sync
  // NOTE: the `isRemoteAction` guard must stay set long enough to cover the
  // ENTIRE async window between calling v.play()/v.pause()/setting currentTime
  // and the corresponding `play` / `pause` / `seeked` DOM event firing on the
  // <video> element. On slow networks / buffering the `play` event can fire
  // 600–900ms after .play() is called. If the guard is too short, handlePlay
  // / handlePause runs as if it were a user action and echoes a redundant
  // play-video / pause-video back to the server — which then re-broadcasts
  // it with the LOCAL currentTime, pulling every other client off-sync.
  useEffect(() => {
    if (!videoRef.current || isEmbed()) return;
    isRemoteAction.current = true;
    const v = videoRef.current;
    try {
      if (Math.abs(v.currentTime - videoState.currentTime) > SYNC_THRESHOLD) {
        v.currentTime = videoState.currentTime;
      }
      if (videoState.isPlaying && v.paused) v.play().catch(() => {});
      else if (!videoState.isPlaying && !v.paused) v.pause();
    } catch (e) {}
    const t = setTimeout(() => { isRemoteAction.current = false; }, 900);
    return () => clearTimeout(t);
  }, [videoState.isPlaying, videoState.currentTime, isEmbed]);

  // Server-authoritative drift correction (HTML5 direct video only).
  // Runs every 500ms while the video is playing. Compares the local
  // currentTime to the expected time derived from the server's last
  // heartbeat/event (serverTimestamp + elapsed * rate). Applies soft (rate
  // nudge) or hard (instant seek) correction depending on drift magnitude.
  useEffect(() => {
    if (!videoRef.current || isEmbed() || !videoState.isPlaying) {
      if (driftCheckInterval.current) {
        clearInterval(driftCheckInterval.current);
        driftCheckInterval.current = null;
      }
      setSyncIndicator({ status: 'synced', drift: 0 });
      return;
    }

    driftCheckInterval.current = setInterval(() => {
      if (isRemoteAction.current || isCorrectingDrift.current) return;
      const v = videoRef.current;
      if (!v || v.paused) return;

      let expectedTime = videoState.currentTime || 0;
      if (videoState.serverTimestamp) {
        const elapsed = (Date.now() - videoState.serverTimestamp) / 1000;
        expectedTime += elapsed * (playbackRate || 1);
      }

      const cur = v.currentTime;
      const drift = expectedTime - cur;
      const abs = Math.abs(drift);

      // During an active call, WebRTC's network/CPU spikes can briefly stall
      // the video element. We don't want every spike to trigger a hard seek
      // because that's a jarring jump while the user is on a call. Relax
      // both thresholds significantly — we'll still re-sync after the call
      // ends.
      const softThresh = isInCall ? 1.5 : 0.5;
      const hardThresh = isInCall ? 6 : 2;
      const greenThresh = isInCall ? 0.8 : 0.3;
      const yellowThresh = isInCall ? 3 : 1.5;

      if (abs < greenThresh) {
        setSyncIndicator({ status: 'synced', drift });
      } else if (abs < yellowThresh) {
        setSyncIndicator({ status: 'correcting', drift });
      } else {
        setSyncIndicator({ status: 'desynced', drift });
      }

      if (abs > hardThresh) {
        // Hard resync: instant seek
        isRemoteAction.current = true;
        try { v.currentTime = expectedTime; } catch (e) {}
        setTimeout(() => { isRemoteAction.current = false; }, 800);
      } else if (abs > softThresh) {
        // Soft correction: nudge playback rate temporarily
        isCorrectingDrift.current = true;
        const correctionRate = drift > 0 ? 1.05 : 0.95;
        try { v.playbackRate = (playbackRate || 1) * correctionRate; } catch (e) {}
        const ms = Math.min(2500, Math.max(400, abs * 1000));
        setTimeout(() => {
          if (videoRef.current && !isRemoteAction.current) {
            try { videoRef.current.playbackRate = playbackRate || 1; } catch (e) {}
          }
          isCorrectingDrift.current = false;
        }, ms);
      }
    }, 500);

    return () => {
      if (driftCheckInterval.current) {
        clearInterval(driftCheckInterval.current);
        driftCheckInterval.current = null;
      }
    };
  }, [videoState.isPlaying, videoState.currentTime, videoState.serverTimestamp, playbackRate, isEmbed, isInCall]);

  // Apply room playback-rate changes locally (skip during in-flight drift nudge).
  useEffect(() => {
    if (videoRef.current && playbackRate && !isCorrectingDrift.current && !isEmbed()) {
      try { videoRef.current.playbackRate = playbackRate; } catch (e) {}
    }
  }, [playbackRate, isEmbed]);

  // Auto-hide controls
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (playing) setShowControls(false); }, 3000);
  }, [playing]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('mousemove', resetHideTimer);
    el.addEventListener('touchstart', resetHideTimer);
    return () => {
      el.removeEventListener('mousemove', resetHideTimer);
      el.removeEventListener('touchstart', resetHideTimer);
      clearTimeout(hideTimer.current);
    };
  }, [resetHideTimer]);

  const togglePlay = () => {
    if (!canControl) return;
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const handlePlay = () => {
    if (isRemoteAction.current) { setPlaying(true); return; }
    setPlaying(true);
    if (canControl) playVideo(videoRef.current?.currentTime || 0);
  };
  const handlePause = () => {
    if (isRemoteAction.current) { setPlaying(false); return; }
    setPlaying(false);
    if (canControl) pauseVideo(videoRef.current?.currentTime || 0);
  };
  const handleTimeUpdate = () => { if (videoRef.current) setCurrentTime(videoRef.current.currentTime); };
  const handleLoaded = () => { if (videoRef.current) { setDuration(videoRef.current.duration); setVideoError(false); } };
  const handleError = () => setVideoError(true);

  // After a remote seek finishes buffering, the HTML5 video element may
  // still be paused even though the server's authoritative state says
  // playing. We resolve this by re-attempting play() once the seek finishes
  // (the `seeked` event fires after currentTime has been jumped and at
  // least one frame is ready). This is the safety-net that guarantees
  // EVERY viewer resumes after a peer skips, instead of getting "stuck at
  // the seeked point until the skipper presses play again".
  const handleSeeked = () => {
    const v = videoRef.current;
    if (!v) return;
    if (videoState.isPlaying && v.paused) {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  };
  const handleCanPlay = () => {
    setBuffering(false);
    setVideoError(false);
    const v = videoRef.current;
    if (!v) return;
    // Same safety-net: if the room state says we should be playing but
    // the local element is still paused (e.g. after a stall mid-seek),
    // resume playback automatically.
    if (videoState.isPlaying && v.paused) {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  };

  const seek = (e) => {
    if (!canControl) return;
    if (!progressRef.current || !videoRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const raw = ((e.clientX - rect.left) / rect.width) * duration;
    // CLAMP before BOTH applying locally AND broadcasting. Previously the
    // broadcast value was unclamped, so if the user clicked at the very edge
    // of the bar we'd push currentTime > duration to every other client,
    // which freezes their player at the end while the originator (whose
    // value was clamped) stays at duration — the exact "I'm at X, others
    // moved forward" symptom the user reported.
    const t = Math.max(0, Math.min(raw, duration));
    // CRITICAL: changing currentTime on the HTML5 video element while it is
    // playing will often emit spurious `pause` (during buffer load) and
    // `play` events as side-effects of the seek. Without a guard those
    // events bubble into handlePause / handlePlay which then echo a
    // pause-video / play-video back to the server, racing with the
    // seek-video broadcast and leaving other clients stuck. Hold the
    // remote-action flag for the whole seek window to suppress that echo.
    isRemoteAction.current = true;
    videoRef.current.currentTime = t;
    seekVideo(t);
    setTimeout(() => { isRemoteAction.current = false; }, 1200);
  };

  const handleProgressHover = (e) => {
    if (!progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    setHoverTime(pos * duration);
    setHoverPos(e.clientX - rect.left);
  };

  const skip = (sec) => {
    if (!canControl) return;
    if (!videoRef.current) return;
    const t = Math.max(0, Math.min(videoRef.current.currentTime + sec, duration));
    // Same protection as in seek(): suppress the spurious pause/play
    // events that fire while the HTML5 video buffers around the new
    // position. Otherwise those events would echo back to the server and
    // race with the seek-video broadcast, freezing other clients.
    isRemoteAction.current = true;
    videoRef.current.currentTime = t;
    seekVideo(t);
    setTimeout(() => { isRemoteAction.current = false; }, 1200);
  };

  const handleVolume = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v); setMuted(v === 0);
    if (videoRef.current) videoRef.current.volume = v;
  };

  const toggleMute = () => {
    const m = !muted; setMuted(m);
    if (videoRef.current) videoRef.current.volume = m ? 0 : volume || 1;
  };

  const toggleFS = () => {
    try {
      if (!document.fullscreenElement) { containerRef.current?.requestFullscreen(); setFullscreen(true); }
      else { document.exitFullscreen(); setFullscreen(false); }
    } catch (e) {}
  };

  const togglePIP = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (videoRef.current) await videoRef.current.requestPictureInPicture();
    } catch (e) {}
  };

  // Landscape / fit-to-screen mode: enters fullscreen + locks orientation to landscape (mobile)
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
    } catch (e) { console.warn('Landscape error:', e); }
  };

  // Single tap toggles play, double tap on left/right seeks ±10s
  const handleVideoTap = (e) => {
    if (!videoRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX || e.changedTouches?.[0]?.clientX || 0) - rect.left;
    const side = x < rect.width / 2 ? 'left' : 'right';
    const now = Date.now();
    const last = lastTapRef.current;
    if (last.timer) { clearTimeout(last.timer); last.timer = null; }
    if (now - last.time < 320 && last.side === side) {
      // Double tap: skip ±10s
      skip(side === 'left' ? -10 : 10);
      setSkipFeedback(side);
      setTimeout(() => setSkipFeedback(null), 600);
      lastTapRef.current = { time: 0, side: null, timer: null };
    } else {
      // Single tap: delay action in case a second tap comes
      lastTapRef.current = {
        time: now,
        side,
        timer: setTimeout(() => {
          togglePlay();
          lastTapRef.current = { time: 0, side: null, timer: null };
        }, 320)
      };
    }
  };

  const changeSpeed = (rate) => {
    changePlaybackRate(rate);
    setShowSpeed(false);
  };

  const fmt = (s) => {
    if (!s || isNaN(s)) return '0:00:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const progress = duration ? (currentTime / duration) * 100 : 0;

  // No video
  if (!videoState.videoUrl) {
    return (
      <div className="relative w-full aspect-video bg-black rounded-2xl border border-purple-500/20 flex items-center justify-center" data-testid="video-empty">
        <div className="text-center px-4">
          <Play className="w-16 h-16 text-purple-500/30 mx-auto mb-3" />
          <p className="text-slate-400">No video loaded</p>
          <p className="text-slate-600 text-xs mt-1">Upload a file or paste a link</p>
        </div>
      </div>
    );
  }

  // Embedded (YouTube / Drive / Vimeo)
  if (isEmbed()) {
    const url = videoState.videoUrl || '';
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    const isVimeo = url.includes('vimeo.com');

    if (isYouTube) return <YouTubePlayer />;
    if (isVimeo) return <VimeoPlayer />;

    // Google Drive: no public JS control API for the preview iframe.
    // We render a polished glass panel with a premium amber/gold accent,
    // a clear "limited sync" hint, and a top-right action chip to retry as
    // a direct HTML5 stream.
    return (
      <div ref={containerRef} className="relative w-full aspect-video bg-gradient-to-br from-black via-slate-950 to-black rounded-2xl overflow-hidden border border-amber-500/20 shadow-[0_8px_40px_-12px_rgba(251,191,36,0.25)]" data-testid="video-drive-embed">
        {/* Soft animated halo behind the iframe */}
        <div aria-hidden className="absolute inset-0 pointer-events-none opacity-60">
          <div className="absolute -top-20 -left-20 w-72 h-72 bg-amber-500/15 blur-3xl rounded-full" />
          <div className="absolute -bottom-24 -right-16 w-72 h-72 bg-fuchsia-500/15 blur-3xl rounded-full" />
        </div>

        <iframe src={getEmbedUrl()} className="relative w-full h-full border-0"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
          title="Video" referrerPolicy="strict-origin-when-cross-origin" data-testid="video-iframe" />

        {/* Top-left: Drive source pill (premium dark glass + gradient ring) */}
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
          <div className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-black/55 backdrop-blur-xl border border-white/10 shadow-lg">
            <svg viewBox="0 0 87.3 78" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
              <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z" fill="#00ac47" />
              <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 11.5z" fill="#ea4335" />
              <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
              <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
              <path d="M73.4 26.5 60.7 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
            </svg>
            <span className="text-[11px] tracking-wide font-semibold bg-gradient-to-r from-amber-300 to-amber-100 bg-clip-text text-transparent">From Drive</span>
          </div>
          {/* Limited-sync chip — amber, glass, animated dot */}
          <div className="hidden xs:flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/30 backdrop-blur-xl shadow-lg" data-testid="drive-sync-note">
            <span className="relative inline-flex w-1.5 h-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-300" />
            </span>
            <span className="text-[10px] font-medium text-amber-100/90">Limited sync · embed</span>
          </div>
        </div>

        {/* Top-right: control chips */}
        <div className="absolute top-2 right-2 flex gap-1.5 z-10">
          {videoState.videoUrl && (
            <a href={videoState.videoUrl} target="_blank" rel="noopener noreferrer"
              className="px-2.5 py-2 bg-black/55 hover:bg-amber-500/25 backdrop-blur-xl border border-white/10 hover:border-amber-300/50 rounded-lg text-white/90 hover:text-white text-[10px] font-semibold transition-all shadow-lg flex items-center gap-1.5"
              data-testid="drive-open-tab" title="Open in Google Drive">
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open</span>
            </a>
          )}
          <button onClick={toggleLandscape}
            className="p-2 bg-black/55 hover:bg-amber-500/25 backdrop-blur-xl border border-white/10 hover:border-amber-300/50 rounded-lg text-white transition-all shadow-lg"
            data-testid="embed-landscape" title={landscape ? 'Exit landscape' : 'Fit to screen (landscape)'}>
            <RotateCw className={`w-4 h-4 transition-transform ${landscape ? 'rotate-90' : ''}`} />
          </button>
          <button onClick={toggleFS}
            className="p-2 bg-black/55 hover:bg-amber-500/25 backdrop-blur-xl border border-white/10 hover:border-amber-300/50 rounded-lg text-white transition-all shadow-lg"
            data-testid="embed-fullscreen" title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>

        {/* Viewer-mode badge (kept, but premium glass) */}
        {!canControl && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/55 backdrop-blur-xl border border-emerald-400/40 shadow-lg z-10" data-testid="viewer-mode-badge-embed">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
            <span className="text-[10px] font-semibold text-emerald-100">Synced playback</span>
          </div>
        )}
      </div>
    );
  }

  // Direct video with VLC-style controls
  return (
    <div ref={containerRef} className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-purple-500/30 select-none" onDoubleClick={toggleFS} data-testid="video-direct-container">
      <video ref={videoRef} src={videoState.videoUrl} className="w-full h-full object-contain" playsInline
        onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoaded} onDurationChange={handleLoaded}
        onPlay={handlePlay} onPause={handlePause}
        onWaiting={() => setBuffering(true)} onPlaying={() => { setBuffering(false); setVideoError(false); }}
        onCanPlay={handleCanPlay} onSeeked={handleSeeked} onError={handleError}
        onClick={handleVideoTap} data-testid="video-element" />

      {/* Double-tap skip feedback */}
      {skipFeedback && (
        <div className={`absolute top-1/2 -translate-y-1/2 ${skipFeedback === 'left' ? 'left-8' : 'right-8'} pointer-events-none z-10`}>
          <div className="flex flex-col items-center bg-black/60 backdrop-blur-sm rounded-full p-4 animate-pulse">
            {skipFeedback === 'left' ? <Rewind className="w-8 h-8 text-white" /> : <FastForward className="w-8 h-8 text-white" />}
            <span className="text-xs text-white font-medium mt-1">10s</span>
          </div>
        </div>
      )}

      {/* Invisible double-tap zones (don't block controls) */}
      <div className="absolute inset-0 grid grid-cols-2 pointer-events-none">
        <div className="pointer-events-auto" onDoubleClick={(e) => { e.stopPropagation(); skip(-10); setSkipFeedback('left'); setTimeout(() => setSkipFeedback(null), 600); }} style={{ height: 'calc(100% - 60px)' }} />
        <div className="pointer-events-auto" onDoubleClick={(e) => { e.stopPropagation(); skip(10); setSkipFeedback('right'); setTimeout(() => setSkipFeedback(null), 600); }} style={{ height: 'calc(100% - 60px)' }} />
      </div>

      {/* Buffering */}
      {buffering && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
          <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
        </div>
      )}

      {/* Viewer mode badge */}
      {!canControl && !videoError && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-emerald-500/90 rounded-lg text-[10px] text-white pointer-events-none font-medium flex items-center gap-1 shadow-lg z-10" data-testid="viewer-mode-badge">
          Synced playback
        </div>
      )}

      {/* Sync Status Indicator */}
      {!videoError && duration > 0 && (
        <div className="absolute top-2 left-2 flex items-center gap-2 z-10" data-testid="sync-indicator">
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
        </div>
      )}

      {/* Error */}
      {videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-4 z-20">
          <div className="text-center max-w-md">
            <RotateCcw className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-white font-medium text-base mb-2">Can't play this video</p>
            <p className="text-slate-400 text-xs mb-1">Most likely cause: the file uses a codec your browser doesn't support (e.g. HEVC/H.265 from a phone camera).</p>
            <p className="text-slate-400 text-xs mb-4">Re-encode to <span className="text-purple-300 font-mono">H.264 / MP4</span>, or paste a YouTube / Google Drive / Vimeo link instead.</p>
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => { setVideoError(false); videoRef.current?.load(); }}
                className="px-3 py-1.5 text-xs bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 rounded-lg text-purple-300 transition-colors"
                data-testid="retry-video-btn">
                Retry
              </button>
              <a href={videoState.videoUrl} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-300 transition-colors">
                Open in new tab
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Center play button on pause */}
      {!playing && !buffering && !videoError && duration > 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 bg-purple-500/80 rounded-full flex items-center justify-center backdrop-blur-sm">
            <Play className="w-8 h-8 text-white ml-1" />
          </div>
        </div>
      )}

      {/* VLC-Style Controls */}
      <div className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Progress bar */}
        <div className="px-3">
          <div ref={progressRef} className={`group/bar relative w-full h-1 hover:h-2 bg-white/15 transition-all rounded-full ${canControl ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            onClick={canControl ? seek : undefined} onMouseMove={handleProgressHover} onMouseLeave={() => setHoverTime(null)}
            data-testid="video-progress-bar">
            {/* Buffered */}
            <div className="absolute top-0 left-0 h-full bg-white/10 rounded-full" style={{ width: '100%' }} />
            {/* Played */}
            <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-[width] duration-100" style={{ width: `${progress}%` }}>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg scale-0 group-hover/bar:scale-100 transition-transform" />
            </div>
            {/* Hover preview */}
            {hoverTime !== null && (
              <div className="absolute -top-8 bg-black/90 px-2 py-0.5 rounded text-[10px] text-white font-mono" style={{ left: Math.max(0, hoverPos - 25) }}>
                {fmt(hoverTime)}
              </div>
            )}
          </div>
        </div>

        {/* Control bar */}
        <div className={`flex items-center gap-1 px-3 py-2.5 bg-gradient-to-t from-black/95 via-black/70 to-transparent ${!canControl ? 'opacity-90' : ''}`}>
          {/* Left controls */}
          <div className={`flex items-center gap-1 ${!canControl ? 'opacity-50 pointer-events-none' : ''}`} data-testid="playback-controls">
            <CtrlBtn onClick={togglePlay} testId="play-pause" title={playing ? 'Pause (synced)' : 'Play (synced)'}>
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </CtrlBtn>
            <CtrlBtn onClick={() => skip(-10)} testId="rwd-10" title="Rewind 10s"><Rewind className="w-4 h-4" /></CtrlBtn>
            <CtrlBtn onClick={() => skip(10)} testId="fwd-10" title="Forward 10s"><FastForward className="w-4 h-4" /></CtrlBtn>
            <CtrlBtn onClick={() => skip(-30)} testId="rwd-30" title="Back 30s"><SkipBack className="w-4 h-4" /></CtrlBtn>
            <CtrlBtn onClick={() => skip(30)} testId="fwd-30" title="Skip 30s"><SkipForward className="w-4 h-4" /></CtrlBtn>
          </div>

          {/* Volume (always available — it's local-only) */}
          <div className="flex items-center gap-1 ml-1">
            <CtrlBtn onClick={toggleMute} testId="mute" title={muted ? 'Unmute' : 'Mute'}>
              <VolumeIcon className="w-4 h-4" />
            </CtrlBtn>
            <input type="range" min="0" max="1" step="0.02" value={muted ? 0 : volume} onChange={handleVolume}
              className="w-20 h-1 accent-orange-500 cursor-pointer hidden sm:block" />
          </div>

          {/* Center - Time */}
          <div className="flex-1 text-center">
            <span className="text-xs text-white/80 font-mono tracking-wide">
              {fmt(currentTime)} <span className="text-white/40">/</span> {fmt(duration)}
            </span>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1 relative">
            {/* Speed */}
            <div className="relative">
              <CtrlBtn onClick={() => setShowSpeed(!showSpeed)} testId="speed" title="Playback Speed">
                <span className="text-[10px] font-bold">{playbackRate}x</span>
              </CtrlBtn>
              {showSpeed && (
                <div className="absolute bottom-full right-0 mb-2 bg-slate-900/95 border border-purple-500/30 rounded-xl p-1.5 shadow-xl backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(r => (
                    <button key={r} onClick={() => changeSpeed(r)}
                      className={`block w-full px-3 py-1 text-xs rounded-lg transition-colors text-left ${playbackRate === r ? 'bg-orange-500/20 text-orange-300' : 'text-white/70 hover:bg-white/10'}`}>
                      {r}x {r === 1 && '(Normal)'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <CtrlBtn onClick={togglePIP} testId="pip" title="Picture in Picture" className="hidden sm:flex"><PictureInPicture2 className="w-4 h-4" /></CtrlBtn>
            <CtrlBtn onClick={toggleLandscape} testId="landscape" title={landscape ? 'Exit landscape' : 'Fit to screen (landscape)'}>
              <RotateCw className={`w-4 h-4 transition-transform ${landscape ? 'rotate-90' : ''}`} />
            </CtrlBtn>
            <CtrlBtn onClick={toggleFS} testId="fullscreen" title={fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
              {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </CtrlBtn>
          </div>
        </div>
      </div>
    </div>
  );
};

// Control button component
const CtrlBtn = ({ onClick, children, testId, title, className = '' }) => (
  <button onClick={onClick} data-testid={testId} title={title}
    className={`p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center ${className}`}>
    {children}
  </button>
);

export default VideoPlayer;
