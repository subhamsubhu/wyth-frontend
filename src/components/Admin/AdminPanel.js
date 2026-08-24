import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import {
  ArrowLeft, Users, Tv, Activity, Shield, RefreshCw, Megaphone,
  Trash2, Ban, CheckCircle2, Plus, X, AlertTriangle, Search,
  LayoutDashboard, FileText, Calendar, KeyRound, UserPlus, Eye, EyeOff,
  Inbox, LifeBuoy, MessageSquareHeart, Sparkles, Send, Reply, Loader2
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const SECTIONS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'updates', label: 'Users Updates', icon: Inbox },
  { key: 'admins', label: 'Admins', icon: Shield },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'rooms', label: 'Rooms', icon: Tv },
  { key: 'announcements', label: 'Announcements', icon: Megaphone },
  { key: 'privacy', label: 'Privacy Policy', icon: FileText },
];

const AdminPanel = ({ onBack }) => {
  const { user, logout } = useAuth();
  const [section, setSection] = useState('dashboard');
  const [navOpen, setNavOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(null); // null=loading
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [updatesCounts, setUpdatesCounts] = useState({ help: 0, feedback: 0, feature: 0, total: 0 });

  const refreshUpdatesCounts = useCallback(async () => {
    if (!user?.token) return;
    try {
      const r = await axios.get(`${BACKEND_URL}/api/admin/support/counts`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (r.data?.success) setUpdatesCounts(r.data.counts);
    } catch (e) { /* silent */ }
  }, [user]);

  useEffect(() => {
    refreshUpdatesCounts();
    const t = setInterval(refreshUpdatesCounts, 25000);
    return () => clearInterval(t);
  }, [refreshUpdatesCounts]);

  useEffect(() => {
    if (!user?.token) return;
    axios.get(`${BACKEND_URL}/api/admin/me`, {
      headers: { Authorization: `Bearer ${user.token}` }
    }).then(r => {
      setIsAdmin(!!r.data?.isAdmin);
      setIsSuperAdmin(!!r.data?.isSuperAdmin);
    }).catch(() => {
      setIsAdmin(false);
      setIsSuperAdmin(false);
    });
  }, [user]);

  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 flex items-center justify-center p-4 text-white">
        <div className="max-w-md w-full bg-slate-900/60 backdrop-blur-xl border border-red-500/30 rounded-2xl p-8 text-center">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-sm text-slate-400 mb-1">This area is for admins only.</p>
          <p className="text-xs text-slate-500 mb-6">Signed in as <span className="text-slate-300">{user?.email}</span></p>
          <div className="flex gap-2 justify-center">
            <button onClick={onBack} className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 rounded-xl text-purple-300 text-sm" data-testid="admin-back-btn">
              Back to Lobby
            </button>
            <button onClick={logout} className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-xl text-red-300 text-sm">
              Log out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950 text-white flex flex-col" data-testid="admin-panel">
      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 bg-slate-900/70 backdrop-blur-xl border-b border-purple-500/20 sticky top-0 z-30">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button onClick={onBack} className="p-2 text-slate-400 hover:text-white hover:bg-purple-500/10 rounded-lg transition-colors" data-testid="admin-back-btn" title="Back to Lobby">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Shield className="w-5 h-5 text-purple-400 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-white truncate">Admin Console</h1>
            <p className="text-[10px] sm:text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
        </div>
        <button onClick={() => setNavOpen(!navOpen)} className="md:hidden p-2 bg-slate-800/60 rounded-lg text-slate-300">
          <LayoutDashboard className="w-4 h-4" />
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className={`fixed md:static z-40 md:z-auto top-[60px] md:top-auto left-0 h-[calc(100vh-60px)] md:h-auto w-60 md:w-56 shrink-0 bg-slate-900/95 md:bg-slate-900/40 backdrop-blur-xl border-r border-purple-500/15 p-3 transition-transform duration-300 ${
          navOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}>
          <nav className="space-y-1">
            {SECTIONS.map(({ key, label, icon: Icon }) => {
              const badge = key === 'updates' ? updatesCounts.total : 0;
              return (
              <button
                key={key}
                onClick={() => { setSection(key); setNavOpen(false); }}
                className={`relative w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  section === key
                    ? 'bg-gradient-to-r from-purple-500/30 to-pink-500/20 text-white border border-purple-500/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
                data-testid={`admin-nav-${key}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate flex-1 text-left">{label}</span>
                {badge > 0 && (
                  <span
                    className="ml-auto min-w-[20px] h-[20px] px-1.5 flex items-center justify-center
                               text-[10px] font-bold leading-none text-white
                               bg-gradient-to-br from-red-500 to-pink-500 rounded-full
                               shadow-[0_0_10px_rgba(239,68,68,0.6)] wyth-bell-badge-pulse"
                    data-testid={`admin-nav-badge-${key}`}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            );})}
          </nav>
          <div className="mt-6 pt-4 border-t border-purple-500/10 text-[10px] text-slate-600">
            WYTH Admin · v1.0
          </div>
        </aside>

        {/* Mobile backdrop */}
        {navOpen && <div className="md:hidden fixed inset-0 bg-black/50 z-30 mt-[60px]" onClick={() => setNavOpen(false)} />}

        {/* Content */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 overflow-auto">
          {section === 'dashboard' && <DashboardSection user={user} />}
          {section === 'updates' && <UpdatesSection user={user} counts={updatesCounts} refreshCounts={refreshUpdatesCounts} />}
          {section === 'admins' && <AdminsSection user={user} isSuperAdmin={isSuperAdmin} />}
          {section === 'users' && <UsersSection user={user} />}
          {section === 'rooms' && <RoomsSection user={user} />}
          {section === 'announcements' && <AnnouncementsSection user={user} />}
          {section === 'privacy' && <PrivacySection />}
        </main>
      </div>
    </div>
  );
};

/* ──────────── DASHBOARD ──────────── */
const DashboardSection = ({ user }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${BACKEND_URL}/api/admin/dashboard`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (r.data.success) setStats(r.data.stats);
    } catch (e) { /* */ }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const cards = stats ? [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'from-blue-500 to-cyan-500' },
    { label: 'New (7d)', value: stats.recentUsers, icon: Users, color: 'from-emerald-500 to-teal-500' },
    { label: 'Active Rooms', value: stats.activeRooms, icon: Tv, color: 'from-purple-500 to-pink-500' },
    { label: 'Total Rooms', value: stats.totalRooms, icon: Tv, color: 'from-indigo-500 to-purple-500' },
    { label: 'Members In-Room', value: stats.totalMembersAcrossRooms, icon: Activity, color: 'from-orange-500 to-red-500' },
    { label: 'Disabled Users', value: stats.disabledUsers, icon: Ban, color: 'from-rose-500 to-red-600' },
  ] : [];

  return (
    <div>
      <SectionHeader title="Dashboard" subtitle="Realtime stats from your WYTH instance" onRefresh={load} loading={loading} />
      {!stats && loading && <Skeleton />}
      {stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
            {cards.map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="relative bg-slate-900/50 backdrop-blur-xl border border-purple-500/15 rounded-2xl p-4 sm:p-5 overflow-hidden hover:border-purple-500/30 transition-all">
                <div className={`absolute -top-8 -right-8 w-24 h-24 bg-gradient-to-br ${color} opacity-10 rounded-full blur-2xl`} />
                <div className={`w-10 h-10 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center mb-3`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-white">{value}</p>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-1">{label}</p>
              </div>
            ))}
          </div>
          <div className="bg-slate-900/50 backdrop-blur-xl border border-purple-500/15 rounded-2xl p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" /> System Status</h3>
            <div className="space-y-2 text-sm">
              <InfoRow label="Backend" value="Online · Node.js + Socket.IO" ok />
              <InfoRow label="Database" value="Firebase Firestore + Realtime DB" ok />
              <InfoRow label="Auth" value="Firebase Authentication" ok />
              <InfoRow label="Encryption" value="AES-256-GCM (chat) + DTLS-SRTP (calls)" ok />
              <InfoRow label="Server time" value={new Date(stats.serverTime).toLocaleString()} />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* ──────────── ADMINS ──────────── */
const AdminsSection = ({ user, isSuperAdmin }) => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showPwd, setShowPwd] = useState(null); // email of admin to change password for
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${BACKEND_URL}/api/admin/admins`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (r.data.success) setAdmins(r.data.admins);
    } catch (e) { /* */ }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const revoke = async (email) => {
    if (!window.confirm(`Revoke admin access for ${email}? The Firebase user will remain but lose admin rights.`)) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/admin/admins/${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      setMsg({ type: 'success', text: `Revoked ${email}` });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.error || e.message });
    }
  };

  const flash = (m) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="text-xl sm:text-2xl font-bold">Admins</h2>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/60 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg text-xs text-slate-300 transition-all">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {isSuperAdmin && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-white text-sm font-medium" data-testid="create-admin-btn">
              <UserPlus className="w-4 h-4" /> Create Admin
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-slate-400 mb-5">
        {isSuperAdmin
          ? 'Manage who can access this console. Superadmins cannot be removed from the UI.'
          : 'Read-only view of who can access this console. Only a superadmin can add or remove admins.'}
      </p>

      {msg && (
        <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm border ${
          msg.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
            : 'bg-red-500/10 border-red-500/30 text-red-200'
        }`} data-testid="admin-msg">
          {msg.text}
        </div>
      )}

      {showCreate && (
        <CreateAdminForm
          user={user}
          onClose={() => setShowCreate(false)}
          onSaved={(email) => { flash({ type: 'success', text: `Admin ${email} created/updated` }); load(); }}
          onError={(text) => flash({ type: 'error', text })}
        />
      )}

      {showPwd && (
        <ChangePasswordModal
          user={user}
          targetEmail={showPwd}
          onClose={() => setShowPwd(null)}
          onSaved={() => { flash({ type: 'success', text: `Password updated for ${showPwd}` }); setShowPwd(null); }}
          onError={(text) => flash({ type: 'error', text })}
        />
      )}

      <div className="bg-slate-900/50 backdrop-blur-xl border border-purple-500/15 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-purple-500/20 text-[10px] uppercase text-slate-500 tracking-wider">
                <th className="text-left p-3 sm:p-4">Admin</th>
                <th className="text-left p-3 sm:p-4">Role</th>
                <th className="text-left p-3 sm:p-4">Created</th>
                <th className="text-right p-3 sm:p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 && !loading && (
                <tr><td colSpan="4" className="p-8 text-center text-slate-500">No admins yet</td></tr>
              )}
              {admins.map(a => (
                <tr key={a.email} className="border-b border-purple-500/10 hover:bg-purple-500/5 transition-colors" data-testid={`admin-row-${a.email}`}>
                  <td className="p-3 sm:p-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {(a.displayName || a.email || 'A')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white text-xs sm:text-sm truncate">{a.displayName || a.email}</p>
                        <p className="text-[10px] sm:text-xs text-slate-500 truncate">{a.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 sm:p-4">
                    <Badge color={a.role === 'superadmin' ? 'purple' : 'slate'}>
                      {a.role === 'superadmin' ? 'Superadmin' : 'Admin'}
                    </Badge>
                    {!a.uid && <span className="ml-2 text-[10px] text-amber-300">no firebase user</span>}
                  </td>
                  <td className="p-3 sm:p-4 text-xs text-slate-400">{fmtDate(a.createdAt) || '—'}</td>
                  <td className="p-3 sm:p-4">
                    <div className="flex items-center justify-end gap-1">
                      {a.uid && (isSuperAdmin || a.email === user.email) && (
                        <button
                          onClick={() => setShowPwd(a.email)}
                          className="p-1.5 text-blue-300 hover:bg-blue-500/10 rounded-lg"
                          title="Change password"
                          data-testid={`change-pwd-${a.email}`}
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isSuperAdmin && a.removable && a.email !== user.email && (
                        <button
                          onClick={() => revoke(a.email)}
                          className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg"
                          title="Revoke admin"
                          data-testid={`revoke-${a.email}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const CreateAdminForm = ({ user, onClose, onSaved, onError }) => {
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.email || !form.password) {
      onError('Email and password are required');
      return;
    }
    if (form.password.length < 6) {
      onError('Password must be at least 6 characters');
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${BACKEND_URL}/api/admin/admins`, form, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      onSaved(form.email);
      onClose();
    } catch (e) {
      onError(e.response?.data?.error || e.message);
    }
    setSaving(false);
  };

  return (
    <div className="mb-5 bg-slate-900/60 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2"><UserPlus className="w-4 h-4 text-purple-300" /> Create New Admin</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <input
        type="email"
        placeholder="admin@example.com"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        className="w-full px-3 py-2 bg-slate-800/60 border border-purple-500/20 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50"
        data-testid="new-admin-email"
        autoFocus
      />
      <input
        placeholder="Display name (optional)"
        value={form.displayName}
        onChange={(e) => setForm({ ...form, displayName: e.target.value })}
        className="w-full px-3 py-2 bg-slate-800/60 border border-purple-500/20 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50"
        data-testid="new-admin-name"
      />
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          placeholder="Password (min 6 chars)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="w-full px-3 py-2 pr-10 bg-slate-800/60 border border-purple-500/20 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50"
          data-testid="new-admin-password"
        />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        If the email already exists as a Firebase user, its password will be updated and admin rights will be granted.
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white">Cancel</button>
        <button
          onClick={submit}
          disabled={saving}
          className="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-lg text-sm text-white disabled:opacity-50"
          data-testid="submit-create-admin"
        >
          {saving ? 'Creating…' : 'Create Admin'}
        </button>
      </div>
    </div>
  );
};

const ChangePasswordModal = ({ user, targetEmail, onClose, onSaved, onError }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [show, setShow] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [saving, setSaving] = useState(false);

  // Check if admin is changing their own password
  const isOwnPassword = targetEmail.toLowerCase() === user.email.toLowerCase();

  const submit = async () => {
    if (password.length < 6) { onError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { onError('Passwords do not match'); return; }
    
    // Require current password when changing own password
    if (isOwnPassword && !currentPassword) {
      onError('Current password is required when changing your own password');
      return;
    }
    
    setSaving(true);
    try {
      const payload = { email: targetEmail, password };
      
      // Include current password if changing own password
      if (isOwnPassword) {
        payload.currentPassword = currentPassword;
      }
      
      await axios.post(`${BACKEND_URL}/api/admin/admins/change-password`,
        payload,
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      onSaved();
    } catch (e) {
      onError(e.response?.data?.error || e.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900/95 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-5 space-y-3 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2"><KeyRound className="w-4 h-4 text-blue-300" /> Change Password</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-400">For <span className="text-purple-300">{targetEmail}</span></p>

        {isOwnPassword && (
          <>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">For security, you must enter your current password to change your own password.</p>
            </div>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 bg-slate-800/60 border border-purple-500/20 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50"
                data-testid="current-pwd-input"
                autoFocus
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}

        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            placeholder="New password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 pr-10 bg-slate-800/60 border border-purple-500/20 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50"
            data-testid="change-pwd-input"
            autoFocus={!isOwnPassword}
          />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <input
          type={show ? 'text' : 'password'}
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-3 py-2 bg-slate-800/60 border border-purple-500/20 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50"
          data-testid="change-pwd-confirm"
        />

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-1.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-lg text-sm text-white disabled:opacity-50"
            data-testid="submit-change-pwd"
          >
            {saving ? 'Saving…' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ──────────── USERS ──────────── */
const UsersSection = ({ user }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${BACKEND_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (r.data.success) setUsers(r.data.users);
    } catch (e) { /* */ }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const act = async (uid, path, method = 'post', email = null) => {
    if (!window.confirm(`${path === 'disable' ? 'Disable' : path === 'enable' ? 'Enable' : 'Delete'} this user?`)) return;
    setBusy(uid);
    try {
      const headers = { Authorization: `Bearer ${user.token}` };
      const url = `${BACKEND_URL}/api/admin/users/${uid}${path === 'delete' ? '' : '/' + path}`;
      if (method === 'delete') await axios.delete(url, { headers });
      else await axios.post(url, { email }, { headers });
      load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
    setBusy(null);
  };

  const filtered = users.filter(u =>
    !search ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.displayName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <SectionHeader title="Users" subtitle={`${users.length} registered users`} onRefresh={load} loading={loading} />
      <div className="mb-4 relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          placeholder="Search by email or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-purple-500/20 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50"
          data-testid="admin-user-search"
        />
      </div>
      <div className="bg-slate-900/50 backdrop-blur-xl border border-purple-500/15 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-purple-500/20 text-[10px] uppercase text-slate-500 tracking-wider">
                <th className="text-left p-3 sm:p-4">User</th>
                <th className="text-left p-3 sm:p-4">Status</th>
                <th className="text-left p-3 sm:p-4">Created</th>
                <th className="text-left p-3 sm:p-4">Last sign-in</th>
                <th className="text-right p-3 sm:p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan="5" className="p-8 text-center text-slate-500">No users found</td></tr>
              )}
              {filtered.map(u => (
                <tr key={u.uid} className="border-b border-purple-500/10 hover:bg-purple-500/5 transition-colors" data-testid={`user-row-${u.uid}`}>
                  <td className="p-3 sm:p-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {(u.displayName || u.email || 'U')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white text-xs sm:text-sm truncate">{u.displayName || u.email}</p>
                        <p className="text-[10px] sm:text-xs text-slate-500 truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 sm:p-4">
                    <div className="flex flex-col gap-1">
                      {u.isAdmin && <Badge color="purple">Admin</Badge>}
                      {u.disabled ? <Badge color="red">Disabled</Badge> : <Badge color="green">Active</Badge>}
                    </div>
                  </td>
                  <td className="p-3 sm:p-4 text-xs text-slate-400">{fmtDate(u.createdAt)}</td>
                  <td className="p-3 sm:p-4 text-xs text-slate-400">{fmtDate(u.lastSignInAt) || '—'}</td>
                  <td className="p-3 sm:p-4">
                    <div className="flex items-center justify-end gap-1">
                      {!u.isAdmin && !u.disabled && (
                        <button onClick={() => act(u.uid, 'disable', 'post', u.email)} disabled={busy === u.uid}
                          className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-lg disabled:opacity-50"
                          title="Disable" data-testid={`disable-${u.uid}`}>
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {u.disabled && (
                        <button onClick={() => act(u.uid, 'enable')} disabled={busy === u.uid}
                          className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg disabled:opacity-50"
                          title="Enable" data-testid={`enable-${u.uid}`}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!u.isAdmin && (
                        <button onClick={() => act(u.uid, 'delete', 'delete')} disabled={busy === u.uid}
                          className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg disabled:opacity-50"
                          title="Delete" data-testid={`delete-${u.uid}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ──────────── ROOMS ──────────── */
const RoomsSection = ({ user }) => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${BACKEND_URL}/api/admin/rooms`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (r.data.success) setRooms(r.data.rooms);
    } catch (e) { /* */ }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const del = async (id) => {
    if (!window.confirm('Permanently delete this room? This cannot be undone.')) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/admin/rooms/${id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      load();
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  return (
    <div>
      <SectionHeader title="Rooms" subtitle={`${rooms.length} total rooms`} onRefresh={load} loading={loading} />
      <div className="bg-slate-900/50 backdrop-blur-xl border border-purple-500/15 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-purple-500/20 text-[10px] uppercase text-slate-500 tracking-wider">
                <th className="text-left p-3 sm:p-4">Room</th>
                <th className="text-left p-3 sm:p-4">Host</th>
                <th className="text-left p-3 sm:p-4">Members</th>
                <th className="text-left p-3 sm:p-4">Status</th>
                <th className="text-left p-3 sm:p-4">Created</th>
                <th className="text-right p-3 sm:p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rooms.length === 0 && (
                <tr><td colSpan="6" className="p-8 text-center text-slate-500">No rooms yet</td></tr>
              )}
              {rooms.map(r => (
                <tr key={r.id} className="border-b border-purple-500/10 hover:bg-purple-500/5 transition-colors">
                  <td className="p-3 sm:p-4">
                    <p className="text-white text-xs sm:text-sm font-medium truncate">{r.name}</p>
                    <p className="text-[10px] sm:text-xs font-mono text-purple-300">{r.id}</p>
                  </td>
                  <td className="p-3 sm:p-4 text-xs text-slate-300">{r.hostName}</td>
                  <td className="p-3 sm:p-4 text-xs text-slate-300">{Object.keys(r.members || {}).length}</td>
                  <td className="p-3 sm:p-4">
                    {r.isActive ? <Badge color="green">Active</Badge> : <Badge color="slate">Closed</Badge>}
                  </td>
                  <td className="p-3 sm:p-4 text-xs text-slate-400">{fmtDate(r.createdAt)}</td>
                  <td className="p-3 sm:p-4 text-right">
                    <button onClick={() => del(r.id)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ──────────── ANNOUNCEMENTS ──────────── */
const AnnouncementsSection = ({ user }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', message: '', level: 'info', active: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${BACKEND_URL}/api/admin/announcements`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (r.data.success) setItems(r.data.announcements);
    } catch (e) { /* */ }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.message.trim()) { alert('Message is required'); return; }
    setSaving(true);
    try {
      await axios.post(`${BACKEND_URL}/api/admin/announcements`, form, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      setForm({ title: '', message: '', level: 'info', active: true });
      setShowForm(false);
      load();
    } catch (e) { alert(e.response?.data?.error || e.message); }
    setSaving(false);
  };

  const toggle = async (id, active) => {
    try {
      await axios.put(`${BACKEND_URL}/api/admin/announcements/${id}`, { active: !active }, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      load();
    } catch (e) { /* */ }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/admin/announcements/${id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      load();
    } catch (e) { /* */ }
  };

  const LEVEL_COLORS = {
    info: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30 text-blue-300',
    success: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-300',
    warning: 'from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-300',
    critical: 'from-red-500/20 to-pink-500/20 border-red-500/30 text-red-300',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl sm:text-2xl font-bold">Announcements</h2>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-white text-sm font-medium" data-testid="new-announcement-btn">
          <Plus className="w-4 h-4" /> New
        </button>
      </div>
      <p className="text-sm text-slate-400 mb-5">Show a banner to every user. Activating one auto-deactivates others.</p>

      {showForm && (
        <div className="mb-5 bg-slate-900/60 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-4 sm:p-5 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">New Announcement</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <input placeholder="Title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2 bg-slate-800/60 border border-purple-500/20 rounded-xl text-sm text-white" data-testid="ann-title" />
          <textarea placeholder="Message..." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
            className="w-full px-3 py-2 bg-slate-800/60 border border-purple-500/20 rounded-xl text-sm text-white min-h-[80px]" data-testid="ann-message" />
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-400">Level:</label>
            {['info', 'success', 'warning', 'critical'].map(l => (
              <button key={l} onClick={() => setForm({ ...form, level: l })}
                className={`px-3 py-1 rounded-lg text-xs capitalize transition-all ${form.level === l ? 'bg-purple-500/30 text-purple-200 border border-purple-500/50' : 'bg-slate-800/50 text-slate-400 border border-slate-700/30'}`}>
                {l}
              </button>
            ))}
            <label className="flex items-center gap-1.5 text-xs text-slate-400 ml-2">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white">Cancel</button>
            <button onClick={save} disabled={saving} className="px-4 py-1.5 bg-purple-500/30 hover:bg-purple-500/40 border border-purple-500/50 rounded-lg text-sm text-white disabled:opacity-50" data-testid="save-ann-btn">
              {saving ? 'Saving...' : 'Publish'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {!loading && items.length === 0 && (
          <div className="bg-slate-900/40 border border-purple-500/15 rounded-2xl p-8 text-center text-slate-500">
            <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-50" />
            No announcements yet
          </div>
        )}
        {items.map(a => (
          <div key={a.id} className={`bg-gradient-to-r ${LEVEL_COLORS[a.level] || LEVEL_COLORS.info} border backdrop-blur-xl rounded-2xl p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {a.title && <h3 className="font-semibold text-white text-sm mb-1">{a.title}</h3>}
                <p className="text-sm text-slate-200 whitespace-pre-wrap">{a.message}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px]">
                  <span className="capitalize opacity-70">{a.level}</span>
                  <span className="opacity-50">·</span>
                  <span className="opacity-70">{fmtDate(a.createdAt)}</span>
                  <span className="opacity-50">·</span>
                  <span className="opacity-70">{a.createdBy}</span>
                  {a.active && <Badge color="green">Live</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => toggle(a.id, a.active)} className="px-2.5 py-1 text-[11px] bg-slate-800/50 hover:bg-slate-800 rounded-lg" title={a.active ? 'Deactivate' : 'Activate'}>
                  {a.active ? 'Pause' : 'Activate'}
                </button>
                <button onClick={() => del(a.id)} className="p-1.5 text-red-300 hover:bg-red-500/20 rounded-lg" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ──────────── PRIVACY POLICY ──────────── */
const PrivacySection = () => {
  const [policy, setPolicy] = useState(null);
  useEffect(() => {
    axios.get(`${BACKEND_URL}/api/privacy-policy`).then(r => {
      if (r.data.success) setPolicy(r.data.policy);
    });
  }, []);
  if (!policy) return <Skeleton />;
  return (
    <div>
      <SectionHeader title={policy.title} subtitle={`Last updated · ${policy.lastUpdated} · Read-only`} />
      <div className="bg-slate-900/50 backdrop-blur-xl border border-purple-500/15 rounded-2xl p-5 sm:p-6 max-w-3xl space-y-5">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex gap-3">
          <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-emerald-300 font-semibold text-sm">We do not store or share any of your data. Every call is end-to-end encrypted.</p>
            <p className="text-emerald-400/70 text-xs mt-1">This commitment is the foundation of the policy below.</p>
          </div>
        </div>
        {policy.sections.map((s, i) => (
          <div key={i}>
            <h3 className="text-sm font-semibold text-white mb-1.5">{s.heading}</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{s.body}</p>
          </div>
        ))}
        <p className="text-xs text-slate-500 pt-3 border-t border-purple-500/10">
          The privacy policy is hardcoded and immutable from the UI to preserve user trust. To modify, edit <span className="font-mono text-slate-400">backend/routes/public.js</span>.
        </p>
      </div>
    </div>
  );
};

/* ──────────── helpers ──────────── */
const SectionHeader = ({ title, subtitle, onRefresh, loading }) => (
  <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
    <div>
      <h2 className="text-xl sm:text-2xl font-bold">{title}</h2>
      {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
    {onRefresh && (
      <button onClick={onRefresh} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/60 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg text-xs text-slate-300 transition-all" data-testid="admin-refresh-btn">
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
      </button>
    )}
  </div>
);

const Badge = ({ children, color = 'purple' }) => {
  const c = {
    green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    red: 'bg-red-500/15 text-red-300 border-red-500/30',
    purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    slate: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
  }[color];
  return <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full border ${c}`}>{children}</span>;
};

const InfoRow = ({ label, value, ok }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-purple-500/5 last:border-0">
    <span className="text-slate-400">{label}</span>
    <span className={`flex items-center gap-1.5 font-medium ${ok ? 'text-emerald-300' : 'text-white'}`}>
      {ok && <CheckCircle2 className="w-3.5 h-3.5" />}
      {value}
    </span>
  </div>
);

const Skeleton = () => (
  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
    {[1, 2, 3, 4, 5, 6].map(i => (
      <div key={i} className="h-28 bg-slate-900/40 rounded-2xl animate-pulse" />
    ))}
  </div>
);

const fmtDate = (s) => {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString() + ' ' + new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
};

/* ─────────────────────── Users Updates section ─────────────────────── */

const UPDATE_TABS = [
  { key: 'help',     label: 'Help Requests',       icon: LifeBuoy,           accent: 'text-blue-200',   ring: 'border-blue-400/30',   tab: 'from-blue-500/20 to-cyan-500/10' },
  { key: 'feedback', label: 'Feedback',            icon: MessageSquareHeart, accent: 'text-pink-200',   ring: 'border-pink-400/30',   tab: 'from-pink-500/20 to-rose-500/10' },
  { key: 'feature',  label: 'Feature Suggestions', icon: Sparkles,           accent: 'text-purple-200', ring: 'border-purple-400/30', tab: 'from-purple-500/20 to-fuchsia-500/10' },
];

const UpdatesSection = ({ user, counts, refreshCounts }) => {
  const [tab, setTab] = useState('help');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const r = await axios.get(`${BACKEND_URL}/api/admin/support/${tab}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (r.data?.success) setItems(r.data.requests || []);
    } catch (e) { /* silent */ }
    setLoading(false);
  }, [user, tab]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, read: true } : it));
    try {
      await axios.post(`${BACKEND_URL}/api/admin/support/${tab}/${id}/read`, {}, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
    } catch (e) { /* silent */ }
    refreshCounts?.();
  };

  const openOne = (item) => {
    setExpandedId(prev => (prev === item.id ? null : item.id));
    if (!item.read) markRead(item.id);
  };

  const onReplied = (id, reply) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, reply, replied: true, read: true } : it));
    refreshCounts?.();
  };

  return (
    <div data-testid="updates-section">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/25 to-pink-500/20 border border-purple-400/30 flex items-center justify-center">
            <Inbox className="w-4 h-4 text-purple-200" />
          </div>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              Users Updates
              {counts.total > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-bold text-white rounded-full bg-gradient-to-br from-red-500 to-pink-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]" data-testid="updates-total-badge">
                  {counts.total}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400">Central inbox for all user communications.</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/60 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg text-xs text-slate-300 transition-all">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto wyth-scroll pb-1">
        {UPDATE_TABS.map(({ key, label, icon: Icon, accent, ring, tab: tabBg }) => {
          const active = tab === key;
          const badge = counts[key] || 0;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`relative shrink-0 flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-medium transition-all
                          border backdrop-blur-xl
                          ${active
                            ? `bg-gradient-to-br ${tabBg} ${ring} text-white shadow-[0_0_24px_-8px_rgba(168,85,247,0.4)]`
                            : 'bg-slate-800/40 border-purple-500/15 text-slate-400 hover:text-white hover:border-purple-400/40'}`}
              data-testid={`updates-tab-${key}`}
            >
              <Icon className={`w-4 h-4 ${active ? accent : ''}`} />
              <span>{label}</span>
              {badge > 0 && (
                <span
                  className="ml-1 min-w-[20px] h-[20px] px-1.5 flex items-center justify-center text-[10px] font-bold leading-none text-white bg-gradient-to-br from-red-500 to-pink-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                  data-testid={`updates-tab-badge-${key}`}
                >
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading && items.length === 0 && (
        <div className="text-center py-16">
          <Loader2 className="w-6 h-6 text-purple-300 animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-400">Loading…</p>
        </div>
      )}
      {!loading && items.length === 0 && (
        <div className="text-center py-16 bg-slate-900/40 backdrop-blur-xl border border-purple-500/15 rounded-2xl">
          <Inbox className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Nothing here yet.</p>
        </div>
      )}

      <div className="space-y-2.5">
        {items.map(item => (
          <RequestRow
            key={item.id}
            item={item}
            tab={tab}
            user={user}
            expanded={expandedId === item.id}
            onToggle={() => openOne(item)}
            onReplied={onReplied}
          />
        ))}
      </div>
    </div>
  );
};

const RequestRow = ({ item, tab, user, expanded, onToggle, onReplied }) => {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await axios.post(`${BACKEND_URL}/api/admin/support/${tab}/${item.id}/reply`, { text }, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (r.data?.success) {
        onReplied?.(item.id, r.data.reply);
        setReplying(false);
        setText('');
      }
    } catch (e) { /* silent */ }
    setBusy(false);
  };

  const titleLine = item.subject || item.title || 'Feedback';
  const bodyLine = item.message || item.description || '';

  return (
    <div
      className={`relative rounded-2xl backdrop-blur-xl border transition-all
                  ${item.read
                    ? 'bg-slate-900/50 border-purple-500/15'
                    : 'bg-slate-900/70 border-purple-400/40 shadow-[0_0_22px_-10px_rgba(168,85,247,0.5)]'}`}
      data-testid={`request-row-${item.id}`}
    >
      <button
        onClick={onToggle}
        className="w-full text-left p-4 sm:p-5"
        data-testid={`request-toggle-${item.id}`}
      >
        <div className="flex items-start gap-3">
          {!item.read && (
            <span className="mt-1.5 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] shrink-0" data-testid={`request-unread-dot-${item.id}`} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
              <h4 className="text-sm font-semibold text-white truncate">{titleLine}</h4>
              <span className="text-[11px] text-slate-500 shrink-0">{fmtDate(item.createdAt)}</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">
              <span className="text-purple-200">{item.name || '—'}</span>
              <span className="mx-1.5 text-slate-600">·</span>
              <span className="text-slate-400">{item.email}</span>
            </p>
            {bodyLine && (
              <p className={`text-sm text-slate-200 whitespace-pre-wrap leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
                {bodyLine}
              </p>
            )}
            {item.replied && item.reply && (
              <div className="mt-3 p-3 rounded-xl bg-purple-500/10 border border-purple-400/20">
                <p className="text-[10px] uppercase tracking-wider text-purple-200 mb-1">
                  Replied by {item.reply.adminName} · {fmtDate(item.reply.repliedAt)}
                </p>
                <p className={`text-sm text-slate-100 whitespace-pre-wrap leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
                  {item.reply.text}
                </p>
              </div>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-4">
          {!replying && (
            <button
              onClick={() => setReplying(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-xs text-white font-medium transition-all shadow-lg shadow-purple-500/25"
              data-testid={`request-reply-btn-${item.id}`}
            >
              <Reply className="w-3.5 h-3.5" /> {item.replied ? 'Send another reply' : 'Reply'}
            </button>
          )}
          {replying && (
            <div className="mt-1 space-y-2.5">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 4000))}
                rows={4}
                autoFocus
                placeholder="Type your reply…"
                className="w-full px-3.5 py-2.5 bg-slate-800/60 border border-purple-500/20 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/60 resize-none"
                data-testid={`reply-textarea-${item.id}`}
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => { setReplying(false); setText(''); }}
                  className="px-3.5 py-2 text-xs text-slate-400 hover:text-white rounded-xl bg-slate-800/40 hover:bg-slate-800/70 transition-all"
                >Cancel</button>
                <button
                  onClick={send}
                  disabled={busy || !text.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-xs text-white font-medium transition-all disabled:opacity-50"
                  data-testid={`reply-send-${item.id}`}
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {busy ? 'Sending…' : 'Send Reply'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
