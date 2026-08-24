import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getSocket } from '../../services/socket';
import { useAuth } from '../../contexts/AuthContext';
import { useRoom } from '../../contexts/RoomContext';
import { useLuxeRipple } from '../../hooks/use-luxe-ripple';
import {
  Phone, PhoneOff, Video, VideoOff, Mic, MicOff,
  Monitor, MonitorOff, X, GripHorizontal, Maximize2, Minimize2,
  Volume2, VolumeX, RefreshCw
} from 'lucide-react';

// ─── ICE / STUN+TURN ────────────────────────────────────────────────────────
// Robust mix of public STUN + multiple free TURN providers. Having more than
// one TURN provider means a single outage / rate-limit no longer kills the
// call (WhatsApp uses similar redundant relays). Order matters: faster
// providers first so ICE picks the lowest-latency path.
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    // OpenRelay (Metered) — free public TURN
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    // ExpressTURN — free public backup TURN (different network path)
    { urls: 'turn:relay1.expressturn.com:3478', username: 'ef9TBPK4Y2WAQH5KGM', credential: 'kBHYV0LFsZJzZZQk' }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

const VIDEO_MAX_BITRATE = 1_200_000;
const VIDEO_MAX_FRAMERATE = 24;

const PIP_DEFAULT_W = 200;
const PIP_DEFAULT_H = 280;
const PIP_MIN_W = 140;
const PIP_MIN_H = 200;
const EDGE_PAD = 8;
// Compact threshold: only flip into "icons only / no PIP" layout for genuinely
// tiny windows. The previous 200px threshold meant the default popup was
// already compact, which hid the local self-view (so users couldn't see both
// faces during a call). Anything <= 160px is now considered compact.
const COMPACT_W = 160;
// Controls auto-hide delay (WhatsApp: 3s of inactivity)
const CONTROLS_HIDE_DELAY_MS = 3000;

// ─── Ringtone helpers (WhatsApp-style) ──────────────────────────────────────
// We synthesize the ring tones with Web Audio so there's no need to ship
// audio assets. The patterns mimic WhatsApp's outgoing & incoming cadence.
function createTonePlayer({ pattern, gain = 0.08 }) {
  let ctx = null;
  let intervalId = null;
  let activeNodes = [];

  const play = () => {
    if (intervalId) return;
    try {
      // eslint-disable-next-line no-undef
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    } catch (e) { return; }

    const tick = () => {
      if (!ctx) return;
      const now = ctx.currentTime;
      activeNodes.forEach(n => { try { n.stop(); } catch (e) {} });
      activeNodes = [];
      pattern.forEach(({ freq, start, duration }) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, now + start);
        g.gain.linearRampToValueAtTime(gain, now + start + 0.02);
        g.gain.linearRampToValueAtTime(gain, now + start + duration - 0.05);
        g.gain.linearRampToValueAtTime(0, now + start + duration);
        osc.connect(g).connect(ctx.destination);
        osc.start(now + start);
        osc.stop(now + start + duration + 0.05);
        activeNodes.push(osc);
      });
    };
    tick();
    intervalId = setInterval(tick, 3000);
  };

  const stop = () => {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
    activeNodes.forEach(n => { try { n.stop(); } catch (e) {} });
    activeNodes = [];
    if (ctx) { try { ctx.close(); } catch (e) {} ctx = null; }
  };

  return { play, stop };
}

// Outgoing "ringback" — two short tones every 3s (440Hz/480Hz like a phone)
const OUTGOING_PATTERN = [
  { freq: 440, start: 0.0, duration: 0.4 },
  { freq: 480, start: 0.0, duration: 0.4 },
  { freq: 440, start: 0.6, duration: 0.4 },
  { freq: 480, start: 0.6, duration: 0.4 }
];
// Incoming ring — louder, more melodic 4-note pattern
const INCOMING_PATTERN = [
  { freq: 880, start: 0.0, duration: 0.25 },
  { freq: 1320, start: 0.3, duration: 0.25 },
  { freq: 880, start: 0.6, duration: 0.25 },
  { freq: 1320, start: 0.9, duration: 0.25 }
];

