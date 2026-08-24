import React, { useState } from 'react';
import { useRoom } from '../../contexts/RoomContext';
import { useAuth } from '../../contexts/AuthContext';
import { Crown, Shield, Eye, UserX, Ban, ChevronDown, Play, Lock } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const ROLE_CONFIG = {
  host: { icon: Crown, label: 'Host', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  'co-host': { icon: Shield, label: 'Co-host', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  viewer: { icon: Eye, label: 'Viewer', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/30' }
};

const UserList = () => {
  const { currentRoom, roomMembers, refreshRoom, grantPlayback, revokePlayback } = useRoom();
  const { user } = useAuth();
  const [busyId, setBusyId] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);

  const members = currentRoom?.members ? Object.values(currentRoom.members) : [];
  const allMembers = [...members];
  roomMembers.forEach(rm => {
    if (!allMembers.find(m => m.uid === rm.userId)) {
      allMembers.push({ uid: rm.userId, name: rm.userName, role: 'viewer' });
    }
  });

  const isHost = currentRoom?.hostId === user?.uid;
  const isCoHost = (currentRoom?.coHosts || []).includes(user?.uid);
  const isHostOrCo = isHost || isCoHost;
  const playbackMode = currentRoom?.settings?.playbackControl || 'everyone';
  const playbackAllowList = currentRoom?.settings?.playbackAllowList || [];

  const togglePlaybackPerm = async (memberId, currentlyAllowed) => {
    setBusyId(memberId);
    try {
      if (currentlyAllowed) await revokePlayback(memberId);
      else await grantPlayback(memberId);
      refreshRoom?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
    setBusyId(null);
  };

  const doAction = async (path, body, memberId) => {
    if (!currentRoom || !user?.token) return;
    setBusyId(memberId);
    try {
      await axios.post(`${BACKEND_URL}/api/rooms/${currentRoom.id}/${path}`, body, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      refreshRoom?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
    setBusyId(null);
    setOpenMenu(null);
  };

  const changeRole = async (memberId, role) => {
    if (!currentRoom || !user?.token) return;
    setBusyId(memberId);
    try {
      await axios.put(`${BACKEND_URL}/api/rooms/${currentRoom.id}/role`,
        { userId: memberId, role },
        { headers: { Authorization: `Bearer ${user.token}` } });
      refreshRoom?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
    setBusyId(null);
    setOpenMenu(null);
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-purple-500/20 overflow-hidden" data-testid="user-list">
      <div className="px-4 py-3 border-b border-purple-500/20 flex items-center justify-between">
        <h3 className="font-semibold text-white text-sm">Members</h3>
        <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">{allMembers.length}</span>
      </div>

      <div className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
        {allMembers.map((member) => {
          const role = ROLE_CONFIG[member.role] || ROLE_CONFIG.viewer;
          const RoleIcon = role.icon;
          const isMe = member.uid === user?.uid;
          const canManage = isHost && !isMe && member.role !== 'host';
          const isViewer = member.role === 'viewer';
          const hasPlaybackPerm = playbackAllowList.includes(member.uid);
          // Show grant/revoke ONLY when:
          //  - I am host or co-host
          //  - The target is a regular viewer (not host, not co-host)
          //  - The room is in hosts-only mode (in 'everyone' mode the toggle is irrelevant)
          //  - Not myself
          const canGrantPlayback =
            isHostOrCo && !isMe && isViewer && playbackMode === 'hosts-only';

          return (
            <div key={member.uid} className={`relative flex items-center justify-between p-2 rounded-xl ${role.bg} border transition-all`}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {(member.name || 'U')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">
                    {member.name || 'Unknown'} {isMe && <span className="text-xs text-slate-500">(You)</span>}
                  </p>
                  <p className={`text-xs flex items-center gap-1 ${role.color}`}>
                    <RoleIcon className="w-3 h-3" />{role.label}
                    {isViewer && hasPlaybackPerm && (
                      <span
                        className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] text-emerald-300"
                        data-testid={`playback-perm-badge-${member.uid}`}
                        title="Host allowed this user to control playback"
                      >
                        <Play className="w-2.5 h-2.5" /> Can control
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {canGrantPlayback && (
                  <button
                    onClick={() => togglePlaybackPerm(member.uid, hasPlaybackPerm)}
                    disabled={busyId === member.uid}
                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                      hasPlaybackPerm
                        ? 'text-emerald-300 hover:text-amber-300 hover:bg-amber-500/10'
                        : 'text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10'
                    }`}
                    data-testid={`toggle-playback-perm-${member.uid}`}
                    title={hasPlaybackPerm ? 'Revoke playback control' : 'Allow to control playback'}
                  >
                    {hasPlaybackPerm ? <Lock className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                )}
                {canManage && (
                  <>
                  <button
                    onClick={() => setOpenMenu(openMenu === member.uid ? null : member.uid)}
                    className="p-1.5 text-slate-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors"
                    data-testid={`manage-user-${member.uid}`}
                    title="Manage user"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => doAction('kick', { userId: member.uid }, member.uid)}
                    disabled={busyId === member.uid}
                    className="p-1.5 text-slate-400 hover:text-orange-400 hover:bg-orange-500/10 rounded-lg transition-colors disabled:opacity-50"
                    data-testid={`kick-user-${member.uid}`}
                    title="Kick from room"
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Ban ${member.name}? They won't be able to rejoin.`)) {
                        doAction('ban', { userId: member.uid }, member.uid);
                      }
                    }}
                    disabled={busyId === member.uid}
                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                    data-testid={`ban-user-${member.uid}`}
                    title="Ban from room"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                  </>
                )}
              </div>

              {openMenu === member.uid && (
                <div className="absolute right-2 top-12 z-30 bg-slate-900/95 backdrop-blur-xl border border-purple-500/30 rounded-xl shadow-xl p-1 min-w-[140px]">
                  <button
                    onClick={() => changeRole(member.uid, 'co-host')}
                    disabled={member.role === 'co-host' || busyId === member.uid}
                    className="w-full text-left px-3 py-2 text-xs text-white hover:bg-purple-500/20 rounded-lg flex items-center gap-2 disabled:opacity-40"
                  >
                    <Shield className="w-3.5 h-3.5 text-blue-400" /> Make Co-host
                  </button>
                  <button
                    onClick={() => changeRole(member.uid, 'viewer')}
                    disabled={member.role === 'viewer' || busyId === member.uid}
                    className="w-full text-left px-3 py-2 text-xs text-white hover:bg-purple-500/20 rounded-lg flex items-center gap-2 disabled:opacity-40"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-400" /> Make Viewer
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UserList;
