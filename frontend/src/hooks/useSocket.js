import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getSocketUrl } from '../services/api';

export function useSocket(token, user, onAuthError) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingInRoom, setTypingInRoom] = useState({});

  useEffect(() => {
    if (!token || !user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
      setOnlineUsers([]);
      setTypingInRoom({});
      return;
    }

    const socket = io(getSocketUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('connect_error', (err) => {
      setConnected(false);
      const msg = err.message || '';
      if (msg.includes('token') || msg.includes('Authentication') || msg.includes('User not found')) {
        onAuthError?.();
      }
    });

    socket.on('connection:ready', ({ onlineUsers: users }) => {
      setOnlineUsers(users);
    });

    socket.on('users:online', (users) => {
      setOnlineUsers(users);
    });

    socket.on('typing:start', ({ roomId, userId, displayName }) => {
      if (userId === user.id) return;
      setTypingInRoom((prev) => {
        const roomTyping = prev[roomId] || [];
        if (roomTyping.some((t) => t.userId === userId)) return prev;
        return { ...prev, [roomId]: [...roomTyping, { userId, displayName }] };
      });
    });

    socket.on('typing:stop', ({ roomId, userId }) => {
      setTypingInRoom((prev) => ({
        ...prev,
        [roomId]: (prev[roomId] || []).filter((t) => t.userId !== userId),
      }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token, user, onAuthError]);

  const joinRoom = useCallback((roomId) => {
    socketRef.current?.emit('room:join', { roomId });
  }, []);

  const leaveRoom = useCallback((roomId) => {
    socketRef.current?.emit('room:leave', { roomId });
  }, []);

  const sendMessage = useCallback((roomId, content, options = {}) => {
    socketRef.current?.emit('message:send', { roomId, content, ...options });
  }, []);

  const editMessage = useCallback((messageId, content) => {
    socketRef.current?.emit('message:edit', { messageId, content });
  }, []);

  const deleteMessage = useCallback((messageId, scope = 'everyone') => {
    socketRef.current?.emit('message:delete', { messageId, scope });
  }, []);

  const reactMessage = useCallback((messageId, emoji) => {
    socketRef.current?.emit('message:react', { messageId, emoji });
  }, []);

  const starMessage = useCallback((messageId) => {
    socketRef.current?.emit('message:star', { messageId });
  }, []);

  const markRead = useCallback((roomId, messageId) => {
    socketRef.current?.emit('message:read', { roomId, messageId });
  }, []);

  const startTyping = useCallback((roomId) => {
    socketRef.current?.emit('typing:start', { roomId });
  }, []);

  const stopTyping = useCallback((roomId) => {
    socketRef.current?.emit('typing:stop', { roomId });
  }, []);

  const on = useCallback((event, handler) => {
    if (!socketRef.current) return () => {};
    socketRef.current.on(event, handler);
    return () => socketRef.current?.off(event, handler);
  }, []);

  return {
    connected,
    onlineUsers,
    typingInRoom,
    joinRoom,
    leaveRoom,
    sendMessage,
    editMessage,
    deleteMessage,
    reactMessage,
    starMessage,
    markRead,
    startTyping,
    stopTyping,
    on,
  };
}