const CallPanel = () => {
  const { user } = useAuth();
  const { currentRoom, setIsInCall } = useRoom();

  const [inCall, setInCall] = useState(false);
  const [callType, setCallType] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [facingMode, setFacingMode] = useState('user');

  const initX = typeof window !== 'undefined' ? window.innerWidth - PIP_DEFAULT_W - EDGE_PAD : 0;
  const initY = 72;
  const [position, setPosition] = useState({ x: initX, y: initY });
  const positionRef = useRef({ x: initX, y: initY });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const wrapperRef = useRef(null);
  const rafRef = useRef(null);

  const [size, setSize] = useState({ w: PIP_DEFAULT_W, h: PIP_DEFAULT_H });
  const sizeRef = useRef({ w: PIP_DEFAULT_W, h: PIP_DEFAULT_H });
  const [resizing, setResizing] = useState(null);
  const resizeStart = useRef({ mx: 0, my: 0, w: 0, h: 0, x: 0, y: 0 });
  const pinchStart = useRef({ dist: 0, w: 0, h: 0 });

  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimerRef = useRef(null);
  const tapStartRef = useRef({ x: 0, y: 0, t: 0, moved: false });

  const [fsElement, setFsElement] = useState(
    typeof document !== 'undefined'
      ? (document.fullscreenElement || document.webkitFullscreenElement || null)
      : null
  );

  const [incomingCall, setIncomingCall] = useState(null);
  const [outgoingCall, setOutgoingCall] = useState(null);

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peersRef = useRef({});
  const peerMetaRef = useRef({}); // peerId -> { polite, makingOffer, ignoreOffer, name }
  const pendingIceRef = useRef({});
  const callStartRef = useRef(null);
  const inCallRef = useRef(false);
  const outgoingTimeoutRef = useRef(null);
  const lastIncomingKeyRef = useRef(null);
  const hadRemoteStreamRef = useRef(false);
  const wakeLockRef = useRef(null);
  const ringInRef = useRef(null);
  const ringOutRef = useRef(null);

  const socket = getSocket();
  const roomId = currentRoom?.id;
  const emitRipple = useLuxeRipple();

  useEffect(() => {
    const update = () => {
      const el = document.fullscreenElement || document.webkitFullscreenElement || null;
      setFsElement(el);
    };
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
  }, []);

  const scheduleHideControls = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY_MS);
  }, []);

  // Show controls + (re)arm the 3s auto-hide timer. WhatsApp behaviour:
  // any tap / interaction inside the call popup reveals the buttons with a
  // smooth fade and then re-hides them after 3s of inactivity.
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    if (!inCall || expanded) return;
    // Whenever the call starts (or controls re-appear) re-arm the 3s
    // auto-hide timer so they fade out after a period of inactivity.
    if (controlsVisible) scheduleHideControls();
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  }, [controlsVisible, inCall, expanded, scheduleHideControls]);

  // When a call begins, make sure controls are visible (with the 3s timer
  // already running). This guarantees the buttons appear immediately so the
  // user can interact (e.g. hang up) without having to first tap the popup.
  useEffect(() => {
    if (inCall) showControls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inCall]);

  useEffect(() => () => {
    if (outgoingTimeoutRef.current) clearTimeout(outgoingTimeoutRef.current);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    ringInRef.current?.stop?.();
    ringOutRef.current?.stop?.();
    if (wakeLockRef.current) { try { wakeLockRef.current.release(); } catch (e) {} }
  }, []);

  useEffect(() => { inCallRef.current = inCall; }, [inCall]);

  // Publish call state to the rest of the app so the video player can relax
  // drift-correction thresholds during a call (otherwise the heartbeat hard
  // seeks fight with the WebRTC CPU/network spikes and the video stutters).
  useEffect(() => {
    if (typeof setIsInCall === 'function') setIsInCall(inCall);
  }, [inCall, setIsInCall]);

  // ─── Wake Lock — keep screen awake during calls (WhatsApp behaviour) ──────
  useEffect(() => {
    let cancelled = false;
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator && inCall) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch (e) { /* not supported / denied */ }
    };
    const release = () => {
      if (wakeLockRef.current) {
        try { wakeLockRef.current.release(); } catch (e) {}
        wakeLockRef.current = null;
      }
    };
    if (inCall) acquire(); else release();
    const onVis = () => { if (!cancelled && inCall && document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVis); release(); };
  }, [inCall]);

  // ─── Ringtones ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (incomingCall && !inCall) {
      ringInRef.current = createTonePlayer({ pattern: INCOMING_PATTERN, gain: 0.12 });
      ringInRef.current.play();
    } else {
      ringInRef.current?.stop?.();
      ringInRef.current = null;
    }
    return () => { ringInRef.current?.stop?.(); ringInRef.current = null; };
  }, [incomingCall, inCall]);

  useEffect(() => {
    if (outgoingCall && remoteStreams.length === 0 && inCall) {
      ringOutRef.current = createTonePlayer({ pattern: OUTGOING_PATTERN, gain: 0.06 });
      ringOutRef.current.play();
    } else {
      ringOutRef.current?.stop?.();
      ringOutRef.current = null;
    }
    return () => { ringOutRef.current?.stop?.(); ringOutRef.current = null; };
  }, [outgoingCall, remoteStreams.length, inCall]);

  const attachLocalVideo = useCallback((node) => {
    localVideoRef.current = node;
    if (node && localStreamRef.current) {
      try { node.srcObject = localStreamRef.current; } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      try { localVideoRef.current.srcObject = localStream; } catch (e) {}
    }
  }, [localStream, expanded, videoEnabled, callType, remoteStreams.length]);

  useEffect(() => {
    if (!inCall) { setCallDuration(0); return; }
    callStartRef.current = Date.now();
    const id = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [inCall]);

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    Object.values(peersRef.current).forEach(pc => { try { pc.close(); } catch (e) {} });
    peersRef.current = {};
    peerMetaRef.current = {};
    pendingIceRef.current = {};
    localStreamRef.current = null;
    screenStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams([]);
    setReconnecting(false);
  }, []);

  const flushPendingIce = useCallback(async (peerId) => {
    const pc = peersRef.current[peerId];
    const queue = pendingIceRef.current[peerId];
    if (!pc || !queue || !queue.length) return;
    pendingIceRef.current[peerId] = [];
    for (const cand of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
    }
  }, []);

  const restartIceFor = useCallback(async (peerId) => {
    const pc = peersRef.current[peerId];
    const meta = peerMetaRef.current[peerId];
    if (!pc || !socket || !roomId) return;
    // Only the impolite side restarts to avoid double-restart glare.
    if (meta && meta.polite) return;
    try {
      meta.makingOffer = true;
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      socket.emit('webrtc-offer', { roomId, targetUserId: peerId, offer: pc.localDescription });
    } catch (e) { /* ignore */ }
    finally { if (meta) meta.makingOffer = false; }
  }, [socket, roomId]);

  const createPeerConnection = useCallback((peerId, peerName, { polite }) => {
    if (peersRef.current[peerId]) return peersRef.current[peerId];
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current[peerId] = pc;
    peerMetaRef.current[peerId] = { polite, makingOffer: false, ignoreOffer: false, name: peerName };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        try {
          const sender = pc.addTrack(track, localStreamRef.current);
          if (track.kind === 'video' && sender) {
            try {
              const params = sender.getParameters();
              if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
              params.encodings[0].maxBitrate = VIDEO_MAX_BITRATE;
              params.encodings[0].maxFramerate = VIDEO_MAX_FRAMERATE;
              sender.setParameters(params).catch(() => {});
            } catch (e) {}
          }
        } catch (e) {}
      });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit('ice-candidate', { roomId, targetUserId: peerId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      hadRemoteStreamRef.current = true;
      if (outgoingTimeoutRef.current) {
        clearTimeout(outgoingTimeoutRef.current);
        outgoingTimeoutRef.current = null;
      }
      setOutgoingCall(null);
      setRemoteStreams(prev => {
        const ex = prev.find(s => s.peerId === peerId);
        if (ex) return prev.map(s => s.peerId === peerId ? { ...s, stream } : s);
        return [...prev, { peerId, peerName: peerName || 'User', stream }];
      });
      setConnecting(false);
      setReconnecting(false);
    };

    // Perfect-negotiation onnegotiationneeded — handles renegotiation
    // (e.g. screen share replaceTrack adding new media) without glare.
    pc.onnegotiationneeded = async () => {
      const meta = peerMetaRef.current[peerId];
      if (!meta || !socket) return;
      try {
        meta.makingOffer = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { roomId, targetUserId: peerId, offer: pc.localDescription });
      } catch (e) { /* ignore */ }
      finally { meta.makingOffer = false; }
    };

    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      if (st === 'disconnected') {
        setReconnecting(true);
        // Give the network a chance to self-heal, then trigger ICE restart.
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            restartIceFor(peerId);
          }
        }, 2000);
      } else if (st === 'failed') {
        restartIceFor(peerId);
      } else if (st === 'connected' || st === 'completed') {
        setReconnecting(false);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        restartIceFor(peerId);
      } else if (pc.connectionState === 'closed') {
        setRemoteStreams(prev => prev.filter(s => s.peerId !== peerId));
        delete peersRef.current[peerId];
        delete peerMetaRef.current[peerId];
        delete pendingIceRef.current[peerId];
      }
    };

    return pc;
  }, [socket, roomId, restartIceFor]);

  // ─── WebRTC signaling (Perfect Negotiation) ───────────────────────────────
  useEffect(() => {
    if (!socket || !roomId) return;

    const myId = user?.uid;

    const onUserJoinedCall = async ({ userId, userName }) => {
      if (!inCallRef.current || !localStreamRef.current || userId === myId) return;
      try {
        // Existing participant is "impolite" (polite=false). They initiate offer.
        const polite = myId > userId;
        const pc = createPeerConnection(userId, userName, { polite });
        const meta = peerMetaRef.current[userId];
        if (!meta) return;
        meta.makingOffer = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { roomId, targetUserId: userId, offer: pc.localDescription });
        meta.makingOffer = false;
      } catch (e) { console.error('Offer error:', e); }
    };

    // Backend emits `existing-participant` to a newcomer when they join an
    // already-active call, listing each peer who was already there. Without
    // this handler the callee waits for the caller's offer to arrive, which
    // can race with the callee's getUserMedia on mobile and occasionally
    // leave one side with no remote track. We proactively create the peer
    // connection (as the polite side) and let perfect-negotiation glare
    // resolution sort out who actually issues the offer.
    const onExistingParticipant = ({ userId, userName }) => {
      if (!inCallRef.current || !localStreamRef.current || userId === myId) return;
      if (peersRef.current[userId]) return;
      try {
        const polite = myId > userId; // newcomer is polite vs existing peers
        createPeerConnection(userId, userName, { polite });
      } catch (e) { console.error('existing-participant error:', e); }
    };

    const onOffer = async ({ fromUserId, fromUserName, targetUserId, offer }) => {
      if (!inCallRef.current || fromUserId === myId) return;
      if (targetUserId && targetUserId !== myId) return;
      try {
        const polite = myId > fromUserId;
        const pc = peersRef.current[fromUserId] || createPeerConnection(fromUserId, fromUserName, { polite });
        const meta = peerMetaRef.current[fromUserId];

        // Perfect negotiation glare handling
        const offerCollision = meta.makingOffer || pc.signalingState !== 'stable';
        meta.ignoreOffer = !polite && offerCollision;
        if (meta.ignoreOffer) return;

        if (offerCollision) {
          await Promise.all([
            pc.setLocalDescription({ type: 'rollback' }).catch(() => {}),
            pc.setRemoteDescription(new RTCSessionDescription(offer))
          ]);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
        }
        await flushPendingIce(fromUserId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', { roomId, targetUserId: fromUserId, answer: pc.localDescription });
      } catch (e) { console.error('Answer error:', e); }
    };

    const onAnswer = async ({ fromUserId, targetUserId, answer }) => {
      if (!inCallRef.current || fromUserId === myId) return;
      if (targetUserId && targetUserId !== myId) return;
      const pc = peersRef.current[fromUserId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          await flushPendingIce(fromUserId);
        } catch (e) { console.error('setRemote answer error:', e); }
      }
    };

    const onIce = async ({ fromUserId, targetUserId, candidate }) => {
      if (!inCallRef.current || fromUserId === myId || !candidate) return;
      if (targetUserId && targetUserId !== myId) return;
      const pc = peersRef.current[fromUserId];
      if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
        pendingIceRef.current[fromUserId] = pendingIceRef.current[fromUserId] || [];
        pendingIceRef.current[fromUserId].push(candidate);
        return;
      }
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (e) {
        const meta = peerMetaRef.current[fromUserId];
        if (!meta?.ignoreOffer) console.warn('addIceCandidate', e);
      }
    };

    const onUserLeftCall = ({ userId }) => {
      const pc = peersRef.current[userId];
      if (pc) { try { pc.close(); } catch (e) {} delete peersRef.current[userId]; }
      delete peerMetaRef.current[userId];
      delete pendingIceRef.current[userId];
      setRemoteStreams(prev => prev.filter(s => s.peerId !== userId));
    };

    socket.on('user-joined-call', onUserJoinedCall);
    socket.on('existing-participant', onExistingParticipant);
    socket.on('webrtc-offer', onOffer);
    socket.on('webrtc-answer', onAnswer);
    socket.on('ice-candidate', onIce);
    socket.on('user-left-call', onUserLeftCall);

    return () => {
      socket.off('user-joined-call', onUserJoinedCall);
      socket.off('existing-participant', onExistingParticipant);
      socket.off('webrtc-offer', onOffer);
      socket.off('webrtc-answer', onAnswer);
      socket.off('ice-candidate', onIce);
      socket.off('user-left-call', onUserLeftCall);
    };
  }, [socket, roomId, user, createPeerConnection, flushPendingIce]);

  // Incoming-call lifecycle listeners
  useEffect(() => {
    if (!socket || !roomId) return;

    // Pre-request OS notification permission so the very first incoming
    // call doesn't get swallowed by the permission prompt itself.
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch (e) {}

    let activeNotification = null;

    const showOsNotification = (payload) => {
      try {
        if (typeof Notification === 'undefined') return;
        if (Notification.permission !== 'granted') return;
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
        const isVideo = payload.callType === 'video';
        activeNotification = new Notification(
          `${isVideo ? '📹' : '📞'} Incoming ${isVideo ? 'video' : 'voice'} call`,
          {
            body: `${payload.initiatorName || 'Someone'} is calling you on WYTH`,
            tag: `wyth-call-${payload.roomId}`,
            renotify: true,
            requireInteraction: true,
            silent: false,
          }
        );
        activeNotification.onclick = () => {
          try { window.focus(); } catch (e) {}
          try { activeNotification.close(); } catch (e) {}
        };
      } catch (e) { /* notification API unavailable */ }
    };

    const tryVibrate = () => {
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          // WhatsApp-style ring pattern
          navigator.vibrate([400, 200, 400, 200, 400, 200, 400]);
        }
      } catch (e) {}
    };

    const onIncomingCall = (payload) => {
      if (!payload || payload.initiatorId === user?.uid) return;
      if (inCallRef.current) return;
      const key = `${payload.roomId}:${payload.initiatorId}:${payload.startedAt}`;
      if (lastIncomingKeyRef.current === key) return;
      lastIncomingKeyRef.current = key;
      setIncomingCall(payload);
      showOsNotification(payload);
      tryVibrate();
    };

    const onCallInitiated = (payload) => setOutgoingCall(payload);
    const onCallAccepted = () => setOutgoingCall(null);
    const onCallRejected = () => {
      setOutgoingCall(null);
      if (inCallRef.current && remoteStreams.length === 0) {
        endCall();
      }
    };

    const onCallEnded = ({ reason } = {}) => {
      setIncomingCall(null);
      setOutgoingCall(null);
      lastIncomingKeyRef.current = null;
      if (activeNotification) {
        try { activeNotification.close(); } catch (e) {}
        activeNotification = null;
      }
      try { navigator.vibrate && navigator.vibrate(0); } catch (e) {}
      if (outgoingTimeoutRef.current) {
        clearTimeout(outgoingTimeoutRef.current);
        outgoingTimeoutRef.current = null;
      }
      if (inCallRef.current) {
        inCallRef.current = false;
        cleanup();
        setInCall(false);
        setCallType(null);
        setAudioEnabled(true);
        setVideoEnabled(true);
        setScreenSharing(false);
        setExpanded(false);
        setConnecting(false);
        hadRemoteStreamRef.current = false;
      }
    };

    // Re-check on (re)connect — if a call was already active in the room
    // we should still get an `incoming-call` event back from the server.
    const onSocketConnect = () => {
      try { socket.emit('check-active-call', { roomId }); } catch (e) {}
    };

    socket.on('incoming-call', onIncomingCall);
    socket.on('call-initiated', onCallInitiated);
    socket.on('call-accepted', onCallAccepted);
    socket.on('call-rejected', onCallRejected);
    socket.on('call-ended', onCallEnded);
    socket.on('connect', onSocketConnect);
    socket.io?.on?.('reconnect', onSocketConnect);

    socket.emit('check-active-call', { roomId });

    return () => {
      socket.off('incoming-call', onIncomingCall);
      socket.off('call-initiated', onCallInitiated);
      socket.off('call-accepted', onCallAccepted);
      socket.off('call-rejected', onCallRejected);
      socket.off('call-ended', onCallEnded);
      socket.off('connect', onSocketConnect);
      socket.io?.off?.('reconnect', onSocketConnect);
      if (activeNotification) {
        try { activeNotification.close(); } catch (e) {}
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, roomId, user, cleanup]);

  // ─── Smooth drag (transform writes via rAF) ───────────────────────────────
  const applyTransform = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${positionRef.current.x}px, ${positionRef.current.y}px, 0)`;
  }, []);

  useEffect(() => {
    positionRef.current = position;
    applyTransform();
  }, [position, applyTransform]);

  useEffect(() => { sizeRef.current = size; }, [size]);

  useEffect(() => {
    if (!dragging || expanded) return;

    const onMove = (e) => {
      if (e.touches && e.touches.length >= 2) return;
      const point = e.touches ? e.touches[0] : e;
      const host = fsElement || document.documentElement;
      const hostRect = host.getBoundingClientRect ? host.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      const localX = point.clientX - hostRect.left;
      const localY = point.clientY - hostRect.top;
      const w = sizeRef.current.w;
      const h = sizeRef.current.h;
      const hostW = hostRect.width || window.innerWidth;
      const hostH = hostRect.height || window.innerHeight;
      const minX = -w * 0.75;
      const minY = -h * 0.5;
      const maxX = hostW - w * 0.25;
      const maxY = hostH - h * 0.25;
      let nx = localX - dragOffset.current.x;
      let ny = localY - dragOffset.current.y;
      nx = Math.max(minX, Math.min(maxX, nx));
      ny = Math.max(minY, Math.min(maxY, ny));
      positionRef.current = { x: nx, y: ny };
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(applyTransform);
      if (e.cancelable) e.preventDefault();
    };

    const onUp = () => {
      setDragging(false);
      setPosition({ ...positionRef.current });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
    };
  }, [dragging, expanded, fsElement, applyTransform]);

  useEffect(() => {
    if (!resizing || expanded) return;
    const onMove = (e) => {
      if (resizing === 'pinch' && e.touches && e.touches.length >= 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const scale = dist / (pinchStart.current.dist || 1);
        const host = fsElement || document.documentElement;
        const hostRect = host.getBoundingClientRect ? host.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
        const maxW = hostRect.width - 8;
        const maxH = hostRect.height - 8;
        const newW = Math.max(PIP_MIN_W, Math.min(maxW, pinchStart.current.w * scale));
        const newH = Math.max(PIP_MIN_H, Math.min(maxH, pinchStart.current.h * scale));
        setSize({ w: newW, h: newH });
        if (e.cancelable) e.preventDefault();
        return;
      }
      const point = e.touches ? e.touches[0] : e;
      const s = resizeStart.current;
      const host = fsElement || document.documentElement;
      const hostRect = host.getBoundingClientRect ? host.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
      const dx = point.clientX - s.mx;
      const dy = point.clientY - s.my;
      const maxW = hostRect.width - 8;
      const maxH = hostRect.height - 8;
      let newW, newH, newX = s.x;
      const newY = s.y;
      if (resizing === 'br') {
        newW = Math.max(PIP_MIN_W, Math.min(maxW - Math.max(0, s.x), s.w + dx));
        newH = Math.max(PIP_MIN_H, Math.min(maxH - Math.max(0, s.y), s.h + dy));
      } else {
        const rightEdge = s.x + s.w;
        newW = Math.max(PIP_MIN_W, Math.min(rightEdge, s.w - dx));
        newX = Math.max(-newW * 0.5, rightEdge - newW);
        newH = Math.max(PIP_MIN_H, Math.min(maxH - Math.max(0, s.y), s.h + dy));
      }
      setSize({ w: newW, h: newH });
      if (newX !== s.x) {
        positionRef.current = { x: newX, y: newY };
        setPosition({ x: newX, y: newY });
      }
      if (e.cancelable) e.preventDefault();
    };
    const onUp = () => setResizing(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
    };
  }, [resizing, expanded, fsElement]);

  const startResize = (corner) => (e) => {
    if (expanded) return;
    const point = e.touches ? e.touches[0] : e;
    resizeStart.current = {
      mx: point.clientX, my: point.clientY,
      w: sizeRef.current.w, h: sizeRef.current.h,
      x: positionRef.current.x, y: positionRef.current.y
    };
    setResizing(corner);
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
  };

  const onWrapperPointerDown = (e) => {
    if (expanded) return;
    const tag = e.target.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || e.target.closest('button')) return;
    if (e.target.dataset && e.target.dataset.resizeHandle) return;

    if (e.touches && e.touches.length >= 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      pinchStart.current = {
        dist: Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY),
        w: sizeRef.current.w,
        h: sizeRef.current.h
      };
      setResizing('pinch');
      if (e.cancelable) e.preventDefault();
      return;
    }

    const point = e.touches ? e.touches[0] : e;
    const host = fsElement || document.documentElement;
    const hostRect = host.getBoundingClientRect ? host.getBoundingClientRect() : { left: 0, top: 0 };
    const localX = point.clientX - hostRect.left;
    const localY = point.clientY - hostRect.top;
    dragOffset.current = {
      x: localX - positionRef.current.x,
      y: localY - positionRef.current.y
    };
    tapStartRef.current = { x: point.clientX, y: point.clientY, t: Date.now(), moved: false };
    setDragging(true);
    if (e.cancelable) e.preventDefault();
  };

  useEffect(() => {
    if (!inCall) return;
    if (dragging) return;
    if (!tapStartRef.current || !tapStartRef.current.t) return;
    const dt = Date.now() - tapStartRef.current.t;
    const start = tapStartRef.current;
    tapStartRef.current = { x: 0, y: 0, t: 0, moved: false };
    if (dt > 0 && dt < 250) {
      const moved = Math.hypot(positionRef.current.x - (start.x - dragOffset.current.x), positionRef.current.y - (start.y - dragOffset.current.y)) > 6;
      // WhatsApp behaviour: a tap on the popup always *reveals* the
      // controls (and re-arms the 3s timer). It never toggles them off —
      // that was the source of the "have to click many times to cut the
      // call" complaint: a tap that the user thought was opening controls
      // was actually hiding the ones that just appeared.
      if (!moved) showControls();
    }
  }, [dragging, inCall, showControls]);

  useEffect(() => {
    if (!inCall) return;
    const reclamp = () => {
      const host = fsElement || document.documentElement;
      const hostRect = host.getBoundingClientRect ? host.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
      const w = sizeRef.current.w;
      const h = sizeRef.current.h;
      const maxX = (hostRect.width || window.innerWidth) - w - EDGE_PAD;
      const maxY = (hostRect.height || window.innerHeight) - h - EDGE_PAD;
      const nx = Math.max(EDGE_PAD, Math.min(maxX, positionRef.current.x));
      const ny = Math.max(EDGE_PAD, Math.min(maxY, positionRef.current.y));
      if (nx !== positionRef.current.x || ny !== positionRef.current.y) {
        setPosition({ x: nx, y: ny });
      }
    };
    reclamp();
    window.addEventListener('resize', reclamp);
    window.addEventListener('orientationchange', reclamp);
    return () => {
      window.removeEventListener('resize', reclamp);
      window.removeEventListener('orientationchange', reclamp);
    };
  }, [fsElement, inCall]);

  // ─── Call lifecycle ───────────────────────────────────────────────────────
  const buildConstraints = (type, facing = 'user') => ({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1
    },
    video: type === 'video'
      ? {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 24, max: 30 },
          facingMode: facing
        }
      : false
  });

  const enterCallWithMedia = async (type) => {
    const stream = await navigator.mediaDevices.getUserMedia(buildConstraints(type, 'user'));
    localStreamRef.current = stream;
    inCallRef.current = true;
    setLocalStream(stream);
    setCallType(type);
    setInCall(true);
    setVideoEnabled(type === 'video');
    setAudioEnabled(true);
    setExpanded(false);
    setConnecting(false);
    setControlsVisible(true);
    setFacingMode('user');
    socket.emit('join-call', { roomId, callType: type });
  };

  const startCall = async (type) => {
    if (!socket) { alert('Not connected. Please refresh.'); return; }
    try {
      setConnecting(true);
      socket.emit('initiate-call', { roomId, callType: type });
      if (outgoingTimeoutRef.current) clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = setTimeout(() => {
        if (!hadRemoteStreamRef.current) {
          try { socket.emit('cancel-call', { roomId }); } catch (e) {}
          endCall();
        }
      }, 45_000);
      await enterCallWithMedia(type);
    } catch (err) {
      setConnecting(false);
      if (outgoingTimeoutRef.current) {
        clearTimeout(outgoingTimeoutRef.current);
        outgoingTimeoutRef.current = null;
      }
      try { socket.emit('cancel-call', { roomId }); } catch (e) {}
      console.error('Call start error:', err);
      if (err.name === 'NotAllowedError') {
        alert('Camera/microphone access denied. Please allow access in browser settings.');
      } else if (err.name === 'NotFoundError') {
        alert('No camera/microphone found on this device.');
      } else {
        alert('Cannot start call: ' + err.message);
      }
    }
  };

  const acceptIncomingCall = async () => {
    if (!incomingCall) return;
    const type = incomingCall.callType || 'voice';
    try {
      setConnecting(true);
      socket.emit('accept-call', { roomId });
      setIncomingCall(null);
      await enterCallWithMedia(type);
    } catch (err) {
      setConnecting(false);
      console.error('Accept call error:', err);
      if (err.name === 'NotAllowedError') {
        alert('Camera/microphone access denied. Please allow access in browser settings.');
      } else if (err.name === 'NotFoundError') {
        alert('No camera/microphone found on this device.');
      } else {
        alert('Cannot join call: ' + err.message);
      }
    }
  };

  const rejectIncomingCall = () => {
    if (!incomingCall) return;
    socket?.emit('reject-call', { roomId });
    socket?.emit('cancel-call', { roomId });
    setIncomingCall(null);
    lastIncomingKeyRef.current = null;
  };

  const endCall = () => {
    inCallRef.current = false;
    setIncomingCall(null);
    setOutgoingCall(null);
    lastIncomingKeyRef.current = null;
    cleanup();
    if (outgoingTimeoutRef.current) {
      clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = null;
    }
    if (socket) {
      socket.emit('cancel-call', { roomId });
      socket.emit('leave-call', { roomId });
    }
    setInCall(false);
    setCallType(null);
    setAudioEnabled(true);
    setVideoEnabled(true);
    setScreenSharing(false);
    setExpanded(false);
    setConnecting(false);
    hadRemoteStreamRef.current = false;
  };

  const toggleAudio = () => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setAudioEnabled(track.enabled);
      socket?.emit('toggle-audio', { roomId, isAudioEnabled: track.enabled });
    }
  };

  const toggleVideo = () => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setVideoEnabled(track.enabled);
      socket?.emit('toggle-video', { roomId, isVideoEnabled: track.enabled });
    }
  };

  // Switch front/rear camera (WhatsApp-style)
  const switchCamera = async () => {
    if (!localStreamRef.current || callType !== 'video') return;
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia(buildConstraints('video', newFacing));
      const newVideoTrack = newStream.getVideoTracks()[0];
      const newAudioTrack = newStream.getAudioTracks()[0];

      // Replace video track on every peer connection
      Object.values(peersRef.current).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender && newVideoTrack) sender.replaceTrack(newVideoTrack);
      });

      // Replace track on the local MediaStream so the preview also updates
      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
      if (oldVideoTrack) {
        localStreamRef.current.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }
      localStreamRef.current.addTrack(newVideoTrack);
      // Drop the duplicate audio captured by getUserMedia (we kept the original)
      if (newAudioTrack) newAudioTrack.stop();

      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      setFacingMode(newFacing);
    } catch (err) {
      console.error('switchCamera error:', err);
    }
  };

  // Toggle speaker (route audio to speakerphone). Uses setSinkId where
  // supported (Chrome/Edge desktop). On mobile we just toggle volume gain.
  const toggleSpeaker = () => {
    setSpeakerOn(prev => {
      const next = !prev;
      // setSinkId-based switching happens inside RemoteAudio component
      // via the speakerOn prop. Nothing else needed here.
      return next;
    });
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      setScreenSharing(false);
      socket?.emit('stop-screen-share', { roomId });
      if (localStreamRef.current) {
        const camTrack = localStreamRef.current.getVideoTracks()[0];
        Object.values(peersRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender && camTrack) sender.replaceTrack(camTrack);
        });
      }
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'monitor', frameRate: { ideal: 15, max: 30 }, width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 } },
          audio: true
        });
        screenStreamRef.current = screen;
        setScreenSharing(true);
        socket?.emit('start-screen-share', { roomId });
        const screenTrack = screen.getVideoTracks()[0];
        try { screenTrack.contentHint = 'detail'; } catch (e) {}

        Object.values(peersRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
            try {
              const params = sender.getParameters();
              if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
              params.encodings[0].maxBitrate = 2_500_000;
              params.encodings[0].maxFramerate = 30;
              sender.setParameters(params).catch(() => {});
            } catch (e) {}
          } else if (screenTrack) {
            try { pc.addTrack(screenTrack, screen); } catch (e) {}
          }
        });

        screenTrack.onended = () => {
          setScreenSharing(false);
          socket?.emit('stop-screen-share', { roomId });
          if (localStreamRef.current) {
            const camTrack = localStreamRef.current.getVideoTracks()[0];
            Object.values(peersRef.current).forEach(pc => {
              const sender = pc.getSenders().find(s => s.track?.kind === 'video');
              if (sender && camTrack) sender.replaceTrack(camTrack);
            });
          }
        };
      } catch (err) { console.error('Screen share error:', err); }
    }
  };

  const fmtDuration = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const incomingModal = incomingCall && !inCall ? (
    <IncomingCallModal
      call={incomingCall}
      onAccept={acceptIncomingCall}
      onReject={rejectIncomingCall}
      connecting={connecting}
    />
  ) : null;

  if (!inCall) {
    return (
      <>
        <div className="flex items-center gap-2" data-testid="call-buttons">
          <button
            onClick={(e) => { emitRipple(e); startCall('voice'); }}
            disabled={connecting}
            className="btn-luxe btn-luxe-success btn-luxe-pill px-4 py-2 text-sm"
            data-testid="voice-call-btn">
            <Phone className="w-4 h-4" /> <span className="hidden sm:inline">Voice</span>
          </button>
          <button
            onClick={(e) => { emitRipple(e); startCall('video'); }}
            disabled={connecting}
            className="btn-luxe btn-luxe-info btn-luxe-pill px-4 py-2 text-sm"
            data-testid="video-call-btn">
            <Video className="w-4 h-4" /> <span className="hidden sm:inline">Video</span>
          </button>
        </div>
        {incomingModal}
      </>
    );
  }

  const total = remoteStreams.length + 1;
  const isFullscreen = expanded;
  const gridCols = total <= 1 ? 1 : total === 2 ? 1 : total <= 4 ? 2 : 3;
  const isCompact = !isFullscreen && size.w < COMPACT_W;
  const isRinging = remoteStreams.length === 0 && !!outgoingCall;

  const Avatar = ({ name, size: avSize = 'lg' }) => (
    <div className={`rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center text-white font-bold ${
      avSize === 'lg' ? 'w-20 h-20 text-2xl' : avSize === 'md' ? 'w-12 h-12 text-base' : 'w-8 h-8 text-xs'
    }`}>
      {(name || 'U')[0].toUpperCase()}
    </div>
  );

  const wrapperStyle = isFullscreen
    ? { position: 'fixed', inset: 0, width: '100vw', height: '100vh', borderRadius: 0, transform: 'none', zIndex: 2147483647 }
    : { position: 'fixed', left: 0, top: 0, transform: `translate3d(${position.x}px, ${position.y}px, 0)`, width: size.w, height: size.h, borderRadius: 16, touchAction: 'none', willChange: 'transform', zIndex: 2147483647 };

  const floatingWindow = (
    <div
      ref={wrapperRef}
      className={`bg-slate-950/95 backdrop-blur-2xl border-2 border-purple-500/40 shadow-2xl shadow-purple-500/30 overflow-hidden flex flex-col ${!isFullscreen ? 'cursor-grab select-none' : ''} ${dragging ? 'cursor-grabbing ring-2 ring-purple-400/60' : ''}`}
      style={wrapperStyle}
      onMouseDown={onWrapperPointerDown}
      onTouchStart={onWrapperPointerDown}
      data-testid="call-floating-window"
    >
      {(isFullscreen || controlsVisible) && (
        <div
          onMouseDown={(e) => {
            if (e.target.closest('button')) e.stopPropagation();
          }}
          onTouchStart={(e) => {
            if (e.target.closest('button')) e.stopPropagation();
          }}
          className={`flex items-center justify-between px-2 py-1.5 bg-slate-900/85 border-b border-purple-500/30 select-none shrink-0 transition-opacity duration-300 ease-out ${controlsVisible || isFullscreen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {!isFullscreen && <GripHorizontal className="w-3 h-3 text-slate-500 shrink-0" />}
            <span className="text-[11px] font-semibold text-white flex items-center gap-1 min-w-0">
              {callType === 'video' ? <Video className="w-3 h-3 text-blue-400 shrink-0" /> : <Phone className="w-3 h-3 text-green-400 shrink-0" />}
              {!isCompact && <span className="truncate">{callType === 'video' ? 'Video' : 'Voice'}</span>}
            </span>
            {!isCompact && (
              <span className="text-[10px] text-purple-300 bg-purple-500/15 px-1.5 py-0.5 rounded-full shrink-0">{total}</span>
            )}
            <span className="text-[10px] text-slate-400 font-mono shrink-0">
              {isRinging ? 'Ringing…' : fmtDuration(callDuration)}
            </span>
            {reconnecting && (
              <span className="text-[10px] text-amber-300 font-semibold shrink-0 flex items-center gap-0.5">
                <RefreshCw className="w-3 h-3 animate-spin" />{!isCompact && 'Reconnecting'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); emitRipple(e); showControls(); setExpanded(!isFullscreen); }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ touchAction: 'manipulation' }}
              className="btn-luxe btn-luxe-neutral btn-luxe-round !p-1.5 !border-transparent !bg-transparent hover:!bg-purple-500/15 hover:!border-purple-400/30 text-slate-300 hover:text-purple-200"
              data-testid="toggle-call-fullscreen" title={isFullscreen ? 'Minimize' : 'Maximize'}>
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); emitRipple(e); endCall(); }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ touchAction: 'manipulation' }}
              className="btn-luxe btn-luxe-danger btn-luxe-round !p-1.5 !border-transparent !bg-transparent hover:!bg-red-500/20 hover:!border-red-400/40 text-slate-300 hover:text-red-300"
              data-testid="close-call-btn" aria-label="End call" title="End call">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 relative bg-slate-950 min-h-0">
        {callType === 'voice' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-3 bg-gradient-to-br from-slate-900 via-purple-950/60 to-slate-900">
            <div className="relative mb-2">
              <div className={`absolute inset-0 rounded-full ${isRinging ? 'bg-green-500/40' : 'bg-purple-500/30'} animate-ping`} />
              <div className="relative">
                <Avatar name={user?.displayName || user?.email} size={isFullscreen ? 'lg' : isCompact ? 'sm' : 'md'} />
              </div>
            </div>
            {!isCompact && (
              <>
                <p className="text-white font-medium text-xs truncate max-w-full">{user?.displayName || 'You'}</p>
                <p className="text-slate-400 text-[10px] mt-0.5 text-center">
                  {isRinging ? 'Calling…' : remoteStreams.length === 0 ? (connecting ? 'Waiting…' : 'Active') : `${remoteStreams.length} connected`}
                </p>
              </>
            )}
            {remoteStreams.map(({ peerId, stream }) => (
              <RemoteAudio key={peerId} stream={stream} speakerOn={speakerOn} />
            ))}
          </div>
        )}

        {callType === 'video' && (
          <>
            {remoteStreams.length === 0 ? (
              <div className="absolute inset-0">
                {videoEnabled ? (
                  <video ref={attachLocalVideo} autoPlay muted playsInline className="w-full h-full object-cover bg-slate-900" style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-purple-950">
                    <Avatar name={user?.displayName || user?.email} size={isCompact ? 'sm' : 'md'} />
                  </div>
                )}
                <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[9px] text-white">You</div>
                {isRinging && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="w-12 h-12 border-2 border-green-400 border-t-transparent rounded-full animate-spin mb-2" />
                    <p className="text-white text-xs font-semibold">Calling…</p>
                  </div>
                )}
              </div>
            ) : remoteStreams.length === 1 ? (
              <div className="absolute inset-0">
                <RemoteVideo stream={remoteStreams[0].stream} name={remoteStreams[0].peerName} large />
                {/* Local self-view PIP — always rendered during a 1:1 video call
                    (WhatsApp-style "both faces visible" behaviour). Size scales
                    with the popup so it stays usable in compact mode. */}
                <div
                  className={`absolute bottom-2 right-2 ${
                    isFullscreen ? 'w-32 h-44' : isCompact ? 'w-12 h-16' : 'w-20 h-28'
                  } bg-slate-800 rounded-lg overflow-hidden border-2 border-white/30 shadow-xl ring-1 ring-black/20 pointer-events-none`}
                  data-testid="local-self-view"
                >
                  {videoEnabled ? (
                    <video ref={attachLocalVideo} autoPlay muted playsInline className="w-full h-full object-cover" style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-800">
                      <Avatar name={user?.displayName || user?.email} size="sm" />
                    </div>
                  )}
                  {!audioEnabled && (
                    <div className="absolute top-0.5 right-0.5 p-0.5 bg-red-500/90 rounded-full">
                      <MicOff className="w-2 h-2 text-white" />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 p-1 grid gap-1 overflow-auto" style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
                <div className="relative aspect-video bg-slate-800 rounded-md overflow-hidden min-h-0">
                  {videoEnabled ? (
                    <video ref={attachLocalVideo} autoPlay muted playsInline className="w-full h-full object-cover" style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-purple-900">
                      <Avatar name={user?.displayName || user?.email} size="sm" />
                    </div>
                  )}
                  <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-black/70 px-1 py-px rounded text-white">You</span>
                </div>
                {remoteStreams.map(({ peerId, peerName, stream }) => (
                  <RemoteVideo key={peerId} stream={stream} name={peerName} />
                ))}
              </div>
            )}
            {/* Need to also render remote audio for video calls */}
            {remoteStreams.map(({ peerId, stream }) => (
              <RemoteAudio key={`a-${peerId}`} stream={stream} speakerOn={speakerOn} />
            ))}
          </>
        )}

        {!isFullscreen && !controlsVisible && (
          <div
            className="absolute inset-0 z-10 cursor-pointer"
            data-testid="call-tap-to-show"
            aria-label="Tap to show controls"
            // No content — purely a capture layer so that any tap on the call
            // popup (including the video surface, where pointer events on the
            // <video> element can swallow taps on some mobile browsers) reveals
            // the WhatsApp-style controls with a smooth fade.
            onClick={(e) => { e.stopPropagation(); showControls(); }}
            onTouchEnd={(e) => { e.stopPropagation(); showControls(); }}
            style={{ background: 'transparent' }}
          />
        )}
      </div>

      {(isFullscreen || controlsVisible) && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => showControls()}
          className={`flex items-center justify-center ${isFullscreen ? 'gap-3 py-3 px-4' : 'gap-1.5 py-2 px-2'} bg-slate-900/85 border-t border-purple-500/20 shrink-0 transition-opacity duration-300 ease-out ${controlsVisible || isFullscreen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          style={{ touchAction: 'auto', pointerEvents: 'auto' }}
          data-testid="call-controls"
        >
          <ControlBtn compact={!isFullscreen} onClick={() => { showControls(); toggleAudio(); }} active={audioEnabled}
            icon={audioEnabled ? Mic : MicOff} testId="toggle-mic"
            title={audioEnabled ? 'Mute mic' : 'Unmute mic'} />
          {callType === 'video' && (
            <ControlBtn compact={!isFullscreen} onClick={() => { showControls(); toggleVideo(); }} active={videoEnabled}
              icon={videoEnabled ? Video : VideoOff} testId="toggle-cam"
              title={videoEnabled ? 'Turn off camera' : 'Turn on camera'} />
          )}
          {callType === 'video' && !isCompact && (
            <ControlBtn compact={!isFullscreen} onClick={() => { showControls(); switchCamera(); }} active={true}
              icon={RefreshCw} testId="switch-camera-btn"
              title="Switch camera" />
          )}
          <ControlBtn compact={!isFullscreen} onClick={() => { showControls(); toggleSpeaker(); }} active={speakerOn}
            icon={speakerOn ? Volume2 : VolumeX} testId="toggle-speaker"
            title={speakerOn ? 'Speaker on' : 'Speaker off'} />
          {!isCompact && callType === 'video' && (
            <ControlBtn compact={!isFullscreen} onClick={() => { showControls(); toggleScreenShare(); }} active={!screenSharing}
              icon={screenSharing ? MonitorOff : Monitor} testId="toggle-screen"
              color={screenSharing ? 'btn-luxe-success' : undefined}
              title={screenSharing ? 'Stop sharing' : 'Share screen'} />
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); emitRipple(e); endCall(); }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ touchAction: 'manipulation' }}
            className={`btn-luxe btn-luxe-danger btn-luxe-round ${isFullscreen ? '!p-4' : '!p-2.5'}`}
            data-testid="end-call-btn" aria-label="End call" title="End call">
            <PhoneOff className={isFullscreen ? 'w-6 h-6' : 'w-4 h-4'} />
          </button>
        </div>
      )}

      {!isFullscreen && (
        <>
          <div
            data-resize-handle="bl"
            onMouseDown={startResize('bl')}
            onTouchStart={startResize('bl')}
            className="absolute bottom-0 left-0 w-5 h-5 cursor-sw-resize z-20 flex items-end justify-start"
            data-testid="resize-handle-bl"
            title="Drag to resize"
            style={{ touchAction: 'none' }}
          >
            <span data-resize-handle="bl" className="block w-3 h-3 m-0.5 border-b-2 border-l-2 border-purple-400/70 hover:border-purple-300 rounded-bl-md" />
          </div>
          <div
            data-resize-handle="br"
            onMouseDown={startResize('br')}
            onTouchStart={startResize('br')}
            className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-20 flex items-end justify-end"
            data-testid="resize-handle-br"
            title="Drag to resize"
            style={{ touchAction: 'none' }}
          >
            <span data-resize-handle="br" className="block w-3 h-3 m-0.5 border-b-2 border-r-2 border-purple-400/70 hover:border-purple-300 rounded-br-md" />
          </div>
        </>
      )}
    </div>
  );

  const portalTarget = fsElement || (typeof document !== 'undefined' ? document.body : null);

  return (
    <>
      {portalTarget ? createPortal(floatingWindow, portalTarget) : floatingWindow}
      {incomingModal}
    </>
  );
};

// ─── Incoming Call Popup ─────────────────────────────────────────────────────
const IncomingCallModal = ({ call, onAccept, onReject, connecting }) => {
  const isVideo = call.callType === 'video';
  const emitRipple = useLuxeRipple();
  const [fsElement, setFsElement] = useState(
    typeof document !== 'undefined' ? document.fullscreenElement : null
  );

  useEffect(() => {
    const onFsChange = () => setFsElement(document.fullscreenElement || null);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const popup = (
    <div
      className="fixed top-4 right-4 z-[2147483647] w-[300px] max-w-[calc(100vw-2rem)] pointer-events-auto"
      data-testid="incoming-call-modal"
      role="dialog"
      aria-label="Incoming call"
      style={{ animation: 'slideInRight 0.25s ease-out' }}
    >
      <div className="relative bg-slate-900/95 backdrop-blur-xl border border-purple-500/50 rounded-2xl shadow-2xl shadow-purple-900/50 overflow-hidden">
        <div className={`absolute top-0 left-0 right-0 h-1 ${isVideo ? 'bg-blue-500' : 'bg-green-500'} animate-pulse`} />
        <div className="flex items-center gap-3 p-3">
          <div className="relative shrink-0">
            <div className={`absolute inset-0 rounded-full ${isVideo ? 'bg-blue-500/40' : 'bg-green-500/40'} animate-ping`} />
            <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center text-white font-bold text-lg">
              {(call.initiatorName || 'U')[0].toUpperCase()}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-purple-300 font-semibold leading-tight flex items-center gap-1">
              {isVideo ? <Video className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
              Incoming {isVideo ? 'Video' : 'Voice'}
            </p>
            <p className="text-sm font-bold text-white truncate leading-tight mt-0.5" data-testid="incoming-call-caller-name">
              {call.initiatorName || 'Someone'}
            </p>
            <p className="text-[10px] text-slate-400 truncate leading-tight">is calling you…</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={(e) => { emitRipple(e); onReject?.(e); }}
              disabled={connecting}
              title="Decline" aria-label="Decline call"
              className="btn-luxe btn-luxe-danger btn-luxe-round !p-0 !w-10 !h-10"
              data-testid="reject-call-btn">
              <PhoneOff className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={(e) => { emitRipple(e); onAccept?.(e); }}
              disabled={connecting}
              title="Accept" aria-label="Accept call"
              className={`btn-luxe btn-luxe-round !p-0 !w-10 !h-10 ${isVideo ? 'btn-luxe-info' : 'btn-luxe-success'} ${connecting ? 'animate-pulse' : ''}`}
              data-testid="accept-call-btn">
              {isVideo ? <Video className="w-4 h-4 text-white" /> : <Phone className="w-4 h-4 text-white" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const target = fsElement || (typeof document !== 'undefined' ? document.body : null);
  if (!target) return popup;
  return createPortal(popup, target);
};

const ControlBtn = ({ onClick, active, icon: Icon, testId, color, title, compact }) => {
  const emitRipple = useLuxeRipple();
  const lastFireRef = useRef(0);
  const tone = color ? color : active ? 'btn-luxe-neutral' : 'btn-luxe-danger';
  // Fire on `click` (works for mouse + keyboard). Use a short suppression
  // window so any stray pointer event in the same tap can't double-toggle.
  const trigger = (e) => {
    const now = Date.now();
    if (now - lastFireRef.current < 250) return;
    lastFireRef.current = now;
    try { e.stopPropagation(); } catch (err) {}
    try { emitRipple(e); } catch (err) {}
    try { onClick?.(e); } catch (err) {}
  };
  return (
    <button
      type="button"
      onClick={trigger}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      title={title}
      style={{ touchAction: 'manipulation' }}
      className={`btn-luxe btn-luxe-round ${compact ? '!p-2' : '!p-3'} ${tone}`}
      data-testid={testId}>
      <Icon className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
    </button>
  );
};

const RemoteVideo = ({ stream, name, large = false }) => {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [stream]);
  return (
    <div className={`relative ${large ? 'w-full h-full' : 'aspect-video min-h-0'} bg-slate-800 ${large ? '' : 'rounded-md'} overflow-hidden`}>
      <video ref={ref} autoPlay playsInline className="w-full h-full object-cover" />
      <span className="absolute bottom-1 left-1 text-[9px] bg-black/70 px-1.5 py-0.5 rounded text-white font-medium">{name}</span>
    </div>
  );
};

const RemoteAudio = ({ stream, speakerOn = true }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    if (stream) ref.current.srcObject = stream;
    ref.current.volume = speakerOn ? 1 : 0;
    // Try to switch sink for speakerphone routing on browsers that support it.
    if (typeof ref.current.setSinkId === 'function') {
      ref.current.setSinkId?.('default').catch(() => {});
    }
  }, [stream, speakerOn]);
  return <audio ref={ref} autoPlay playsInline />;
};

export default CallPanel;
