import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRoom } from '../../contexts/RoomContext';
import AnnouncementBanner from '../Common/AnnouncementBanner';
import PrivacyPolicyModal from '../Common/PrivacyPolicyModal';
import NotificationBell from '../Notifications/NotificationBell';
import axios from 'axios';
import { Plus, ArrowRight, Tv, Users, Shield, Zap, MessageSquare, Monitor, Trash2, Play, Clock, Settings, RefreshCw, Crown, LogIn, AlertCircle } from 'lucide-react';
import { retryAxiosRequest, getLoadingMessage } from '../../utils/apiRetry';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const Lobby = ({ onEnterRoom, onShowAdmin, onShowProfile, onCreate, onJoin }) => {
  const { user } = useAuth();
  const { joinRoom } = useRoom();
  const [myRooms, setMyRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [roomsError, setRoomsError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    if (!user?.token) return;
    
    // Check admin status with retry
    retryAxiosRequest(
      () => axios.get(`${BACKEND_URL}/api/admin/me`, {
        headers: { Authorization: `Bearer ${user.token}` }
      }),
      {
        onRetry: ({ attempt, maxRetries }) => {
          console.log(`Checking admin status (attempt ${attempt}/${maxRetries})...`);
        }
      }
    )
      .then(r => setIsAdmin(!!r.data?.isAdmin))
      .catch(() => setIsAdmin(false));
  }, [user]);

  const fetchMyRooms = useCallback(async () => {
    if (!user?.token) return;
    setLoadingRooms(true);
    setRoomsError(null);
    setLoadingMessage('Loading your rooms...');
    
    try {
      const resp = await retryAxiosRequest(
        () => axios.get(`${BACKEND_URL}/api/rooms/my/rooms`, {
          headers: { Authorization: `Bearer ${user.token}` }
        }),
        {
          onRetry: ({ attempt, maxRetries, error }) => {
            const msg = getLoadingMessage(attempt, maxRetries);
            setLoadingMessage(msg);
            console.log(`Fetching rooms (${attempt}/${maxRetries}):`, error.message);
          }
        }
      );
      
      if (resp.data.success) {
        setMyRooms(resp.data.rooms || []);
        setRoomsError(null);
      } else {
        setRoomsError('Failed to load rooms');
      }
    } catch (e) {
      console.error('Fetch rooms error:', e);
      setRoomsError(e.response?.data?.error || 'Unable to connect to server. Please try again.');
      setMyRooms([]); // Clear rooms on error
    } finally {
      setLoadingRooms(false);
      setLoadingMessage('');
    }
  }, [user]);

  useEffect(() => { fetchMyRooms(); }, [fetchMyRooms]);

  // Backwards compatibility: legacy invite links use `?room=<id>` —
  // redirect those to the new `/room/:roomId` deep-link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    if (roomId) { onEnterRoom?.(roomId); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm('Are you sure you want to delete this room?')) return;
    setDeletingId(roomId);
    try {
      await retryAxiosRequest(
        () => axios.delete(`${BACKEND_URL}/api/rooms/${roomId}`, {
          headers: { Authorization: `Bearer ${user.token}` }
        })
      );
      setMyRooms(prev => prev.filter(r => r.id !== roomId));
    } catch (e) {
      console.error('Delete error:', e);
      alert('Failed to delete room. Please try again.');
    }
    setDeletingId(null);
  };

  const handleRejoinRoom = async (roomId) => {
    const result = await joinRoom(roomId);
    if (result.success) onEnterRoom?.(roomId);
  };

  const handleRoomCreated = () => { fetchMyRooms(); };
  const handleRoomJoined = () => {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 text-white" data-testid="lobby">
      {/* Announcement Banner */}
      <AnnouncementBanner />

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 bg-slate-900/40 backdrop-blur-xl border-b border-purple-500/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center font-bold text-lg">W</div>
          <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">WYTH</span>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button onClick={onShowAdmin} className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border border-purple-500/40 hover:border-purple-500/60 rounded-full text-sm text-purple-200 transition-all" data-testid="admin-panel-btn">
              <Shield className="w-4 h-4" /> Admin
            </button>
          )}
          <div
            onClick={onShowProfile}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onShowProfile?.(); }}
            className="flex items-center gap-2 px-2 py-1.5 bg-slate-800/50 hover:bg-slate-800/80 border border-purple-500/20 hover:border-purple-500/50 rounded-full cursor-pointer transition-all"
            data-testid="profile-nav-btn"
            title="My profile"
          >
            <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs font-bold">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="me" className="w-full h-full object-cover" />
              ) : (
                (user?.displayName || user?.email || 'U')[0].toUpperCase()
              )}
            </div>
            <span className="text-sm text-slate-300 hidden sm:inline pr-1.5 max-w-[140px] truncate">{user?.displayName || user?.email}</span>
          </div>
          <NotificationBell />
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-purple-500/10 border border-purple-500/30 rounded-full mb-6">
            <Zap className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-purple-300">Real-time synchronized viewing</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold mb-4 leading-tight">
            <span className="bg-gradient-to-r from-white via-purple-200 to-pink-200 bg-clip-text text-transparent">Never </span>
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Watch Alone.</span>
          </h1>
          <p className="text-base text-slate-400 max-w-xl mx-auto mb-8">
            Create a room, share videos from Google Drive, YouTube, or upload directly. Enjoy synced playback with friends.
          </p>
          <div className="flex items-center justify-center gap-4 mb-12">
            <button onClick={() => onCreate?.()} className="flex items-center gap-2 px-7 py-3.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-2xl text-white font-semibold text-base transition-all shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:scale-105" data-testid="create-room-lobby-btn">
              <Plus className="w-5 h-5" /> Create Room
            </button>
            <button onClick={() => onJoin?.()} className="flex items-center gap-2 px-7 py-3.5 bg-slate-800/50 hover:bg-slate-800/80 border border-purple-500/30 hover:border-purple-500/60 rounded-2xl text-white font-semibold text-base transition-all hover:scale-105" data-testid="join-room-lobby-btn">
              <ArrowRight className="w-5 h-5" /> Join Room
            </button>
          </div>
        </div>

        {/* Your Rooms Section */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Tv className="w-5 h-5 text-purple-400" /> Your Rooms & Joined
            </h2>
            <button onClick={fetchMyRooms} className="flex items-center gap-1 text-xs text-slate-400 hover:text-purple-300 transition-colors" data-testid="refresh-rooms-btn">
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRooms ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>

          {/* Loading State */}
          {loadingRooms && myRooms.length === 0 && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-sm text-slate-400">{loadingMessage || 'Loading your rooms...'}</p>
            </div>
          )}

          {/* Error State with Retry */}
          {!loadingRooms && roomsError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
              <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
              <p className="text-red-300 text-sm mb-4">{roomsError}</p>
              <button 
                onClick={fetchMyRooms}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-xl text-red-300 text-sm mx-auto transition-all"
              >
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loadingRooms && !roomsError && myRooms.length === 0 && (
            <div className="bg-slate-900/40 border border-purple-500/10 rounded-2xl p-8 text-center">
              <Tv className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No rooms yet. Create one or join via a room code — joined rooms will appear here too.</p>
            </div>
          )}

          {myRooms.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {myRooms.map(room => {
                const isOwn = room.hostId === user?.uid;
                const relation = room._relation || (isOwn ? 'host' : 'member');
                const RelationIcon = relation === 'host' ? Crown : relation === 'co-host' ? Shield : LogIn;
                const relationLabel =
                  relation === 'host' ? 'Your room' : relation === 'co-host' ? 'Co-host' : 'Joined';
                const relationStyle =
                  relation === 'host'
                    ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30'
                    : relation === 'co-host'
                    ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';

                return (
                <div key={room.id} className="bg-slate-900/50 backdrop-blur-xl border border-purple-500/15 rounded-2xl p-5 hover:border-purple-500/40 transition-all group" data-testid={`room-card-${room.id}`}>
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-white text-sm truncate">{room.name}</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate" data-testid={`room-host-${room.id}`}>
                        Hosted by <span className="text-purple-300 font-medium">{isOwn ? 'you' : (room.hostName || 'Unknown')}</span>
                      </p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {room.id}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full border ${relationStyle}`} data-testid={`room-relation-${room.id}`}>
                        <RelationIcon className="w-2.5 h-2.5" /> {relationLabel}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Active</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400 mb-4">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {Object.keys(room.members || {}).length}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(room.createdAt).toLocaleDateString()}</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRejoinRoom(room.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-xl text-purple-300 text-xs font-medium transition-all"
                      data-testid={`rejoin-room-${room.id}`}
                    >
                      <Play className="w-3.5 h-3.5" /> Rejoin
                    </button>
                    {isOwn && (
                      <button
                        onClick={() => handleDeleteRoom(room.id)}
                        disabled={deletingId === room.id}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium transition-all disabled:opacity-50"
                        data-testid={`delete-room-${room.id}`}
                      >
                        {deletingId === room.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Feature cards */}
        <div className="grid md:grid-cols-3 gap-5">
          <FeatureCard icon={<Tv className="w-5 h-5" />} title="Sync Playback" desc="Play, pause, seek - all synced across every viewer" />
          <FeatureCard icon={<MessageSquare className="w-5 h-5" />} title="Encrypted Chat" desc="AES-256 encrypted messaging with emoji support" />
          <FeatureCard icon={<Monitor className="w-5 h-5" />} title="Screen Share" desc="Share your screen and watch together" />
          <FeatureCard icon={<Users className="w-5 h-5" />} title="Role System" desc="Host, Co-host, and Viewer roles" />
          <FeatureCard icon={<Shield className="w-5 h-5" />} title="Secure WebRTC" desc="Peer-to-peer voice and video calls" />
          <FeatureCard icon={<Zap className="w-5 h-5" />} title="Upload or Link" desc="Upload from device or paste any video link" />
        </div>
      </div>

      <footer className="text-center py-6 text-slate-600 text-xs border-t border-purple-500/10 mt-12 flex items-center justify-center">
        <button onClick={() => setShowPrivacy(true)} className="text-slate-500 hover:text-purple-300 transition-colors underline-offset-4 hover:underline" data-testid="privacy-link">
          Privacy Policy
        </button>
      </footer>

      {showPrivacy && <PrivacyPolicyModal onClose={() => setShowPrivacy(false)} />}
    </div>
  );
};

const FeatureCard = ({ icon, title, desc }) => (
  <div className="p-5 bg-slate-900/50 backdrop-blur-xl border border-purple-500/15 rounded-2xl hover:border-purple-500/40 transition-all group text-left">
    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 mb-3 group-hover:bg-purple-500/20 transition-colors">{icon}</div>
    <h3 className="font-semibold text-white mb-1 text-sm">{title}</h3>
    <p className="text-xs text-slate-400">{desc}</p>
  </div>
);

export default Lobby;
