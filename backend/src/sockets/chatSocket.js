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
  createSystemMessage,
  logCompletedCall,
  restoreConversationForUser,
} from '../db/services.js';
import { notifyN8nNewMessage } from '../utils/n8nWebhook.js';
import {
  registerUserSocket,
  unregisterUserSocket,
  getUserSocketIds,
  joinUserToAllRooms,
  broadcastRoomUpdated,
  joinSocketToRoom,
  emitToUser,
} from './socketHelpers.js';

const onlineUsers = new Map();
const typingUsers = new Map();
const messageRateLimits = new Map();
const activeCalls = new Map(); // callKey -> { a, b, roomId, callType, answered, callerId, callerName, ringTimer }

function callKey(a, b) {
  return [String(a), String(b)].sort().join(':');
}

function emitToUserSockets(io, userId, event, payload) {
  const ids = getUserSocketIds(userId);
  let count = 0;
  for (const sid of ids) {
    io.to(sid).emit(event, payload);
    count += 1;
  }
  return count;
}

function clearCallTimer(call) {
  if (call?.ringTimer) {
    clearTimeout(call.ringTimer);
    call.ringTimer = null;
  }
}

async function postCompletedCall(io, call) {
  if (!call?.roomId || !call.answered || call.completedPosted) return;
  call.completedPosted = true;
  const durationSec = call.answeredAt
    ? Math.max(1, Math.round((Date.now() - call.answeredAt) / 1000))
    : 0;
  try {
    const systemMessage = await logCompletedCall({
      roomId: call.roomId,
      callerId: call.callerId,
      calleeId: call.calleeId,
      callType: call.callType || 'audio',
      durationSec,
    });
    io.to(`room:${call.roomId}`).emit('message:new', systemMessage);
    emitToUserSockets(io, call.callerId, 'message:new', systemMessage);
    emitToUserSockets(io, call.calleeId, 'message:new', systemMessage);

    for (const uid of [call.callerId, call.calleeId]) {
      const restored = await restoreConversationForUser(call.roomId, uid);
      if (restored?.restored && restored.room) {
        await joinSocketToRoom(io, uid, call.roomId);
        emitToUser(io, uid, 'room:new', restored.room);
      }
    }

    emitToUserSockets(io, call.callerId, 'calls:updated', { roomId: call.roomId });
    emitToUserSockets(io, call.calleeId, 'calls:updated', { roomId: call.roomId });
    await broadcastRoomUpdated(io, call.roomId);
  } catch (err) {
    console.error('Failed to log completed call:', err);
  }
}

async function postMissedCall(io, call, reason = 'missed') {
  if (!call?.roomId || call.missedPosted || !call.calleeId) return;
  call.missedPosted = true;
  const callLabel = call.callType === 'video' ? 'video' : 'voice';
  // Only the person who didn't answer should see this — hide from the caller
  const content = `Missed ${callLabel} call`;

  try {
    const systemMessage = await createSystemMessage({
      roomId: call.roomId,
      userId: call.callerId,
      content,
      meta: {
        kind: 'missed_call',
        callType: call.callType || 'audio',
        callerId: call.callerId,
        callerName: call.callerName,
        calleeId: call.calleeId,
        reason,
      },
      hiddenFor: [call.callerId],
    });

    const restoredCallee = await restoreConversationForUser(call.roomId, call.calleeId);
    if (restoredCallee?.restored && restoredCallee.room) {
      await joinSocketToRoom(io, call.calleeId, call.roomId);
      emitToUser(io, call.calleeId, 'room:new', restoredCallee.room);
    }

    // Deliver chat line + notification only to the callee
    emitToUserSockets(io, call.calleeId, 'message:new', systemMessage);
    emitToUserSockets(io, call.calleeId, 'notification:new', {
      type: 'missed_call',
      title: 'Missed call',
      body: `${call.callerName || 'Someone'} tried to ${callLabel} call you`,
      conversationId: call.roomId,
      message: systemMessage,
      timestamp: new Date().toISOString(),
      playSound: true,
    });
    emitToUserSockets(io, call.callerId, 'calls:updated', { roomId: call.roomId });
    emitToUserSockets(io, call.calleeId, 'calls:updated', { roomId: call.roomId });
    await broadcastRoomUpdated(io, call.roomId);
  } catch (err) {
    console.error('Failed to post missed call message:', err);
  }
}

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
      playSound: true,
    });
  }
}

