import {
  getUserRooms,
  getRoomById,
  getRoomMembers,
} from '../db/services.js';

const userSockets = new Map();

export function registerUserSocket(userId, socketId) {
  const id = String(userId);
  if (!userSockets.has(id)) userSockets.set(id, new Set());
  userSockets.get(id).add(socketId);
}

export function unregisterUserSocket(userId, socketId) {
  const id = String(userId);
  const sockets = userSockets.get(id);
  if (!sockets) return false;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    userSockets.delete(id);
    return true;
  }
  return false;
}

export function getUserSocketIds(userId) {
  return userSockets.get(String(userId)) || new Set();
}

export function emitToUser(io, userId, event, data) {
  const sockets = getUserSocketIds(userId);
  for (const socketId of sockets) {
    io.to(socketId).emit(event, data);
  }
}

export async function joinSocketToRoom(io, userId, roomId) {
  const sockets = getUserSocketIds(userId);
  for (const socketId of sockets) {
    const memberSocket = io.sockets.sockets.get(socketId);
    if (memberSocket) {
      memberSocket.join(`room:${roomId}`);
    }
  }
}

export async function joinUserToAllRooms(socket, userId) {
  const rooms = await getUserRooms(userId);
  for (const room of rooms) {
    socket.join(`room:${room.id}`);
  }
}

export async function notifyConversationCreated(io, conversationId, memberIds) {
  const uniqueMembers = [...new Set(memberIds.filter(Boolean))];

  for (const memberId of uniqueMembers) {
    await joinSocketToRoom(io, memberId, conversationId);
    const room = await getRoomById(conversationId, memberId);
    if (room) emitToUser(io, memberId, 'room:new', room);
  }
}

export async function broadcastRoomUpdated(io, roomId) {
  const members = await getRoomMembers(roomId);
  for (const member of members) {
    const room = await getRoomById(roomId, member.id);
    if (room) emitToUser(io, member.id, 'room:updated', room);
  }
}
