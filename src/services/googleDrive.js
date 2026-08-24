// -----------------------------------------------------------------------------
// Google Drive + Picker service
// -----------------------------------------------------------------------------
// Lazy-loads three Google JavaScript SDKs:
//   1. `gapi`           — classic Google API client (used to load `picker`).
//   2. `google.picker`  — Google Picker UI (file browser + uploader).
//   3. `google.accounts.oauth2` — Google Identity Services (token client) for
//      OAuth scopes that are required by Picker + Drive API permission writes.
//
// The module exposes:
//   * `getDriveAccessToken({ prompt })` — interactively (or silently) requests
//     an OAuth access token with the Drive scope.
//   * `openDrivePicker({ accessToken, onPicked, onCancel })` — opens the
//     Picker UI with Drive browse + upload tabs; restricted to video MIME
//     types. Calls `onPicked(file)` for each file the user selects.
//   * `ensureFileSharedAnyone(fileId, accessToken)` — adds a "anyone with
//     the link can read" permission so every room participant can stream
//     the file without their own Google login.
//   * `buildDriveMediaUrl(fileId)` — produces a direct HTML5-compatible
//     streaming URL.
// -----------------------------------------------------------------------------

const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const DRIVE_API_KEY = process.env.REACT_APP_GOOGLE_DRIVE_API_KEY;
const PICKER_API_KEY = process.env.REACT_APP_GOOGLE_PICKER_API_KEY;
const APP_ID = process.env.REACT_APP_GOOGLE_APP_ID;

// Scope: `drive.file` is a NON-SENSITIVE scope. It limits the app's access
// to *only* the files the user explicitly picks via the Picker or uploads
// through this app — never the rest of their Drive. The big advantage: the
// OAuth consent screen can be published to "Production" without going
// through Google's restricted-scope verification process, so ANY Gmail
// user can sign in instantly (no 100 test-user cap).
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const GAPI_SRC = 'https://apis.google.com/js/api.js';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

// In-memory token cache. The token is short-lived (1h); we always re-request
// silently on refresh, which is a no-op if the user is still signed in.
let cachedToken = null;
let cachedTokenExpiry = 0;
let tokenClient = null;
let scriptPromises = {};

function loadScript(src) {
  if (scriptPromises[src]) return scriptPromises[src];
  scriptPromises[src] = new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      delete scriptPromises[src];
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(s);
  });
  return scriptPromises[src];
}

async function loadGapi() {
  await loadScript(GAPI_SRC);
  // Wait for window.gapi to actually exist.
  await new Promise((resolve) => {
    const tick = () => (window.gapi ? resolve() : setTimeout(tick, 30));
    tick();
  });
  // Load the picker module.
  await new Promise((resolve, reject) => {
    window.gapi.load('picker', { callback: resolve, onerror: reject });
  });
}

async function loadGis() {
  await loadScript(GIS_SRC);
  await new Promise((resolve) => {
    const tick = () => (window.google && window.google.accounts && window.google.accounts.oauth2 ? resolve() : setTimeout(tick, 30));
    tick();
  });
}

function ensureConfig() {
  if (!CLIENT_ID) throw new Error('REACT_APP_GOOGLE_CLIENT_ID is not set');
  if (!PICKER_API_KEY) throw new Error('REACT_APP_GOOGLE_PICKER_API_KEY is not set');
}

// Returns a cached token if still valid; otherwise requests a new one.
// `prompt` is one of '' (silent), 'consent' (force consent screen). Default ''.
export function getDriveAccessToken({ prompt = '' } = {}) {
  ensureConfig();
  return new Promise(async (resolve, reject) => {
    try {
      await loadGis();

      const now = Date.now();
      if (cachedToken && cachedTokenExpiry > now + 60_000 && prompt !== 'consent') {
        resolve(cachedToken);
        return;
      }

      if (!tokenClient) {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: DRIVE_SCOPE,
          callback: () => {}, // overridden per-call below
        });
      }

      tokenClient.callback = (resp) => {
        if (resp && resp.error) {
          reject(new Error(resp.error_description || resp.error));
          return;
        }
        if (!resp || !resp.access_token) {
          reject(new Error('No access token returned from Google'));
          return;
        }
        cachedToken = resp.access_token;
        cachedTokenExpiry = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
        resolve(cachedToken);
      };

      tokenClient.requestAccessToken({ prompt });
    } catch (err) {
      reject(err);
    }
  });
}

