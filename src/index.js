const _backend = process.env.REACT_APP_BACKEND_URL;
if (!_backend || /preview\.emergentagent\.com|localhost|undefined/i.test(_backend)) {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:#1a0000;color:#fff;' +
    'font:14px/1.5 monospace;padding:24px;white-space:pre-wrap';
  el.textContent =
    'BUILD MISCONFIGURED\n\nREACT_APP_BACKEND_URL = ' + _backend +
    '\n\nSet it in Netlify → Site settings → Environment variables, then ' +
    '"Clear cache and deploy site".';
  window.addEventListener('DOMContentLoaded', () => document.body.appendChild(el));
}

import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Suppress cross-origin iframe errors (YouTube/Google Drive embeds)
window.addEventListener('error', (event) => {
  if (event.message === 'Script error.' || event.message?.includes('Script error')) {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  // Suppress Firebase/iframe related promise rejections
  if (event.reason?.message?.includes('cross-origin') ||
      event.reason?.message?.includes('Script error') ||
      event.reason?.code === 'ERR_BLOCKED_BY_CLIENT') {
    event.preventDefault();
  }
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
