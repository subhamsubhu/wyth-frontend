import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Shield, X } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const PrivacyPolicyModal = ({ onClose }) => {
  const [policy, setPolicy] = useState(null);

  useEffect(() => {
    axios.get(`${BACKEND_URL}/api/privacy-policy`).then(r => {
      if (r.data.success) setPolicy(r.data.policy);
    });
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="privacy-modal">
      <div className="w-full max-w-2xl max-h-[85vh] bg-slate-900/95 backdrop-blur-xl border border-purple-500/30 rounded-2xl flex flex-col shadow-2xl shadow-purple-500/20 animate-in fade-in">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-purple-500/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">{policy?.title || 'Privacy Policy'}</h2>
              <p className="text-[11px] text-slate-500">Last updated · {policy?.lastUpdated || '—'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors" data-testid="close-privacy-btn">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 flex gap-2.5">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm text-emerald-200 font-medium">
              We do not store or share any of your data. Every call is end-to-end encrypted.
            </p>
          </div>
          {!policy && (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-slate-800/40 rounded-lg animate-pulse" />)}
            </div>
          )}
          {policy?.sections.map((s, i) => (
            <div key={i}>
              <h3 className="text-sm font-semibold text-purple-300 mb-1.5">{s.heading}</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="p-3 sm:p-4 border-t border-purple-500/20 text-center text-[11px] text-slate-500 shrink-0">
          By using WYTH you agree to these terms.
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyModal;
