import React, { useState } from 'react';
import { useRoom } from '../../contexts/RoomContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Users, ArrowRight } from 'lucide-react';

const JoinRoom = ({ onRoomJoined }) => {
  const { joinRoom, loading, error } = useRoom();
  const [roomId, setRoomId] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (!roomId.trim()) {
      setLocalError('Please enter a room ID');
      return;
    }

    const upperId = roomId.toUpperCase();
    const result = await joinRoom(upperId);
    
    if (result.success) {
      onRoomJoined?.(upperId);
    } else {
      setLocalError(result.error || 'Failed to join room');
    }
  };

  return (
    <Card className="w-full max-w-md bg-slate-900/50 backdrop-blur-xl border-purple-500/20">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-center mb-4">
          <div className="p-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl">
            <Users className="w-8 h-8 text-white" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold text-center bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Join WYTH
        </CardTitle>
        <CardDescription className="text-center text-slate-400">
          Enter the room ID to join
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {(localError || error) && (
            <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
              <AlertDescription>{localError || error}</AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="roomId" className="text-slate-300">Room ID</Label>
            <Input
              id="roomId"
              type="text"
              placeholder="e.g., ABC12345"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              className="bg-slate-800/50 border-purple-500/30 text-white placeholder:text-slate-500 font-mono text-lg"
              data-testid="room-id-input"
              maxLength={8}
            />
          </div>
          
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
            data-testid="join-room-button"
          >
            {loading ? (
              <span className="flex items-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Joining...
              </span>
            ) : (
              <span className="flex items-center">
                <ArrowRight className="w-4 h-4 mr-2" />
                Join Room
              </span>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default JoinRoom;