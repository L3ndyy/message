import { io } from 'socket.io-client';
import { getToken } from './api';

let socket = null;

const API_BASE = import.meta.env.VITE_API_URL || '';

export function connectSocket() {
  const token = getToken();
  if (!token) return null;
  if (socket?.connected) return socket;
  const origin = API_BASE ? new URL(API_BASE).origin : window.location.origin;
  socket = io(origin, {
    path: '/socket.io',
    auth: { token },
    query: { token },
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
