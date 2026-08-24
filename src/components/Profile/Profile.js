import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeft, Camera, Trash2, Save, KeyRound, Eye, EyeOff,
  Mail, Calendar, CheckCircle2, Loader2, UserRound, AlertCircle, RefreshCw, LogOut
} from 'lucide-react';
import { toast } from 'sonner';
import { retryAxiosRequest, getLoadingMessage } from '../../utils/apiRetry';
import SupportCenter from './SupportCenter';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const Profile = ({ onBack }) => {
  const { user, refreshUser, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading profile...');
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState({ displayName: '', bio: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pwd, setPwd] = useState({ a: '', b: '', show: false, saving: false });
  const fileRef = useRef(null);

  const load = async () => {
    if (!user?.token) return;
    setLoading(true);
    setLoadError(null);
    setLoadingMessage('Loading profile...');
    
    try {
      const r = await retryAxiosRequest(
        () => axios.get(`${BACKEND_URL}/api/profile/me`, {
          headers: { Authorization: `Bearer ${user.token}` },
        }),
        {
          onRetry: ({ attempt, maxRetries }) => {
            const msg = getLoadingMessage(attempt, maxRetries);
            setLoadingMessage(msg);
            console.log(`Loading profile (${attempt}/${maxRetries})...`);
          }
        }
      );
      
      if (r.data.success) {
        setProfile(r.data.profile);
        setForm({
          displayName: r.data.profile.displayName || '',
          bio: r.data.profile.bio || '',
        });
        setLoadError(null);
      }
    } catch (e) {
      console.error('Profile load error:', e);
      setLoadError('Unable to load profile. Please try again.');
      toast.error('Could not load your profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.token]);

  const save = async () => {
    if (!form.displayName.trim()) { toast.error('Display name is required'); return; }
    setSaving(true);
    try {
      await axios.put(`${BACKEND_URL}/api/profile/me`, form, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      toast.success('Profile updated');
      await refreshUser();
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not update profile');
    }
    setSaving(false);
  };

  const onPickFile = () => fileRef.current?.click();

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const r = await axios.post(`${BACKEND_URL}/api/profile/avatar`, fd, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (r.data.success) {
        toast.success('Avatar updated');
        await refreshUser();
        await load();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    }
    setUploading(false);
  };

  const removeAvatar = async () => {
    if (!profile?.photoURL) return;
    if (!window.confirm('Remove your avatar?')) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/profile/avatar`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      toast.success('Avatar removed');
      await refreshUser();
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not remove avatar');
    }
  };

  const changePwd = async () => {
    if (pwd.a.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (pwd.a !== pwd.b) { toast.error('Passwords do not match'); return; }
    setPwd(p => ({ ...p, saving: true }));
    try {
      await axios.post(`${BACKEND_URL}/api/profile/password`, { password: pwd.a }, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      toast.success('Password updated. Please log in again.');
      setTimeout(() => { logout(); }, 800);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not change password');
      setPwd(p => ({ ...p, saving: false }));
    }
  };

  if (loading || (!profile && !loadError)) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        <p className="text-sm text-slate-400">{loadingMessage}</p>
      </div>
    );
  }

  // Error state with retry
  if (loadError && !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 flex flex-col items-center justify-center text-white p-4">
        <div className="max-w-md w-full bg-slate-900/50 backdrop-blur-xl border border-red-500/30 rounded-2xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Unable to Load Profile</h2>
          <p className="text-slate-400 text-sm mb-6">{loadError}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={load}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-medium transition-all"
            >
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-medium transition-all"
            >
              <ArrowLeft className="w-4 h-4" /> Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const initial = (profile.displayName || profile.email || 'U')[0].toUpperCase();
  const dirty =
    (form.displayName || '') !== (profile.displayName || '') ||
    (form.bio || '') !== (profile.bio || '');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 text-white relative" data-testid="profile-page">
      {/* Ambient neon backdrop */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-purple-600/15 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 w-[400px] h-[400px] rounded-full bg-pink-600/10 blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-blue-500/10 blur-[110px]" />
      </div>
      <header className="relative flex items-center justify-between px-4 sm:px-6 py-3 bg-slate-900/70 backdrop-blur-xl border-b border-purple-500/20 sticky top-0 z-30">
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={onBack} className="p-2 text-slate-400 hover:text-white hover:bg-purple-500/10 rounded-lg transition-all" data-testid="profile-back-btn" title="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-purple-400/30 flex items-center justify-center">
            <UserRound className="w-4 h-4 text-purple-200" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight">My Profile</h1>
            <p className="text-[11px] text-slate-500 truncate max-w-[60vw]">{profile.email}</p>
          </div>
        </div>
      </header>

      <main className="relative max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Avatar card */}
        <section className="bg-slate-900/50 backdrop-blur-xl border border-purple-500/15 rounded-2xl p-5 sm:p-6">
          <h2 className="text-sm font-semibold mb-4 text-slate-200">Avatar</h2>
          <div className="flex items-center gap-5 flex-wrap">
            <div className="relative">
              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-3xl font-bold text-white shadow-lg shadow-purple-500/20">
                {profile.photoURL ? (
                  <img src={profile.photoURL} alt="avatar" className="w-full h-full object-cover" data-testid="profile-avatar-img" />
                ) : (
                  <span>{initial}</span>
                )}
              </div>
              {uploading && (
                <div className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-[180px]">
              <p className="text-xs text-slate-400 mb-3">PNG, JPG, WEBP up to 5MB. A circular crop is applied across the app.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={onPickFile}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-sm text-white font-medium disabled:opacity-50"
                  data-testid="upload-avatar-btn"
                >
                  <Camera className="w-4 h-4" /> {profile.photoURL ? 'Change' : 'Upload'} Photo
                </button>
                {profile.photoURL && (
                  <button
                    onClick={removeAvatar}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl text-sm text-red-300"
                    data-testid="remove-avatar-btn"
                  >
                    <Trash2 className="w-4 h-4" /> Remove
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFileChange} data-testid="avatar-file-input" />
              </div>
            </div>
          </div>
        </section>

        {/* Identity card */}
        <section className="bg-slate-900/50 backdrop-blur-xl border border-purple-500/15 rounded-2xl p-5 sm:p-6">
          <h2 className="text-sm font-semibold mb-4 text-slate-200">Identity</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Display name</label>
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                maxLength={50}
                className="w-full px-3.5 py-2.5 bg-slate-800/60 border border-purple-500/20 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50"
                placeholder="How others see you"
                data-testid="profile-displayname-input"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Bio <span className="text-slate-600">({(form.bio || '').length}/280)</span></label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value.slice(0, 280) })}
                rows={3}
                className="w-full px-3.5 py-2.5 bg-slate-800/60 border border-purple-500/20 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50 resize-none"
                placeholder="A short bio — visible nowhere unless you share it. Just for you."
                data-testid="profile-bio-input"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <InfoRow icon={Mail} label="Email" value={profile.email} verified={profile.emailVerified} />
              <InfoRow icon={Calendar} label="Member since" value={fmt(profile.createdAt)} />
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={save}
                disabled={saving || !dirty}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-sm text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="profile-save-btn"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </section>

        {/* Password */}
        <section className="bg-slate-900/50 backdrop-blur-xl border border-purple-500/15 rounded-2xl p-5 sm:p-6">
          <h2 className="text-sm font-semibold mb-1 text-slate-200 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-300" /> Change Password
          </h2>
          <p className="text-xs text-slate-500 mb-4">After updating, you'll be signed out and asked to log in again.</p>
          <div className="space-y-3">
            <div className="relative">
              <input
                type={pwd.show ? 'text' : 'password'}
                value={pwd.a}
                onChange={(e) => setPwd({ ...pwd, a: e.target.value })}
                placeholder="New password (min 6 chars)"
                className="w-full px-3.5 py-2.5 pr-10 bg-slate-800/60 border border-purple-500/20 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50"
                data-testid="profile-new-pwd"
              />
              <button type="button" onClick={() => setPwd(p => ({ ...p, show: !p.show }))} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white">
                {pwd.show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <input
              type={pwd.show ? 'text' : 'password'}
              value={pwd.b}
              onChange={(e) => setPwd({ ...pwd, b: e.target.value })}
              placeholder="Confirm password"
              className="w-full px-3.5 py-2.5 bg-slate-800/60 border border-purple-500/20 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50"
              data-testid="profile-confirm-pwd"
            />
            <div className="flex justify-end">
              <button
                onClick={changePwd}
                disabled={pwd.saving || !pwd.a}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl text-sm text-white font-medium disabled:opacity-40"
                data-testid="profile-change-pwd-btn"
              >
                {pwd.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {pwd.saving ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </div>
        </section>

        {/* Support & Feedback */}
        <SupportCenter />

        {/* Logout — full-width premium */}
        <section className="pt-2">
          <button
            onClick={() => {
              if (window.confirm('Sign out of WYTH?')) logout();
            }}
            className="group relative w-full overflow-hidden flex items-center justify-center gap-2.5
                       py-4 rounded-2xl text-sm font-semibold tracking-wide text-red-200
                       bg-gradient-to-br from-red-500/10 via-rose-500/10 to-red-500/5
                       backdrop-blur-xl border border-red-500/30
                       hover:border-red-400/60 hover:text-red-100
                       shadow-[0_0_24px_-8px_rgba(239,68,68,0.4)]
                       hover:shadow-[0_0_36px_-6px_rgba(239,68,68,0.7)]
                       transition-all active:scale-[0.985]"
            data-testid="profile-logout-btn"
          >
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-red-400/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </button>
          <p className="text-center text-[11px] text-slate-500 mt-2.5">
            You&apos;ll be redirected to the sign-in page.
          </p>
        </section>
      </main>
    </div>
  );
};

const InfoRow = ({ icon: Icon, label, value, verified }) => (
  <div className="flex items-start gap-2.5 px-3 py-2.5 bg-slate-800/40 border border-purple-500/10 rounded-xl">
    <Icon className="w-3.5 h-3.5 text-purple-300 mt-0.5 shrink-0" />
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-slate-200 truncate flex items-center gap-1.5">
        {value || '—'}
        {verified && <CheckCircle2 className="w-3 h-3 text-emerald-400" title="Verified" />}
      </p>
    </div>
  </div>
);

const fmt = (s) => {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
};

export default Profile;
