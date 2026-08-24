import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Megaphone, X, AlertTriangle, CheckCircle2, AlertCircle, Info } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const LEVEL = {
  info: { bg: 'from-blue-600/30 to-cyan-600/30', border: 'border-blue-500/40', text: 'text-blue-100', Icon: Info },
  success: { bg: 'from-emerald-600/30 to-teal-600/30', border: 'border-emerald-500/40', text: 'text-emerald-100', Icon: CheckCircle2 },
  warning: { bg: 'from-amber-600/30 to-orange-600/30', border: 'border-amber-500/40', text: 'text-amber-100', Icon: AlertTriangle },
  critical: { bg: 'from-red-600/40 to-pink-600/30', border: 'border-red-500/50', text: 'text-red-100', Icon: AlertCircle },
};

const AnnouncementBanner = () => {
  const [ann, setAnn] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchAnn = async () => {
      try {
        const r = await axios.get(`${BACKEND_URL}/api/announcements/active`);
        if (!cancelled && r.data.success && r.data.announcement) {
          setAnn(r.data.announcement);
          const dismissedId = sessionStorage.getItem('wp_dismissed_ann');
          if (dismissedId === r.data.announcement.id) setDismissed(true);
        } else if (!cancelled) setAnn(null);
      } catch (e) { /* silent */ }
    };
    fetchAnn();
    const id = setInterval(fetchAnn, 60000); // refresh every minute
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!ann || dismissed) return null;

  const style = LEVEL[ann.level] || LEVEL.info;
  const { Icon } = style;

  return (
    <div className={`relative bg-gradient-to-r ${style.bg} ${style.border} border-b backdrop-blur-xl px-4 sm:px-6 py-2.5 transition-all duration-500`}
      data-testid="announcement-banner">
      <div className="max-w-6xl mx-auto flex items-start sm:items-center gap-3">
        <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${style.text} shrink-0 mt-0.5 sm:mt-0`} />
        <div className={`flex-1 min-w-0 ${style.text}`}>
          {ann.title && <p className="text-xs sm:text-sm font-semibold leading-tight">{ann.title}</p>}
          <p className="text-[11px] sm:text-xs opacity-90 leading-snug">{ann.message}</p>
        </div>
        <button onClick={() => { setDismissed(true); sessionStorage.setItem('wp_dismissed_ann', ann.id); }}
          className={`p-1 rounded-lg hover:bg-white/10 transition-colors ${style.text}`}
          data-testid="dismiss-announcement-btn" title="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default AnnouncementBanner;
