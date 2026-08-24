import React, { useState, useRef } from 'react';
import { useRoom } from '../../contexts/RoomContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Upload, Link2, Film, Youtube, HardDrive, Loader2, CheckCircle2, X } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const VideoUploader = ({ onClose }) => {
  const { loadVideo } = useRoom();
  const fileInputRef = useRef(null);

  const [tab, setTab] = useState('link');
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [error, setError] = useState('');

  const detectPlatform = (link) => {
    if (link.includes('drive.google.com')) return { icon: HardDrive, name: 'Google Drive', color: 'text-green-400' };
    if (link.includes('youtube.com') || link.includes('youtu.be')) return { icon: Youtube, name: 'YouTube', color: 'text-red-400' };
    if (link.includes('vimeo.com')) return { icon: Film, name: 'Vimeo', color: 'text-blue-400' };
    return { icon: Link2, name: 'Direct Link', color: 'text-slate-400' };
  };

  const handlePasteLink = () => {
    if (!url.trim()) { setError('Please enter a URL'); return; }
    setError('');
    loadVideo(url.trim());
    onClose?.();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { setError('Please select a video file'); return; }
    if (file.size > 500 * 1024 * 1024) { setError('File size must be under 500MB'); return; }

    setError('');
    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('video', file);

      const response = await axios.post(`${BACKEND_URL}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          const pct = Math.round((e.loaded * 100) / e.total);
          setUploadProgress(pct);
        }
      });

      if (response.data.success) {
        setUploading(false);
        setUploadComplete(true);
        loadVideo(response.data.url, 'direct');
        setTimeout(() => onClose?.(), 1500);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('Upload failed. Please try again or use a video link instead.');
      setUploading(false);
    }
  };

  const platform = url ? detectPlatform(url) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="video-uploader-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="w-full max-w-lg bg-slate-900/95 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-5 shadow-2xl shadow-purple-500/10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Load Video</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1" data-testid="close-uploader-btn"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-2 mb-5">
          <button onClick={() => setTab('link')} className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${tab === 'link' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-slate-800/50 text-slate-400 border border-slate-700/50'}`} data-testid="tab-link">
            <Link2 className="w-4 h-4" /> Paste Link
          </button>
          <button onClick={() => setTab('upload')} className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${tab === 'upload' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-slate-800/50 text-slate-400 border border-slate-700/50'}`} data-testid="tab-upload">
            <Upload className="w-4 h-4" /> Upload File
          </button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">{error}</div>}

        {tab === 'link' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300 text-sm">Video URL</Label>
              <Input placeholder="Paste YouTube, Google Drive, Vimeo, or direct URL..." value={url} onChange={(e) => setUrl(e.target.value)}
                className="bg-slate-800/50 border-purple-500/30 text-white placeholder:text-slate-500" data-testid="video-url-input" />
            </div>
            {platform && url && (
              <div className="flex items-center gap-2 p-2.5 bg-slate-800/30 rounded-xl">
                <platform.icon className={`w-4 h-4 ${platform.color}`} />
                <span className="text-xs text-slate-300">Detected: <span className={platform.color}>{platform.name}</span></span>
              </div>
            )}
            <div className="text-xs text-slate-500 space-y-1">
              <p className="font-semibold text-slate-400">Supported:</p>
              <p>YouTube, Google Drive (shared), Vimeo, Direct .mp4/.webm</p>
              <p className="text-purple-400">Tip: For Google Drive, set sharing to "Anyone with the link"</p>
              <p className="text-amber-400 mt-2">⚠️ For uploads, use H.264 MP4 (not HEVC/H.265). Many phone recordings need re-encoding.</p>
            </div>
            <Button onClick={handlePasteLink} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white" data-testid="load-video-btn">
              <Film className="w-4 h-4 mr-2" /> Load Video
            </Button>
          </div>
        )}

        {tab === 'upload' && (
          <div className="space-y-4">
            {!uploading && !uploadComplete && (
              <>
                <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-purple-500/30 rounded-2xl p-8 text-center cursor-pointer hover:border-purple-500/60 hover:bg-purple-500/5 transition-all" data-testid="file-drop-zone">
                  <Upload className="w-10 h-10 text-purple-400 mx-auto mb-2" />
                  <p className="text-white font-medium text-sm mb-1">Tap to select video</p>
                  <p className="text-xs text-slate-400">MP4, WebM, OGG - Max 500MB</p>
                </div>
                <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileUpload} className="hidden" data-testid="file-input" />
              </>
            )}
            {uploading && (
              <div className="text-center py-6">
                <Loader2 className="w-10 h-10 text-purple-400 animate-spin mx-auto mb-3" />
                <p className="text-white font-medium text-sm mb-2">Uploading video...</p>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="text-xs text-purple-300">{uploadProgress}%</p>
              </div>
            )}
            {uploadComplete && (
              <div className="text-center py-6">
                <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
                <p className="text-white font-medium text-sm">Upload complete!</p>
                <p className="text-xs text-slate-400 mt-1">Video is loading...</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoUploader;
