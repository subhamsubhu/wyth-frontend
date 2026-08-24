import React, { useState } from 'react';
import { useRoom } from '../../contexts/RoomContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Video, Sparkles } from 'lucide-react';

const CreateRoom = ({ onRoomCreated }) => {
  const { createRoom, loading, error } = useRoom();
  const [roomName, setRoomName] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (!roomName.trim()) {
      setLocalError('Please enter a room name');
      return;
    }

    const result = await createRoom(roomName);
    
    if (result.success) {
      onRoomCreated(result.roomId);
    } else {
      setLocalError(result.error || 'Failed to create room');
    }
  };

  return (
    <Card className="w-full max-w-md bg-slate-900/50 backdrop-blur-xl border-purple-500/20">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-center mb-4">
          <div className="p-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl">
            <Video className="w-8 h-8 text-white" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold text-center bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Create WYTH
        </CardTitle>
        <CardDescription className="text-center text-slate-400">
          Start a new room and invite friends
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
            <Label htmlFor="roomName" className="text-slate-300">Room Name</Label>
            <Input
              id="roomName"
              type="text"
              placeholder="e.g., Movie Night with Friends"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="bg-slate-800/50 border-purple-500/30 text-white placeholder:text-slate-500"
              data-testid="room-name-input"
            />
          </div>
          
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
            data-testid="create-room-button"
          >
            {loading ? (
              <span className="flex items-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Creating...
              </span>
            ) : (
              <span className="flex items-center">
                <Sparkles className="w-4 h-4 mr-2" />
                Create Room
              </span>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default CreateRoom;