export function setupChatSocket(io) {
  io.on('connection', (socket) => {
    const user = socket.data.user;
    console.log(`User connected: ${user.username} (${socket.id})`);

    onlineUsers.set(String(user.id), { socketId: socket.id, user, activeRoom: null });
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
      const entry = onlineUsers.get(String(user.id));
      if (entry) entry.activeRoom = roomId;
    });

    socket.on('room:leave', ({ roomId }) => {
      socket.leave(`room:${roomId}`);
      if (socket.data.activeRoom === roomId) {
        socket.data.activeRoom = null;
        const entry = onlineUsers.get(String(user.id));
        if (entry) entry.activeRoom = null;
      }
    });

    socket.on('message:send', async ({ roomId, content, type, imageUrl, fileUrl, fileName, fileSize, replyTo }) => {
      const { canSendInConversation } = await import('../db/services.js');
      if (!(await canSendInConversation(roomId, user.id))) {
        socket.emit('error', { message: 'You cannot send messages in this chat' });
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

        const senderName = user.displayName || user.username;
        const senderEmail = user.email || '';

        for (const recipient of otherMembers) {
          void notifyN8nNewMessage({
            senderName,
            senderEmail,
            recipientName: recipient.displayName || recipient.username,
            recipientEmail: recipient.email,
            message,
          });
        }

        for (const member of otherMembers) {
          const restored = await restoreConversationForUser(roomId, member.id);
          if (restored?.restored && restored.room) {
            await joinSocketToRoom(io, member.id, roomId);
            emitToUser(io, member.id, 'room:new', restored.room);
          }

          const entry = onlineUsers.get(String(member.id));
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

    // ── WebRTC call signaling ──
    socket.on('call:invite', ({ toUserId, roomId, callType, offer, from }) => {
      const targetId = String(toUserId || '');
      if (!targetId || !offer || !roomId) {
        socket.emit('call:rejected', { reason: 'invalid' });
        return;
      }

      const key = callKey(user.id, targetId);
      if (activeCalls.has(key)) {
        socket.emit('call:rejected', { reason: 'busy' });
        return;
      }

      const type = callType === 'video' ? 'video' : 'audio';
      const call = {
        a: String(user.id),
        b: targetId,
        roomId: String(roomId),
        callType: type,
        answered: false,
        missedPosted: false,
        completedPosted: false,
        callerId: String(user.id),
        callerName: from?.displayName || user.displayName,
        calleeId: targetId,
        calleeName: null,
        ringTimer: null,
        answeredAt: null,
        startedAt: Date.now(),
      };

      activeCalls.set(key, call);

      const delivered = emitToUserSockets(io, targetId, 'call:incoming', {
        from: from || {
          id: user.id,
          displayName: user.displayName,
          avatarColor: user.avatarColor,
          avatarUrl: user.avatarUrl,
        },
        roomId: call.roomId,
        callType: type,
        offer,
      });

      // Also push a toast-style notification event
      emitToUserSockets(io, targetId, 'notification:new', {
        type: 'incoming_call',
        title: 'Incoming call',
        body: `${call.callerName} is ${type === 'video' ? 'video' : 'voice'} calling you`,
        conversationId: call.roomId,
        timestamp: new Date().toISOString(),
        playSound: true,
      });

      if (!delivered) {
        // Callee offline — post missed call immediately
        postMissedCall(io, call, 'missed').finally(() => {
          activeCalls.delete(key);
          socket.emit('call:rejected', { reason: 'offline' });
        });
        return;
      }

      // Auto-miss after 40s with no answer
      call.ringTimer = setTimeout(() => {
        const current = activeCalls.get(key);
        if (!current || current.answered) return;
        emitToUserSockets(io, current.callerId, 'call:ended', { fromUserId: current.calleeId, reason: 'timeout' });
        emitToUserSockets(io, current.calleeId, 'call:ended', { fromUserId: current.callerId, reason: 'timeout' });
        postMissedCall(io, current, 'missed').finally(() => {
          clearCallTimer(current);
          activeCalls.delete(key);
        });
      }, 40000);
    });

    socket.on('call:answer', ({ toUserId, answer }) => {
      const targetId = String(toUserId || '');
      if (!targetId || !answer) return;
      const key = callKey(user.id, targetId);
      const call = activeCalls.get(key);
      if (call) {
        call.answered = true;
        call.calleeName = user.displayName;
        call.answeredAt = Date.now();
        clearCallTimer(call);
      }
      emitToUserSockets(io, targetId, 'call:answered', {
        fromUserId: user.id,
        answer,
      });
    });

    socket.on('call:reject', async ({ toUserId }) => {
      const targetId = String(toUserId || '');
      if (!targetId) return;
      const key = callKey(user.id, targetId);
      const call = activeCalls.get(key);
      if (call) {
        call.calleeName = user.displayName;
        clearCallTimer(call);
        await postMissedCall(io, call, 'declined');
        activeCalls.delete(key);
      }
      emitToUserSockets(io, targetId, 'call:rejected', { fromUserId: user.id });
    });

    socket.on('call:ice', ({ toUserId, candidate }) => {
      const targetId = String(toUserId || '');
      if (!targetId || !candidate) return;
      emitToUserSockets(io, targetId, 'call:ice', {
        fromUserId: user.id,
        candidate,
      });
    });

    socket.on('call:end', async ({ toUserId }) => {
      const targetId = String(toUserId || '');
      if (!targetId) return;
      const key = callKey(user.id, targetId);
      const call = activeCalls.get(key);
      if (call) {
        clearCallTimer(call);
        if (call.answered) {
          await postCompletedCall(io, call);
        } else {
          await postMissedCall(io, call, 'missed');
        }
        activeCalls.delete(key);
      }
      emitToUserSockets(io, targetId, 'call:ended', { fromUserId: user.id });
    });

    socket.on('disconnect', () => {
      const fullyOffline = unregisterUserSocket(user.id, socket.id);
      if (fullyOffline) {
        onlineUsers.delete(String(user.id));
      }

      for (const [key, val] of typingUsers.entries()) {
        if (val.user.id === user.id) {
          typingUsers.delete(key);
          io.to(`room:${val.roomId}`).emit('typing:stop', { roomId: val.roomId, userId: user.id });
        }
      }

      for (const [id, call] of activeCalls.entries()) {
        if (call.a === String(user.id) || call.b === String(user.id)) {
          const other = call.a === String(user.id) ? call.b : call.a;
          clearCallTimer(call);
          emitToUserSockets(io, other, 'call:ended', { fromUserId: user.id, reason: 'disconnect' });
          if (!call.answered) {
            postMissedCall(io, call, 'missed');
          } else {
            postCompletedCall(io, call);
          }
          activeCalls.delete(id);
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