// Build a Picker view restricted to video MIME types only.
function buildVideoView() {
  const View = window.google.picker.View;
  const ViewId = window.google.picker.ViewId;
  const view = new View(ViewId.DOCS);
  view.setMimeTypes(
    'video/mp4,video/webm,video/ogg,video/quicktime,video/x-msvideo,video/x-matroska,video/mpeg,video/3gpp,video/avi,application/vnd.google-apps.video'
  );
  return view;
}

export async function openDrivePicker({ onPicked, onCancel } = {}) {
  ensureConfig();
  await loadGapi();
  const accessToken = await getDriveAccessToken({ prompt: '' });

  const picker = new window.google.picker.PickerBuilder()
    .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
    .enableFeature(window.google.picker.Feature.SUPPORT_DRIVES)
    .setOAuthToken(accessToken)
    .setDeveloperKey(PICKER_API_KEY)
    .setAppId(APP_ID)
    .addView(buildVideoView())
    .addView(new window.google.picker.DocsUploadView().setIncludeFolders(true))
    .setTitle('Pick a video from Google Drive')
    .setCallback((data) => {
      const Action = window.google.picker.Action;
      if (data.action === Action.PICKED) {
        const docs = (data.docs || []).filter(Boolean);
        if (typeof onPicked === 'function') onPicked(docs, accessToken);
      } else if (data.action === Action.CANCEL) {
        if (typeof onCancel === 'function') onCancel();
      }
    })
    .build();

  picker.setVisible(true);
  return picker;
}

// Add an "anyone with link, role=reader" permission so every room participant
// can stream the file without their own Google account. Idempotent — the
// Drive API will silently no-op if the permission already exists.
export async function ensureFileSharedAnyone(fileId, accessToken) {
  if (!fileId || !accessToken) return;
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone', allowFileDiscovery: false }),
    });
  } catch (e) {
    // Non-fatal — the playback URL fallback may still work for files already
    // shared. Log for debugging.
    // eslint-disable-next-line no-console
    console.warn('[GDrive] ensureFileSharedAnyone failed:', e);
  }
}

// Build a streaming URL for the picked Drive file.
//
// Google has progressively tightened cross-origin access on the
// `drive.google.com/uc?export=download` endpoint — browsers now receive
// either an HTML virus-scan interstitial or a 403 when an HTML5 <video>
// element on a non-Drive origin requests it. The `confirm=t` workaround
// no longer works for arbitrary files.
//
// The robust path is Drive's embedded preview iframe (`/file/d/<id>/preview`),
// which:
//   • works for ANY file size,
//   • plays ANY codec the user's browser supports,
//   • does not require the file's owner to be signed in on the viewer's
//     browser (only the "anyone-with-link can read" permission we set in
//     `ensureFileSharedAnyone`).
//
// Trade-off: the iframe does not expose a JS API, so play/pause/seek are
// per-user (best-effort, not frame-accurate). The URL load itself IS
// synced through the existing watch-party socket events, so every member
// of the room loads the same file at the same moment.
export function buildDriveMediaUrl(fileId) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}

// Convenience: end-to-end helper used by the UI button. Opens the picker,
// awaits the user's selection, ensures the file is publicly readable, and
// returns the streamable URL + file metadata.
export function pickDriveVideo() {
  return new Promise((resolve, reject) => {
    openDrivePicker({
      onPicked: async (docs, accessToken) => {
        try {
          const doc = docs[0];
          if (!doc || !doc.id) {
            reject(new Error('No file selected'));
            return;
          }
          await ensureFileSharedAnyone(doc.id, accessToken);
          const url = buildDriveMediaUrl(doc.id);
          resolve({
            url,
            videoType: 'direct',
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            sizeBytes: doc.sizeBytes,
            iconUrl: doc.iconUrl,
            embedUrl: doc.embedUrl,
          });
        } catch (e) {
          reject(e);
        }
      },
      onCancel: () => reject({ canceled: true }),
    }).catch(reject);
  });
}
