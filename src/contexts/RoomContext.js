import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getSocket, emitWithCheck } from '../services/socket';
import axios from 'axios';
import { toast } from 'sonner';
import { writeNavState } from '../utils/sessionPersistence';

const RoomContext = createContext({});
export const useRoom = () => useContext(RoomContext);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const RoomProvider = ({ children }) => {
  const { user } = useAuth();
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomMembers, setRoomMembers] = useState([]);
  const [videoState, setVideoState] = useState({
    videoUrl: '', videoType: 'direct', currentTime: 0, isPlaying: false, volume: 1, playbackRate: 1
  });
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sync telemetry (drift correction + speed control)
  const [playbackRate, setPlaybackRate] = useState(1);
  const [syncStatus, setSyncStatus] = useState('synced'); // 'synced' | 'correcting' | 'desynced'
  const [networkLatency, setNetworkLatency] = useState(0);
  const [driftAmount, setDriftAmount] = useState(0);
  const [lastHeartbeat, setLastHeartbeat] = useState(Date.now());

  // Voice/Video call state — published by CallPanel so the video player can
  // relax its drift-correction thresholds while a call is active (otherwise
  // every WebRTC negotiation spike triggers a visible hard-seek).
  const [isInCall, setIsInCall] = useState(false);

  // Persist roomId in session storage so a refresh can transparently rejoin.
  // Clearing is handled explicitly in leaveRoom / kick / ban below.
  useEffect(() => {
    if (currentRoom?.id) {
      try { writeNavState({ roomId: currentRoom.id }); } catch (e) {}
    }
  }, [currentRoom?.id]);

  // Socket listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !currentRoom) return;

    const onRoomState = (state) => {
      if (state) setVideoState(prev => ({ ...prev, ...state }));
    };
    const onUserJoined = ({ userId, userName }) => {
      setRoomMembers(prev => {
        if (prev.find(m => m.userId === userId)) return prev;
        return [...prev, { userId, userName }];
      });
    };
    const onUserLeft = ({ userId }) => {
      setRoomMembers(prev => prev.filter(m => m.userId !== userId));
    };
    const onVideoStateUpdate = (state) => setVideoState(prev => ({ ...prev, ...state }));
    const fmtTime = (s) => {
      if (!s || isNaN(s)) return '0:00';
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2, '0')}`;
    };
    const onVideoPlay = ({ currentTime, userId, userName, playbackRate: rate, serverTimestamp }) => {
      setVideoState(prev => ({
        ...prev,
        isPlaying: true,
        currentTime,
        playbackRate: typeof rate === 'number' ? rate : prev.playbackRate,
        serverTimestamp: serverTimestamp || Date.now(),
      }));
      if (typeof rate === 'number') setPlaybackRate(rate);
      if (userId && userId !== user?.uid && userName) {
        toast(`${userName} played the video`, { duration: 2500 });
      }
    };
    const onVideoPause = ({ currentTime, userId, userName, serverTimestamp }) => {
      setVideoState(prev => ({
        ...prev,
        isPlaying: false,
        currentTime,
        serverTimestamp: serverTimestamp || Date.now(),
      }));
      if (userId && userId !== user?.uid && userName) {
        toast(`${userName} paused the video`, { duration: 2500 });
      }
    };
    const onVideoSeek = ({ currentTime, isPlaying, playbackRate: rate, userId, userName, serverTimestamp }) => {
      setVideoState(prev => ({
        ...prev,
        currentTime,
        // The server now ships authoritative isPlaying / playbackRate with
        // every seek so receivers can self-heal even if their local state
        // drifted. Fall back to the previous value if the server didn't
        // send the field (older backend version).
        isPlaying: typeof isPlaying === 'boolean' ? isPlaying : prev.isPlaying,
        playbackRate: typeof rate === 'number' ? rate : prev.playbackRate,
        serverTimestamp: serverTimestamp || Date.now(),
      }));
      if (typeof rate === 'number') setPlaybackRate(rate);
      if (userId && userId !== user?.uid && userName) {
        toast(`${userName} jumped to ${fmtTime(currentTime)}`, { duration: 2500 });
      }
    };
    const onVideoLoaded = ({ videoUrl, videoType, userName, userId }) => {
      setVideoState(prev => ({ ...prev, videoUrl, videoType: videoType || 'direct', currentTime: 0, isPlaying: false }));
      if (userId && userId !== user?.uid && userName) {
        toast(`${userName} loaded a new video`, { duration: 3000 });
      }
    };
    const onNewMessage = (msg) => setMessages(prev => [...prev, msg]);
    const onMessageHistory = (history) => setMessages(history || []);
    const onSyncResponse = (state) => {
      if (!state) return;
      setVideoState(prev => ({ ...prev, ...state }));
      if (typeof state.playbackRate === 'number') setPlaybackRate(state.playbackRate);
    };
    const onVideoHeartbeat = (state) => {
      if (!state) return;
      const now = Date.now();
      const latency = state.serverTimestamp ? Math.max(0, (now - state.serverTimestamp) / 2) : 0;
      setNetworkLatency(latency);
      setLastHeartbeat(now);
      setVideoState(prev => ({
        ...prev,
        currentTime: state.currentTime !== undefined ? state.currentTime : prev.currentTime,
        isPlaying: state.isPlaying !== undefined ? state.isPlaying : prev.isPlaying,
        playbackRate: state.playbackRate !== undefined ? state.playbackRate : prev.playbackRate,
        serverTimestamp: state.serverTimestamp || now,
        videoUrl: state.videoUrl || prev.videoUrl,
        videoType: state.videoType || prev.videoType,
      }));
      if (typeof state.playbackRate === 'number') setPlaybackRate(state.playbackRate);
    };
    const onPlaybackRateChanged = ({ playbackRate: rate, currentTime, userId: uid, userName: uName, serverTimestamp }) => {
      if (typeof rate !== 'number') return;
      setPlaybackRate(rate);
      setVideoState(prev => ({
        ...prev,
        playbackRate: rate,
        currentTime: typeof currentTime === 'number' ? currentTime : prev.currentTime,
        serverTimestamp: serverTimestamp || Date.now(),
      }));
      if (uid && uid !== user?.uid && uName) {
        toast(`${uName} changed speed to ${rate}x`, { duration: 2500 });
      }
    };
    const onSettingsUpdated = ({ settings }) => {
      setCurrentRoom(prev => prev ? { ...prev, settings: { ...(prev.settings || {}), ...(settings || {}) } } : prev);
    };
    const onUserKicked = ({ userId }) => {
      if (userId === user?.uid) {
        alert('You have been removed from the room.');
        setCurrentRoom(null); setRoomMembers([]); setMessages([]);
        try { writeNavState({ roomId: null }); } catch (e) {}
      } else {
        setRoomMembers(prev => prev.filter(m => m.userId !== userId));
        setCurrentRoom(prev => {
          if (!prev) return prev;
          const { [userId]: _, ...rest } = prev.members || {};
          return { ...prev, members: rest };
        });
      }
    };
    const onUserBanned = ({ userId }) => {
      if (userId === user?.uid) {
        alert('You have been banned from this room.');
        setCurrentRoom(null); setRoomMembers([]); setMessages([]);
        try { writeNavState({ roomId: null }); } catch (e) {}
      } else onUserKicked({ userId });
    };
    const onPlaybackDenied = ({ reason }) => {
      toast.error(reason || 'Only the host can control playback in this room.', { duration: 3000 });
    };
    const onPlaybackPermissionChanged = ({ userId: uid, granted }) => {
      if (uid === user?.uid) {
        toast(granted ? 'You can now control playback for this room' : 'Your playback control has been revoked', {
          duration: 3000
        });
      }
    };
    const onReconnect = () => {
      if (currentRoom?.id) {
        emitWithCheck('request-sync', { roomId: currentRoom.id });
      }
    };

    socket.on('room-state', onRoomState);
    socket.on('user-joined', onUserJoined);
    socket.on('user-left', onUserLeft);
    socket.on('video-state-update', onVideoStateUpdate);
    socket.on('video-play', onVideoPlay);
    socket.on('video-pause', onVideoPause);
    socket.on('video-seek', onVideoSeek);
    socket.on('video-loaded', onVideoLoaded);
    socket.on('video-heartbeat', onVideoHeartbeat);
    socket.on('playback-rate-changed', onPlaybackRateChanged);
    socket.on('new-message', onNewMessage);
    socket.on('message-history', onMessageHistory);
    socket.on('sync-response', onSyncResponse);
    socket.on('settings-updated', onSettingsUpdated);
    socket.on('user-kicked', onUserKicked);
    socket.on('user-banned', onUserBanned);
    socket.on('playback-denied', onPlaybackDenied);
    socket.on('playback-permission-changed', onPlaybackPermissionChanged);
    socket.on('reconnect', onReconnect);
    socket.io?.on?.('reconnect', onReconnect);

    // Now that listeners are attached, (re)join the socket room and
    // explicitly request the current video state. This fixes the race where
    // a late joiner missed `room-state` because the emit happened before the
    // React listener was attached.
    // Use emitWithCheck to queue if socket isn't connected yet
    emitWithCheck('join-room', { roomId: currentRoom.id });
    emitWithCheck('get-messages', { roomId: currentRoom.id });
    emitWithCheck('request-sync', { roomId: currentRoom.id });

    return () => {
      socket.off('room-state', onRoomState);
      socket.off('user-joined', onUserJoined);
      socket.off('user-left', onUserLeft);
      socket.off('video-state-update', onVideoStateUpdate);
      socket.off('video-play', onVideoPlay);
      socket.off('video-pause', onVideoPause);
      socket.off('video-seek', onVideoSeek);
      socket.off('video-loaded', onVideoLoaded);
      socket.off('video-heartbeat', onVideoHeartbeat);
      socket.off('playback-rate-changed', onPlaybackRateChanged);
      socket.off('new-message', onNewMessage);
      socket.off('message-history', onMessageHistory);
      socket.off('sync-response', onSyncResponse);
      socket.off('settings-updated', onSettingsUpdated);
      socket.off('user-kicked', onUserKicked);
      socket.off('user-banned', onUserBanned);
      socket.off('playback-denied', onPlaybackDenied);
      socket.off('playback-permission-changed', onPlaybackPermissionChanged);
      socket.off('reconnect', onReconnect);
      socket.io?.off?.('reconnect', onReconnect);
    };
  }, [currentRoom, user]);

  const createRoom = async (roomName) => {
    try {
      setLoading(true); setError(null);
      const resp = await axios.post(`${BACKEND_URL}/api/rooms/create`, { roomName }, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (resp.data.success) {
        const room = resp.data.roomData;
        if (room?.currentVideo?.videoUrl) {
          setVideoState({
            videoUrl: room.currentVideo.videoUrl,
            videoType: room.currentVideo.videoType || 'direct',
            currentTime: typeof room.currentVideo.currentTime === 'number' ? room.currentVideo.currentTime : 0,
            isPlaying: false,
            volume: 1
          });
        }
        setCurrentRoom(room);
        // Joining the socket room + requesting state is handled by the
        // listener-registration useEffect (avoids race with listener attach).
        return { success: true, roomId: room.id };
      }
      return { success: false, error: 'Failed to create room' };
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setError(msg);
      return { success: false, error: msg };
    } finally { setLoading(false); }
  };

  const joinRoom = async (roomId) => {
    try {
      setLoading(true); setError(null);
      const resp = await axios.post(`${BACKEND_URL}/api/rooms/${roomId}/join`, {}, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (resp.data.success) {
        const room = resp.data.room;
        // Seed the player from the durable `currentVideo` field stored on
        // the room doc, so the player isn't blank between joining and the
        // socket `room-state` event arriving (fixes blank-on-rejoin bug).
        //
        // IMPORTANT: always restart at currentTime=0 on a cold rejoin. The
        // saved timestamp can be stale and past the video's actual length
        // (e.g. a saved 1143s on a 600s video), which puts the YouTube
        // IFrame player into a broken/black state. Starting from 0 is the
        // safe, expected behaviour when no live session is in progress.
        if (room?.currentVideo?.videoUrl) {
          setVideoState({
            videoUrl: room.currentVideo.videoUrl,
            videoType: room.currentVideo.videoType || 'direct',
            currentTime: 0,
            isPlaying: false,
            volume: 1
          });
        } else {
          setVideoState({ videoUrl: '', videoType: 'direct', currentTime: 0, isPlaying: false, volume: 1 });
        }
        setCurrentRoom(room);
        // Joining the socket room + requesting state is handled by the
        // listener-registration useEffect (avoids race with listener attach).
        return { success: true };
      }
      return { success: false, error: 'Failed to join room' };
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setError(msg);
      return { success: false, error: msg };
    } finally { setLoading(false); }
  };

  const leaveRoom = useCallback(async () => {
    if (!currentRoom) return;
    const socket = getSocket();
    if (socket) emitWithCheck('leave-room', { roomId: currentRoom.id });
    try {
      await axios.post(`${BACKEND_URL}/api/rooms/${currentRoom.id}/leave`, {}, {
        headers: { Authorization: `Bearer ${user?.token}` }
      });
    } catch (e) {}
    setCurrentRoom(null);
    setRoomMembers([]);
    setMessages([]);
    setVideoState({ videoUrl: '', videoType: 'direct', currentTime: 0, isPlaying: false, volume: 1 });
    try { writeNavState({ roomId: null }); } catch (e) {}
  }, [currentRoom, user]);

  const playVideo = useCallback((currentTime) => {
    const socket = getSocket();
    if (socket && currentRoom) emitWithCheck('play-video', { roomId: currentRoom.id, currentTime });
  }, [currentRoom]);

  const pauseVideo = useCallback((currentTime) => {
    const socket = getSocket();
    if (socket && currentRoom) emitWithCheck('pause-video', { roomId: currentRoom.id, currentTime });
  }, [currentRoom]);

  const seekVideo = useCallback((currentTime) => {
    const socket = getSocket();
    if (socket && currentRoom) emitWithCheck('seek-video', { roomId: currentRoom.id, currentTime });
  }, [currentRoom]);

  const changeVolume = useCallback((volume) => {
    const socket = getSocket();
    if (socket && currentRoom) emitWithCheck('volume-change', { roomId: currentRoom.id, volume });
  }, [currentRoom]);

  const loadVideo = useCallback((videoUrl, videoType = 'direct') => {
    // Update local state immediately for instant feedback
    setVideoState(prev => ({ ...prev, videoUrl, videoType, currentTime: 0, isPlaying: false }));
    // Broadcast to other users
    const socket = getSocket();
    if (socket && currentRoom) emitWithCheck('load-video', { roomId: currentRoom.id, videoUrl, videoType });
  }, [currentRoom]);

  const sendMessage = useCallback((message) => {
    const socket = getSocket();
    if (socket && currentRoom) emitWithCheck('send-message', { roomId: currentRoom.id, message });
  }, [currentRoom]);

  const changePlaybackRate = useCallback((rate) => {
    const r = Math.max(0.25, Math.min(2, Number(rate) || 1));
    const socket = getSocket();
    if (socket && currentRoom) {
      setPlaybackRate(r);
      setVideoState(prev => ({ ...prev, playbackRate: r }));
      emitWithCheck('playback-rate-change', { roomId: currentRoom.id, playbackRate: r });
    }
  }, [currentRoom]);

  const refreshRoom = useCallback(async () => {
    if (!currentRoom || !user?.token) return;
    try {
      const resp = await axios.get(`${BACKEND_URL}/api/rooms/${currentRoom.id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (resp.data.success) setCurrentRoom(resp.data.room);
    } catch (e) {}
  }, [currentRoom, user]);

  const updateSettings = useCallback(async (settings) => {
    if (!currentRoom || !user?.token) return { success: false };
    try {
      const resp = await axios.put(`${BACKEND_URL}/api/rooms/${currentRoom.id}/settings`,
        { settings },
        { headers: { Authorization: `Bearer ${user.token}` } });
      if (resp.data.success) {
        setCurrentRoom(prev => prev ? { ...prev, settings: resp.data.settings } : prev);
        return { success: true };
      }
      return { success: false, error: resp.data.error };
    } catch (e) {
      return { success: false, error: e.response?.data?.error || e.message };
    }
  }, [currentRoom, user]);

  const grantPlayback = useCallback(async (targetUserId) => {
    if (!currentRoom || !user?.token) return { success: false };
    try {
      const resp = await axios.post(`${BACKEND_URL}/api/rooms/${currentRoom.id}/playback-grant`,
        { userId: targetUserId },
        { headers: { Authorization: `Bearer ${user.token}` } });
      if (resp.data.success) {
        setCurrentRoom(prev => prev ? { ...prev, settings: resp.data.settings } : prev);
        toast.success('Playback control granted', { duration: 2000 });
        return { success: true };
      }
      return { success: false, error: resp.data.error };
    } catch (e) {
      return { success: false, error: e.response?.data?.error || e.message };
    }
  }, [currentRoom, user]);

  const revokePlayback = useCallback(async (targetUserId) => {
    if (!currentRoom || !user?.token) return { success: false };
    try {
      const resp = await axios.post(`${BACKEND_URL}/api/rooms/${currentRoom.id}/playback-revoke`,
        { userId: targetUserId },
        { headers: { Authorization: `Bearer ${user.token}` } });
      if (resp.data.success) {
        setCurrentRoom(prev => prev ? { ...prev, settings: resp.data.settings } : prev);
        toast.success('Playback control revoked', { duration: 2000 });
        return { success: true };
      }
      return { success: false, error: resp.data.error };
    } catch (e) {
      return { success: false, error: e.response?.data?.error || e.message };
    }
  }, [currentRoom, user]);

  // Derived: can the current user control playback in this room?
  const isHostOrCoHost =
    !!currentRoom && !!user &&
    (currentRoom.hostId === user.uid || (currentRoom.coHosts || []).includes(user.uid));
  // Default 'everyone' so existing rooms (no setting persisted) keep the
  // original behaviour: anyone in the room can play / pause / seek.
  const playbackControl = currentRoom?.settings?.playbackControl || 'everyone';
  const playbackAllowList = currentRoom?.settings?.playbackAllowList || [];
  const canControlPlayback =
    !!currentRoom && !!user &&
    (playbackControl === 'everyone' || isHostOrCoHost || playbackAllowList.includes(user.uid));

  return (
    <RoomContext.Provider value={{
      currentRoom, roomMembers, videoState, messages, loading, error,
      createRoom, joinRoom, leaveRoom, playVideo, pauseVideo, seekVideo,
      changeVolume, loadVideo, sendMessage, refreshRoom, updateSettings,
      grantPlayback, revokePlayback,
      canControlPlayback, isHostOrCoHost, playbackControl, playbackAllowList,
      // Sync system additions
      playbackRate, syncStatus, networkLatency, driftAmount, lastHeartbeat,
      setSyncStatus, setDriftAmount,
      changePlaybackRate,
      // Call state (published by CallPanel; consumed by the video players)
      isInCall, setIsInCall
    }}>
      {children}
    </RoomContext.Provider>
  );
};
