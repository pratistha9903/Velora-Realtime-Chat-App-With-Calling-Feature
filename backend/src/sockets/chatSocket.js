import {
  createMessage,
  editMessage,
  deleteMessage,
  markMessagesAsRead,
  markMessageDelivered,
  isRoomMember,
  getRoomMembers,
  updateLastSeen,
  getMessageById,
  toggleReaction,
  toggleStarMessage,
} from '../db/services.js';
import {
  registerUserSocket,
  unregisterUserSocket,
  getUserSocketIds,
  joinUserToAllRooms,
  broadcastRoomUpdated,
} from './socketHelpers.js';

const onlineUsers = new Map();
const typingUsers = new Map();
const messageRateLimits = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const userLimits = messageRateLimits.get(userId) || [];
  const recent = userLimits.filter((t) => now - t < 60000);
  if (recent.length >= 30) return false;
  recent.push(now);
  messageRateLimits.set(userId, recent);
  return true;
}

function getOnlineUsersList() {
  return Array.from(onlineUsers.values()).map((entry) => ({
    ...entry.user,
    socketId: entry.socketId,
    online: true,
  }));
}

function broadcastOnlineUsers(io) {
  io.emit('users:online', getOnlineUsersList());
}

function sendNotification(io, { userId, type, title, body, conversationId, message }) {
  const sockets = getUserSocketIds(userId);
  for (const socketId of sockets) {
    io.to(socketId).emit('notification:new', {
      type,
      title,
      body,
      conversationId,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}

export function setupChatSocket(io) {
  io.on('connection', (socket) => {
    const user = socket.data.user;
    console.log(`User connected: ${user.username} (${socket.id})`);

    onlineUsers.set(user.id, { socketId: socket.id, user, activeRoom: null });
    registerUserSocket(user.id, socket.id);

    joinUserToAllRooms(socket, user.id).catch((err) => {
      console.error('Failed to join user rooms:', err);
    });

    updateLastSeen(user.id);
    broadcastOnlineUsers(io);
    socket.emit('connection:ready', { user, onlineUsers: getOnlineUsersList() });

    socket.on('room:join', async ({ roomId }) => {
      if (!(await isRoomMember(roomId, user.id))) {
        socket.emit('error', { message: 'Not a member of this conversation' });
        return;
      }
      socket.join(`room:${roomId}`);
      socket.data.activeRoom = roomId;
      const entry = onlineUsers.get(user.id);
      if (entry) entry.activeRoom = roomId;
    });

    socket.on('room:leave', ({ roomId }) => {
      socket.leave(`room:${roomId}`);
      if (socket.data.activeRoom === roomId) {
        socket.data.activeRoom = null;
        const entry = onlineUsers.get(user.id);
        if (entry) entry.activeRoom = null;
      }
    });

    socket.on('message:send', async ({ roomId, content, type, imageUrl, fileUrl, fileName, fileSize, replyTo }) => {
      if (!(await isRoomMember(roomId, user.id))) {
        socket.emit('error', { message: 'Not a member of this conversation' });
        return;
      }
      if (!content?.trim() && !imageUrl && !fileUrl) {
        socket.emit('error', { message: 'Message cannot be empty' });
        return;
      }
      if (!checkRateLimit(user.id)) {
        socket.emit('error', { message: 'Sending messages too fast. Please slow down.' });
        return;
      }

      try {
        const message = await createMessage({
          roomId,
          userId: user.id,
          content: content?.trim() || '',
          type: type || 'text',
          imageUrl,
          fileUrl,
          fileName,
          fileSize,
          replyTo,
        });

        io.to(`room:${roomId}`).emit('message:new', message);

        const members = await getRoomMembers(roomId);
        const otherMembers = members.filter((m) => m.id !== user.id);

        for (const member of otherMembers) {
          const entry = onlineUsers.get(member.id);
          const isViewing = entry?.activeRoom === roomId;

          await markMessageDelivered(message.id, member.id);

          if (!isViewing) {
            const { getRoomById } = await import('../db/services.js');
            const roomMeta = await getRoomById(roomId, member.id);
            if (roomMeta?.muted) continue;

            const body =
              message.type === 'image' ? '📷 Photo'
                : message.type === 'file' ? `📎 ${message.fileName || 'File'}`
                  : message.type === 'audio' ? '🎤 Voice note'
                    : message.content;
            sendNotification(io, {
              userId: member.id,
              type: 'message',
              title: user.displayName,
              body,
              conversationId: roomId,
              message,
            });
          }
        }

        const updated = await getMessageById(message.id, user.id);
        socket.emit('message:status', { id: message.id, status: updated.status });

        if (otherMembers.length > 0) {
          setTimeout(async () => {
            const delivered = await getMessageById(message.id, user.id);
            io.to(`room:${roomId}`).emit('message:status', {
              id: message.id,
              status: delivered.status === 'sent' ? 'delivered' : delivered.status,
            });
          }, 300);
        }

        await broadcastRoomUpdated(io, roomId);
      } catch (error) {
        socket.emit('error', { message: 'Failed to send message' });
        console.error('Message send error:', error);
      }
    });

    socket.on('message:edit', async ({ messageId, content }) => {
      if (!content?.trim()) return;

      const message = await editMessage(messageId, user.id, content.trim());
      if (!message) {
        socket.emit('error', { message: 'Cannot edit this message' });
        return;
      }

      io.to(`room:${message.roomId}`).emit('message:updated', message);
    });

    socket.on('message:delete', async ({ messageId, scope = 'everyone' }) => {
      const message = await deleteMessage(messageId, user.id, scope || 'everyone');
      if (!message) {
        socket.emit('error', { message: 'Cannot delete this message' });
        return;
      }

      if (message.deletedForMe) {
        socket.emit('message:deleted-for-me', { id: messageId, roomId: message.roomId });
        return;
      }

      io.to(`room:${message.roomId}`).emit('message:updated', message);
    });

    socket.on('message:react', async ({ messageId, emoji }) => {
      if (!emoji) return;
      const message = await toggleReaction(messageId, user.id, emoji);
      if (!message) return;
      io.to(`room:${message.roomId}`).emit('message:updated', message);
    });

    socket.on('message:star', async ({ messageId }) => {
      const message = await toggleStarMessage(messageId, user.id);
      if (!message) return;
      socket.emit('message:updated', message);
    });

    socket.on('message:read', async ({ roomId, messageId }) => {
      if (!(await isRoomMember(roomId, user.id))) return;

      const readIds = await markMessagesAsRead(roomId, user.id, messageId);
      if (readIds.length > 0) {
        io.to(`room:${roomId}`).emit('message:read', { roomId, readIds, userId: user.id });

        for (const id of readIds) {
          const msg = await getMessageById(id, user.id);
          if (msg) {
            io.to(`room:${roomId}`).emit('message:status', { id, status: msg.status });
          }
        }
      }
    });

    socket.on('typing:start', ({ roomId }) => {
      if (!roomId) return;
      typingUsers.set(`${roomId}:${user.id}`, { roomId, user });
      socket.to(`room:${roomId}`).emit('typing:start', {
        roomId,
        userId: user.id,
        displayName: user.displayName,
      });
    });

    socket.on('typing:stop', ({ roomId }) => {
      if (!roomId) return;
      typingUsers.delete(`${roomId}:${user.id}`);
      socket.to(`room:${roomId}`).emit('typing:stop', { roomId, userId: user.id });
    });

    socket.on('disconnect', () => {
      const fullyOffline = unregisterUserSocket(user.id, socket.id);
      if (fullyOffline) {
        onlineUsers.delete(user.id);
      }

      for (const [key, val] of typingUsers.entries()) {
        if (val.user.id === user.id) {
          typingUsers.delete(key);
          io.to(`room:${val.roomId}`).emit('typing:stop', { roomId: val.roomId, userId: user.id });
        }
      }

      updateLastSeen(user.id);
      broadcastOnlineUsers(io);
      console.log(`User disconnected: ${user.username}`);
    });
  });
}

export function isUserOnline(userId) {
  return onlineUsers.has(userId);
}
