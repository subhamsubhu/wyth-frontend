import { io } from 'socket.io-client';
import { isBackendHealthy } from '../utils/healthCheck';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

let socket = null;
let connectionAttempts = 0;
let isConnecting = false;
let pendingEmits = []; // Queue for events emitted before connection is ready

/**
 * Initialize socket connection with health check
 * Waits for backend to be ready before connecting
 */
export const initializeSocket = async (token) => {
  if (socket?.connected) return socket;
  if (isConnecting) {
    // Wait for existing connection attempt
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (socket?.connected) {
          clearInterval(checkInterval);
          resolve(socket);
        } else if (!isConnecting) {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 100);
    });
  }

  isConnecting = true;
  connectionAttempts++;

  // Check if backend is healthy before connecting
  const healthy = await isBackendHealthy();
  if (!healthy) {
    console.warn('⚠️ Backend not healthy, socket connection may fail. Will retry on reconnect.');
  }

  // Disconnect old socket if exists
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(BACKEND_URL, {
    path: '/api/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity, // Keep trying
    timeout: 20000, // 20s timeout for initial connection
    forceNew: true
  });

  socket.on('connect', () => {
    console.log('✅ Connected to Socket.IO server');
    connectionAttempts = 0;
    isConnecting = false;
    
    // Process pending emits
    if (pendingEmits.length > 0) {
      console.log(`📤 Processing ${pendingEmits.length} pending emits`);
      pendingEmits.forEach(({ event, data }) => {
        socket.emit(event, data);
      });
      pendingEmits = [];
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Disconnected:', reason);
    isConnecting = false;
    
    // If server disconnected us, try to reconnect
    if (reason === 'io server disconnect') {
      socket.connect();
    }
  });

  socket.on('connect_error', async (error) => {
    console.error('❌ Socket connection error:', error.message);
    isConnecting = false;
    
    // Check backend health on error
    const healthy = await isBackendHealthy(true);
    if (!healthy) {
      console.log('🔄 Backend not ready, socket will retry...');
    }
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log(`🔄 Reconnected after ${attemptNumber} attempts`);
    connectionAttempts = 0;
  });

  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log(`🔄 Reconnection attempt #${attemptNumber}`);
  });

  socket.on('reconnect_error', (error) => {
    console.error('🔄 Reconnection error:', error.message);
  });

  socket.on('reconnect_failed', () => {
    console.error('❌ Reconnection failed after all attempts');
  });

  isConnecting = false;
  return socket;
};

export const getSocket = () => socket;

/**
 * Emit event with connection check
 * Queues event if socket is not yet connected
 */
export const emitWithCheck = (event, data) => {
  if (socket?.connected) {
    socket.emit(event, data);
  } else {
    console.warn(`⚠️ Socket not connected, queuing emit: ${event}`);
    pendingEmits.push({ event, data });
    
    // Clear old pending emits after 30s
    setTimeout(() => {
      pendingEmits = pendingEmits.filter(e => e.event !== event || e.data !== data);
    }, 30000);
  }
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  pendingEmits = [];
  connectionAttempts = 0;
  isConnecting = false;
};
