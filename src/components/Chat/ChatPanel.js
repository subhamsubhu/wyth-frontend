import React, { useState, useRef, useEffect } from 'react';
import { useRoom } from '../../contexts/RoomContext';
import { useAuth } from '../../contexts/AuthContext';
import { Send, Lock, Smile } from 'lucide-react';

const EMOJIS = ['😂', '❤️', '🔥', '👍', '😍', '🎬', '🍿', '🎉', '😮', '👏', '💯', '😎'];

const ChatPanel = () => {
  const { messages, sendMessage } = useRoom();
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput('');
    setShowEmoji(false);
  };

  const addEmoji = (emoji) => {
    setInput(prev => prev + emoji);
    inputRef.current?.focus();
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-purple-500/20 overflow-hidden" data-testid="chat-panel">
      {/* Header */}
      <div className="px-4 py-3 border-b border-purple-500/20 flex items-center justify-between">
        <h3 className="font-semibold text-white text-sm">Live Chat</h3>
        <div className="flex items-center gap-1 text-xs text-green-400">
          <Lock className="w-3 h-3" />
          <span>Encrypted</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0" data-testid="chat-messages">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-slate-500 text-sm">No messages yet. Say something!</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.userId === user?.uid;
          const displayMsg = typeof msg.message === 'object' ? '[Encrypted]' : msg.message;
          return (
            <div key={msg.id || i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] ${isMe ? 'order-2' : ''}`}>
                {!isMe && (
                  <p className="text-xs text-purple-400 mb-0.5 ml-1">{msg.userName}</p>
                )}
                <div className={`px-3 py-2 rounded-2xl text-sm ${
                  isMe
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-br-md'
                    : 'bg-slate-800/80 text-slate-200 rounded-bl-md'
                }`}>
                  {displayMsg}
                </div>
                <p className={`text-[10px] text-slate-600 mt-0.5 ${isMe ? 'text-right mr-1' : 'ml-1'}`}>
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Emoji picker */}
      {showEmoji && (
        <div className="px-3 py-2 border-t border-purple-500/10 flex flex-wrap gap-1">
          {EMOJIS.map(e => (
            <button key={e} onClick={() => addEmoji(e)} className="p-1.5 hover:bg-slate-800 rounded-lg text-lg transition-colors">
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="p-3 pb-5 border-t border-purple-500/20 flex gap-2">
        <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="text-slate-400 hover:text-purple-400 transition-colors shrink-0" data-testid="emoji-btn">
          <Smile className="w-5 h-5" />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-slate-800/50 border border-purple-500/20 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50 min-w-0"
          data-testid="chat-input"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-white disabled:opacity-30 hover:opacity-90 transition-all shrink-0"
          data-testid="send-message-btn"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

export default ChatPanel;
