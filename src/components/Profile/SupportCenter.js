/**
 * Support & Feedback Center — premium 3-card grid embedded inside Profile.
 *
 *   1. Help Request       → subject + message
 *   2. Feedback           → message
 *   3. Feature Suggestion → title + description
 *
 * All three POST to /api/support/* — user identity (uid/email/name) is
 * attached server-side from the verified Firebase ID token, never trusted
 * from the client body.
 */

import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { LifeBuoy, MessageSquareHeart, Sparkles, X, Send, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const SupportCenter = () => {
  const [openType, setOpenType] = useState(null);

  return (
    <section
      className="relative overflow-hidden bg-gradient-to-br from-slate-900/60 via-slate-900/50 to-slate-900/40
                 backdrop-blur-2xl border border-purple-500/20 rounded-3xl p-5 sm:p-7
                 shadow-[0_8px_40px_-12px_rgba(168,85,247,0.25)]"
      data-testid="support-center"
    >
      {/* Decorative neon glow */}
      <div className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-purple-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 w-72 h-72 rounded-full bg-pink-500/10 blur-3xl" />

      <div className="relative">
        <div className="flex items-center gap-2.5 mb-1">
          <Sparkles className="w-4 h-4 text-purple-300" />
          <h2 className="text-sm font-semibold tracking-wider text-purple-200 uppercase">Support &amp; Feedback</h2>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mb-5">
          We read every message. Pick whichever fits — we usually reply within a day.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SupportCard
            icon={LifeBuoy}
            title="Help Request"
            desc="Stuck on something? Let us help."
            tint="from-blue-500/20 to-cyan-500/10"
            ring="border-blue-400/30 hover:border-blue-400/60"
            glow="hover:shadow-[0_0_30px_-5px_rgba(96,165,250,0.4)]"
            iconColor="text-blue-200"
            onClick={() => setOpenType('help')}
            testId="open-help-modal"
          />
          <SupportCard
            icon={MessageSquareHeart}
            title="Feedback"
            desc="Love it? Hate it? Tell us all."
            tint="from-pink-500/20 to-rose-500/10"
            ring="border-pink-400/30 hover:border-pink-400/60"
            glow="hover:shadow-[0_0_30px_-5px_rgba(244,114,182,0.4)]"
            iconColor="text-pink-200"
            onClick={() => setOpenType('feedback')}
            testId="open-feedback-modal"
          />
          <SupportCard
            icon={Sparkles}
            title="Feature Suggestion"
            desc="Got an idea? Shape what's next."
            tint="from-purple-500/25 to-fuchsia-500/10"
            ring="border-purple-400/30 hover:border-purple-400/60"
            glow="hover:shadow-[0_0_30px_-5px_rgba(192,132,252,0.45)]"
            iconColor="text-purple-200"
            onClick={() => setOpenType('feature')}
            testId="open-feature-modal"
          />
        </div>
      </div>

      {openType === 'help' && <HelpModal onClose={() => setOpenType(null)} />}
      {openType === 'feedback' && <FeedbackModal onClose={() => setOpenType(null)} />}
      {openType === 'feature' && <FeatureModal onClose={() => setOpenType(null)} />}
    </section>
  );
};

const SupportCard = ({ icon: Icon, title, desc, tint, ring, glow, iconColor, onClick, testId }) => (
  <button
    onClick={onClick}
    className={`group relative overflow-hidden text-left p-4 rounded-2xl
                bg-gradient-to-br ${tint}
                border ${ring}
                backdrop-blur-xl transition-all duration-300
                ${glow}
                hover:-translate-y-0.5 active:translate-y-0`}
    data-testid={testId}
  >
    <div className="flex items-center gap-2.5 mb-2">
      <div className="w-10 h-10 rounded-xl bg-slate-950/40 border border-white/10 flex items-center justify-center">
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
    </div>
    <p className="text-[11.5px] text-slate-300/80 leading-relaxed">{desc}</p>
    <div className="pointer-events-none absolute -bottom-10 -right-10 w-24 h-24 rounded-full bg-white/5 blur-2xl group-hover:bg-white/10 transition-all" />
  </button>
);

/* ─────────────── Modal shell ─────────────── */

const ModalShell = ({ title, accent, onClose, children, testId }) => (
  <div
    className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-6 wyth-fade-in"
    onClick={onClose}
    data-testid={testId}
  >
    <div
      className="w-full sm:max-w-md bg-gradient-to-b from-slate-900/95 to-slate-950/95
                 backdrop-blur-2xl border border-purple-500/25
                 rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-purple-900/40
                 overflow-hidden wyth-slide-up"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-purple-500/15">
        <h3 className={`text-base font-bold ${accent}`}>{title}</h3>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-full"
          data-testid="support-modal-close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

const Field = ({ label, children }) => (
  <div className="mb-3.5">
    <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
    {children}
  </div>
);

const inputCls = `w-full px-3.5 py-2.5 bg-slate-800/60 border border-purple-500/20 rounded-xl
                  text-sm text-white placeholder:text-slate-500
                  focus:outline-none focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20 transition-all`;

const submitCls = (busy) => `w-full flex items-center justify-center gap-2 py-3 rounded-xl
                              text-sm font-semibold text-white
                              bg-gradient-to-r from-purple-600 to-pink-600
                              hover:from-purple-500 hover:to-pink-500
                              shadow-lg shadow-purple-500/30 transition-all
                              disabled:opacity-50 disabled:cursor-not-allowed
                              ${busy ? '' : 'hover:shadow-purple-500/50 hover:-translate-y-0.5'}`;

const useSubmit = (endpoint, onClose, validate) => {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const submit = async (body) => {
    const err = validate?.(body);
    if (err) { toast.error(err); return; }
    setBusy(true);
    try {
      const r = await axios.post(`${BACKEND_URL}/api/support/${endpoint}`, body, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (r.data?.success) {
        toast.success('Sent — thanks! We\'ll get back to you.');
        onClose();
      } else {
        toast.error(r.data?.error || 'Could not send');
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not send');
    }
    setBusy(false);
  };
  return { busy, submit };
};

/* ─────────────── Help ─────────────── */

const HelpModal = ({ onClose }) => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const { busy, submit } = useSubmit('help', onClose, (b) => {
    if (!b.subject.trim()) return 'Subject is required';
    if (!b.message.trim()) return 'Message is required';
    return null;
  });
  return (
    <ModalShell title="Need a hand?" accent="text-blue-200" onClose={onClose} testId="help-modal">
      <Field label="Subject">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value.slice(0, 200))}
          maxLength={200}
          placeholder="e.g. I can't share my screen"
          className={inputCls}
          data-testid="help-subject-input"
        />
      </Field>
      <Field label="Message">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
          rows={5}
          placeholder="Tell us what's happening, what you tried, and on which device."
          className={`${inputCls} resize-none`}
          data-testid="help-message-input"
        />
      </Field>
      <button
        onClick={() => submit({ subject, message })}
        disabled={busy}
        className={submitCls(busy)}
        data-testid="help-submit-btn"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {busy ? 'Sending…' : 'Send Help Request'}
      </button>
    </ModalShell>
  );
};

/* ─────────────── Feedback ─────────────── */

const FeedbackModal = ({ onClose }) => {
  const [message, setMessage] = useState('');
  const { busy, submit } = useSubmit('feedback', onClose, (b) => {
    if (!b.message.trim()) return 'Feedback message is required';
    return null;
  });
  return (
    <ModalShell title="Share your feedback" accent="text-pink-200" onClose={onClose} testId="feedback-modal">
      <Field label="Your Feedback">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
          rows={6}
          placeholder="What's working? What's not? What would make WYTH unmissable?"
          className={`${inputCls} resize-none`}
          data-testid="feedback-message-input"
        />
      </Field>
      <button
        onClick={() => submit({ message })}
        disabled={busy}
        className={submitCls(busy)}
        data-testid="feedback-submit-btn"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {busy ? 'Sending…' : 'Send Feedback'}
      </button>
    </ModalShell>
  );
};

/* ─────────────── Feature suggestion ─────────────── */

const FeatureModal = ({ onClose }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const { busy, submit } = useSubmit('feature', onClose, (b) => {
    if (!b.title.trim()) return 'Feature title is required';
    if (!b.description.trim()) return 'Description is required';
    return null;
  });
  return (
    <ModalShell title="Suggest a feature" accent="text-purple-200" onClose={onClose} testId="feature-modal">
      <Field label="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 200))}
          maxLength={200}
          placeholder="e.g. Netflix room sync"
          className={inputCls}
          data-testid="feature-title-input"
        />
      </Field>
      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 4000))}
          rows={5}
          placeholder="What does it do? Who benefits? Why would it matter?"
          className={`${inputCls} resize-none`}
          data-testid="feature-description-input"
        />
      </Field>
      <button
        onClick={() => submit({ title, description })}
        disabled={busy}
        className={submitCls(busy)}
        data-testid="feature-submit-btn"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {busy ? 'Sending…' : 'Send Suggestion'}
      </button>
    </ModalShell>
  );
};

export default SupportCenter;
