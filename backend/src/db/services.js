import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { getAvatarColor } from '../utils/avatar.js';

export function formatUser(doc) {
  if (!doc) return null;
  const u = doc.toObject ? doc.toObject() : doc;
  return {
    id: u._id.toString(),
    username: u.username,
    email: u.email,
    displayName: u.displayName,
    avatarColor: u.avatarColor,
    avatarUrl: u.avatarUrl || null,
    bio: u.bio || '',
    emailVerified: !!u.emailVerified,
    createdAt: u.createdAt,
    lastSeen: u.lastSeen,
  };
}

function formatMember(doc) {
  if (!doc?.userId) return null;
  const u = doc.userId;
  return {
    id: u._id.toString(),
    username: u.username,
    email: u.email || null,
    emailVerified: !!u.emailVerified,
    displayName: u.displayName,
    avatarColor: u.avatarColor,
    avatarUrl: u.avatarUrl || null,
    bio: u.bio || '',
    lastSeen: u.lastSeen,
    role: doc.role || 'member',
    removedAt: doc.removedAt || null,
    removedBy: doc.removedBy?.toString?.() || doc.removedBy || null,
  };
}

function getMessageStatus(message, currentUserId, memberCount) {
  if (message.deletedAt) return 'deleted';
  if (message.userId._id?.toString() !== currentUserId && message.userId?.toString() !== currentUserId) {
    return null;
  }

  const readCount = message.readBy?.filter(
    (r) => r.userId.toString() !== currentUserId
  ).length || 0;
  const deliveredCount = message.deliveredTo?.filter(
    (id) => id.toString() !== currentUserId
  ).length || 0;
  const others = Math.max(memberCount - 1, 1);

  if (readCount >= others) return 'read';
  if (deliveredCount > 0 || readCount > 0) return 'delivered';
  return 'sent';
}

export function formatMessage(doc, currentUserId, memberCount = 2) {
  if (!doc) return null;
  const m = doc.toObject ? doc.toObject() : doc;
  const user = m.userId;
  const hiddenFor = m.hiddenFor?.map((id) => id.toString()) || [];
  if (hiddenFor.includes(currentUserId)) return null;

  const reactions = {};
  for (const r of m.reactions || []) {
    const emoji = r.emoji;
    if (!reactions[emoji]) reactions[emoji] = { emoji, count: 0, reacted: false, userIds: [] };
    reactions[emoji].count += 1;
    reactions[emoji].userIds.push(r.userId.toString());
    if (r.userId.toString() === currentUserId) reactions[emoji].reacted = true;
  }

  return {
    id: m._id.toString(),
    roomId: m.conversationId.toString(),
    conversationId: m.conversationId.toString(),
    userId: user._id?.toString() || user.toString(),
    username: user.username,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    avatarUrl: user.avatarUrl || null,
    content: m.deletedAt ? null : m.content,
    type: m.type,
    imageUrl: m.deletedAt ? null : m.imageUrl,
    fileUrl: m.deletedAt ? null : m.fileUrl,
    fileName: m.deletedAt ? null : m.fileName,
    fileSize: m.deletedAt ? null : m.fileSize,
    meta: m.meta || null,
    replyTo: m.replyTo?._id?.toString() || m.replyTo?.toString() || null,
    replyContent: m.replyTo?.content || null,
    replyUsername: m.replyTo?.userId?.username || null,
    reactions: Object.values(reactions),
    starred: m.starredBy?.some((id) => id.toString() === currentUserId) || false,
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    createdAt: m.createdAt,
    status: getMessageStatus(m, currentUserId, memberCount),
    readBy: m.readBy?.map((r) => r.userId.toString()) || [],
    deliveredTo: m.deliveredTo?.map((id) => id.toString()) || [],
  };
}

async function populateConversation(conv, userId) {
  if (!conv) return null;
  const c = conv.toObject ? conv.toObject() : conv;
  const members = await getConversationMembers(c._id.toString());

  const lastMsg = await Message.findOne({
    conversationId: c._id,
    deletedAt: null,
    hiddenFor: { $ne: userId },
  }).sort({ createdAt: -1 }).lean();

  const memberEntry = c.members?.find((m) => m.userId.toString() === userId);
  const unread = await Message.countDocuments({
    conversationId: c._id,
    userId: { $ne: userId },
    deletedAt: null,
    hiddenFor: { $ne: userId },
    createdAt: { $gt: memberEntry?.lastReadAt || new Date(0) },
  });

  let displayName = c.name;
  let avatarColor = c.avatarColor;
  let avatarUrl = null;
  let otherLastSeen = null;

  if (c.type === 'private') {
    const other = members.find((m) => m.id !== userId);
    if (other) {
      displayName = other.displayName;
      avatarColor = other.avatarColor;
      avatarUrl = other.avatarUrl || null;
      otherLastSeen = other.lastSeen || null;
    }
  }

  const preview =
    lastMsg?.type === 'image' ? '📷 Photo'
      : lastMsg?.type === 'file' ? `📎 ${lastMsg.fileName || 'File'}`
        : lastMsg?.type === 'audio' ? '🎤 Voice note'
          : lastMsg?.type === 'system' ? lastMsg.content
            : lastMsg?.content || null;

  return {
    id: c._id.toString(),
    name: c.name,
    displayName,
    type: c.type === 'private' ? 'dm' : c.type,
    description: c.description,
    createdBy: c.createdBy?.toString(),
    createdAt: c.createdAt,
    avatarColor,
    avatarUrl,
    otherLastSeen,
    lastMessage: preview,
    lastMessageAt: lastMsg?.createdAt || null,
    unreadCount: unread,
    memberCount: members.filter((m) => !m.removedAt).length,
    members: members.filter((m) => !m.removedAt || m.id === userId),
    myRole: (memberEntry?.role === 'admin' || c.createdBy?.toString() === userId) ? 'admin' : 'member',
    iWasRemoved: !!memberEntry?.removedAt,
    removedBy: memberEntry?.removedBy?.toString?.() || null,
    archived: !!memberEntry?.archived,
    muted: !!memberEntry?.muted,
    pinned: !!memberEntry?.pinned,
  };
}

// ─── Users ───

export async function createUser({
  username, email, passwordHash, displayName, emailVerifyToken = null, googleId = null, emailVerified = false,
}) {
  const user = await User.create({
    username,
    email,
    passwordHash,
    displayName: displayName || username,
    avatarColor: getAvatarColor(username),
    emailVerifyToken,
    emailVerified,
    googleId,
  });
  return formatUser(user);
}

export async function updateUserProfile(userId, updates) {
  const allowed = {};
  if (updates.displayName !== undefined) allowed.displayName = updates.displayName.trim();
  if (updates.bio !== undefined) allowed.bio = String(updates.bio).slice(0, 160);
  if (updates.avatarUrl !== undefined) allowed.avatarUrl = updates.avatarUrl;
  const user = await User.findByIdAndUpdate(userId, allowed, { new: true });
  return formatUser(user);
}

export async function setRefreshTokenHash(userId, hash) {
  await User.findByIdAndUpdate(userId, { refreshTokenHash: hash });
}

export async function clearRefreshToken(userId) {
  await User.findByIdAndUpdate(userId, { refreshTokenHash: null });
}

export async function getUserById(id) {
  const user = await User.findById(id);
  return formatUser(user);
}

/** Profile visible only if viewer shares a chat with the target user (or is self). */
export async function getContactProfile(viewerId, targetUserId) {
  const viewer = String(viewerId);
  const target = String(targetUserId);
  if (viewer === target) {
    return getUserById(target);
  }

  const shared = await Conversation.findOne({
    'members.userId': { $all: [viewer, target] },
  }).lean();
  if (!shared) {
    const err = new Error('You can only view profiles of people you chat with');
    err.status = 403;
    throw err;
  }

  const user = await User.findById(target).lean();
  if (!user) return null;

  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    avatarUrl: user.avatarUrl || null,
    bio: user.bio || '',
    emailVerified: !!user.emailVerified,
    lastSeen: user.lastSeen,
    createdAt: user.createdAt,
  };
}

export async function getUserByUsername(username) {
  return User.findOne({ username: username.toLowerCase() });
}

export async function getUserByEmail(email) {
  return User.findOne({ email: email.toLowerCase() });
}

export async function updateLastSeen(userId) {
  await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
}

export async function lookupUserByUsername(username, excludeUserId) {
  const normalized = String(username || '').trim().toLowerCase().replace(/^@/, '');
  if (!normalized) return null;

  const user = await User.findOne({ username: normalized }).lean();
  if (!user || user._id.toString() === String(excludeUserId)) return null;

  return {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    avatarUrl: user.avatarUrl,
    lastSeen: user.lastSeen,
  };
}

export async function searchUsers(query, excludeUserId, limit = 20) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];

  const users = await User.find({
    _id: { $ne: excludeUserId },
    $or: [
      { username: { $regex: trimmed, $options: 'i' } },
      { displayName: { $regex: trimmed, $options: 'i' } },
      { email: { $regex: trimmed, $options: 'i' } },
    ],
  }).limit(limit).lean();

  return users.map((u) => ({
    id: u._id.toString(),
    username: u.username,
    displayName: u.displayName,
    avatarColor: u.avatarColor,
    lastSeen: u.lastSeen,
  }));
}

export async function getAllUsers(excludeUserId) {
  const users = await User.find({ _id: { $ne: excludeUserId } })
    .sort({ displayName: 1 })
    .lean();

  return users.map((u) => ({
    id: u._id.toString(),
    username: u.username,
    displayName: u.displayName,
    avatarColor: u.avatarColor,
    lastSeen: u.lastSeen,
  }));
}

// ─── Conversations ───

export async function createConversation({ name, type, description, createdBy, memberIds = [] }) {
  const uniqueMembers = [...new Set([createdBy, ...memberIds].filter(Boolean))];
  const members = uniqueMembers.map((id) => ({
    userId: id,
    joinedAt: new Date(),
    role: type === 'group' && id.toString() === createdBy.toString() ? 'admin' : 'member',
  }));

  const conv = await Conversation.create({
    name,
    type,
    description,
    createdBy,
    members,
    avatarColor: type === 'group' ? getAvatarColor(name || 'group') : undefined,
  });

  return populateConversation(conv, createdBy);
}

export async function getOrCreatePrivateChat(userId1, userId2) {
  const existing = await Conversation.findOne({
    type: 'private',
    'members.userId': { $all: [userId1, userId2] },
    $expr: { $eq: [{ $size: '$members' }, 2] },
  });

  if (existing) {
    const member = existing.members.find((m) => m.userId.toString() === userId1);
    if (member?.deletedAt) {
      member.deletedAt = null;
      await existing.save();
    }
    return populateConversation(existing, userId1);
  }

  return createConversation({
    name: null,
    type: 'private',
    createdBy: userId1,
    memberIds: [userId2],
  });
}

export async function createGroupChat({ name, description, createdBy, memberIds }) {
  if (!memberIds?.length) {
    throw new Error('Group must have at least one other member');
  }
  return createConversation({
    name,
    type: 'group',
    description,
    createdBy,
    memberIds,
  });
}

export async function getConversationById(conversationId, userId) {
  const conv = await Conversation.findById(conversationId);
  if (!conv) return null;

  const isMember = conv.members.some((m) => m.userId.toString() === userId);
  if (!isMember) return null;

  return populateConversation(conv, userId);
}

export async function getUserConversations(userId) {
  const convs = await Conversation.find({ 'members.userId': userId }).sort({ updatedAt: -1 });
  const visible = convs.filter((c) => {
    const member = c.members.find((m) => m.userId.toString() === userId);
    return member && !member.deletedAt;
  });
  const populated = await Promise.all(visible.map((c) => populateConversation(c, userId)));

  return populated
    .filter(Boolean)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const aT = a.lastMessageAt || a.createdAt;
      const bT = b.lastMessageAt || b.createdAt;
      return new Date(bT) - new Date(aT);
    });
}

export async function deleteConversationForUser(conversationId, userId) {
  const conv = await Conversation.findOne({ _id: conversationId, 'members.userId': userId });
  if (!conv) return null;

  const member = conv.members.find((m) => m.userId.toString() === userId);
  if (!member) return null;

  member.deletedAt = new Date();
  member.archived = false;
  await conv.save();
  return { id: conversationId, deleted: true };
}

export async function restoreConversationForUser(conversationId, userId) {
  const conv = await Conversation.findOne({ _id: conversationId, 'members.userId': userId });
  if (!conv) return { restored: false };

  const member = conv.members.find((m) => m.userId.toString() === userId);
  if (!member?.deletedAt) return { restored: false };

  member.deletedAt = null;
  await conv.save();
  const room = await populateConversation(conv, userId);
  return { restored: true, room };
}

export async function getCallHistory(userId, limit = 50) {
  const convs = await Conversation.find({
    type: 'private',
    'members.userId': userId,
  }).select('_id members').lean();

  const roomIds = convs.map((c) => c._id);
  if (!roomIds.length) return [];

  const uid = userId.toString();
  const messages = await Message.find({
    conversationId: { $in: roomIds },
    type: 'system',
    'meta.kind': { $in: ['missed_call', 'call_completed'] },
    $or: [{ 'meta.callerId': uid }, { 'meta.calleeId': uid }],
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const peerMap = new Map();
  for (const c of convs) {
    const other = c.members.find((m) => m.userId.toString() !== uid);
    if (other) peerMap.set(c._id.toString(), other.userId.toString());
  }

  const userIds = [...new Set(messages.flatMap((m) => [
    m.meta?.callerId,
    m.meta?.calleeId,
  ].filter(Boolean)))];
  const users = await User.find({ _id: { $in: userIds } }).select('displayName username avatarColor avatarUrl').lean();
  const userById = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

  return messages.map((m) => {
    const roomId = m.conversationId.toString();
    const isCaller = m.meta?.callerId === uid;
    const isCallee = m.meta?.calleeId === uid;
    const peerId = isCaller ? m.meta?.calleeId : m.meta?.callerId;
    const peer = userById[peerId] || {};
    const callType = m.meta?.callType || 'audio';

    let label = m.content;
    if (m.meta?.kind === 'call_completed') {
      label = isCaller
        ? `Outgoing ${callType} call · ${m.meta?.duration || ''}`
        : `Incoming ${callType} call · ${m.meta?.duration || ''}`;
    } else if (m.meta?.kind === 'missed_call') {
      if (isCallee) label = `Missed ${callType} call`;
      else if (m.meta?.reason === 'declined') label = `${callType} call declined`;
      else label = `No answer · ${callType} call`;
    }

    return {
      id: m._id.toString(),
      roomId,
      callType,
      kind: m.meta?.kind,
      reason: m.meta?.reason || null,
      label,
      duration: m.meta?.duration || null,
      createdAt: m.createdAt,
      direction: isCaller ? 'outgoing' : 'incoming',
      peer: {
        id: peerId,
        displayName: peer.displayName || m.meta?.callerName || m.meta?.calleeName || 'User',
        username: peer.username,
        avatarColor: peer.avatarColor,
        avatarUrl: peer.avatarUrl || null,
      },
    };
  });
}

export async function updateConversationPrefs(conversationId, userId, prefs) {
  const conv = await Conversation.findOne({ _id: conversationId, 'members.userId': userId });
  if (!conv) return null;

  const member = conv.members.find((m) => m.userId.toString() === userId);
  if (!member) return null;

  if (prefs.archived !== undefined) member.archived = !!prefs.archived;
  if (prefs.muted !== undefined) member.muted = !!prefs.muted;
  if (prefs.pinned !== undefined) member.pinned = !!prefs.pinned;
  await conv.save();
  return populateConversation(conv, userId);
}

function memberIsAdmin(conv, userId) {
  if (!conv) return false;
  if (conv.createdBy?.toString() === userId) return true;
  const member = conv.members.find((m) => {
    const id = m.userId._id?.toString?.() || m.userId.toString();
    return id === userId && !m.removedAt;
  });
  return member?.role === 'admin';
}

function memberUserId(m) {
  return m.userId._id?.toString?.() || m.userId.toString();
}

export async function addGroupMembers(conversationId, requesterId, memberIds = []) {
  const conv = await Conversation.findById(conversationId);
  if (!conv || conv.type !== 'group') return null;

  const requester = conv.members.find((m) => m.userId.toString() === requesterId);
  if (!requester || requester.removedAt) {
    throw new Error('Only group members can add people');
  }

  const added = [];
  for (const id of memberIds) {
    if (!id) continue;
    const existing = conv.members.find((m) => m.userId.toString() === id.toString());
    if (existing) {
      if (existing.removedAt) {
        existing.removedAt = null;
        existing.removedBy = null;
        existing.joinedAt = new Date();
        existing.role = 'member';
        added.push(id.toString());
      }
      continue;
    }
    conv.members.push({ userId: id, role: 'member', joinedAt: new Date() });
    added.push(id.toString());
  }
  await conv.save();

  let systemMessage = null;
  if (added.length) {
    const actor = await User.findById(requesterId).select('displayName');
    const actorName = actor?.displayName || 'Someone';
    systemMessage = await createSystemMessage({
      roomId: conversationId,
      userId: requesterId,
      content: `${actorName} added ${added.length} member${added.length > 1 ? 's' : ''}`,
      meta: { kind: 'member_added', actorId: requesterId, actorName, addedIds: added },
    });
  }

  return {
    room: await populateConversation(conv, requesterId),
    addedIds: added,
    systemMessage,
  };
}

export async function removeGroupMember(conversationId, requesterId, targetUserId) {
  const conv = await Conversation.findById(conversationId).populate('members.userId', 'displayName username');
  if (!conv || conv.type !== 'group') return null;

  const isSelf = requesterId === targetUserId;
  if (!isSelf && !memberIsAdmin(conv, requesterId)) {
    throw new Error('Only group admins can remove members');
  }

  if (conv.createdBy?.toString() === targetUserId && !isSelf) {
    throw new Error('Cannot remove the group creator');
  }

  const target = conv.members.find((m) => m.userId._id?.toString?.() === targetUserId || m.userId.toString() === targetUserId);
  if (!target || target.removedAt) throw new Error('User is not in this group');

  if (!isSelf && target.role === 'admin' && conv.createdBy?.toString() !== requesterId) {
    throw new Error('Only the group creator can remove another admin');
  }

  const requesterMember = conv.members.find((m) => m.userId._id?.toString?.() === requesterId || m.userId.toString() === requesterId);
  const actorName = requesterMember?.userId?.displayName || 'Someone';
  const targetName = target.userId?.displayName || 'a member';

  // Soft-remove so they can still see history + system notice
  target.removedAt = new Date();
  target.removedBy = requesterId;

  const activeMembers = conv.members.filter((m) => !m.removedAt);
  if (activeMembers.length === 0) {
    await Conversation.findByIdAndDelete(conversationId);
    return { deleted: true, id: conversationId };
  }

  if (conv.createdBy?.toString() === targetUserId) {
    const nextAdmin = activeMembers.find((m) => m.role === 'admin') || activeMembers[0];
    if (nextAdmin) {
      nextAdmin.role = 'admin';
      conv.createdBy = nextAdmin.userId._id || nextAdmin.userId;
    }
  }

  await conv.save();

  const systemContent = isSelf
    ? `${actorName} left the group`
    : `${actorName} removed ${targetName}`;

  const systemMessage = await createSystemMessage({
    roomId: conversationId,
    userId: requesterId,
    content: systemContent,
    meta: {
      kind: isSelf ? 'member_left' : 'member_removed',
      actorId: requesterId,
      actorName,
      targetUserId,
      targetName,
    },
  });

  const room = await populateConversation(conv, isSelf ? targetUserId : requesterId);
  return {
    room,
    systemMessage,
    removedUserId: targetUserId,
    noticeForRemoved: isSelf ? 'You left this group' : `${actorName} has removed you`,
  };
}

export async function setGroupMemberRole(conversationId, requesterId, targetUserId, role) {
  if (!['admin', 'member'].includes(role)) {
    throw new Error('Role must be admin or member');
  }

  const conv = await Conversation.findById(conversationId);
  if (!conv || conv.type !== 'group') return null;
  if (!memberIsAdmin(conv, requesterId)) {
    throw new Error('Only group admins can change roles');
  }

  const target = conv.members.find((m) => m.userId.toString() === targetUserId);
  if (!target) throw new Error('User is not in this group');

  if (role === 'member' && conv.createdBy?.toString() === targetUserId) {
    throw new Error('Group creator must remain an admin');
  }

  const adminCount = conv.members.filter((m) => m.role === 'admin').length;
  if (role === 'member' && target.role === 'admin' && adminCount <= 1) {
    throw new Error('Group must have at least one admin');
  }

  target.role = role;
  await conv.save();
  return populateConversation(conv, requesterId);
}

export async function getConversationMembers(conversationId) {
  const conv = await Conversation.findById(conversationId).populate('members.userId');
  if (!conv) return [];

  const creatorId = conv.createdBy?.toString();

  return conv.members
    .map((m) => {
      const formatted = formatMember(m);
      if (!formatted) return null;
      if (formatted.removedAt) return null; // hide removed from active list
      if (creatorId && formatted.id === creatorId) {
        formatted.role = 'admin';
      } else if (!formatted.role) {
        formatted.role = 'member';
      }
      return formatted;
    })
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function isConversationMember(conversationId, userId, { requireActive = false } = {}) {
  const conv = await Conversation.findById(conversationId);
  if (!conv) return false;
  const member = conv.members.find((m) => m.userId.toString() === userId);
  if (!member) return false;
  if (requireActive && member.removedAt) return false;
  return true;
}

export async function canSendInConversation(conversationId, userId) {
  return isConversationMember(conversationId, userId, { requireActive: true });
}

// Aliases for existing route names
export const getUserRooms = getUserConversations;
export const getRoomById = getConversationById;
export const getRoomMembers = getConversationMembers;
export const isRoomMember = isConversationMember;
export const getOrCreateDmRoom = getOrCreatePrivateChat;
export const createRoom = (data) => createGroupChat({ ...data, memberIds: data.memberIds || [] });

export async function joinPublicRoom() {
  return null;
}

// ─── Messages ───

export async function getConversationMessages(conversationId, userId, limit = 100, before = null) {
  const query = { conversationId };
  if (before) query.createdAt = { $lt: new Date(before) };

  const conv = await Conversation.findById(conversationId);
  const memberCount = conv?.members?.length || 2;

  const messages = await Message.find({ ...query, hiddenFor: { $ne: userId } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'username displayName avatarColor avatarUrl')
    .populate({
      path: 'replyTo',
      populate: { path: 'userId', select: 'username' },
    })
    .lean();

  return messages
    .reverse()
    .map((m) => formatMessage(m, userId, memberCount))
    .filter(Boolean);
}

export const getRoomMessages = getConversationMessages;

export async function getMessageById(messageId, userId) {
  const msg = await Message.findById(messageId)
    .populate('userId', 'username displayName avatarColor avatarUrl')
    .populate({ path: 'replyTo', populate: { path: 'userId', select: 'username' } });

  if (!msg) return null;
  const conv = await Conversation.findById(msg.conversationId);
  return formatMessage(msg, userId, conv?.members?.length || 2);
}

export async function createMessage({
  conversationId, roomId, userId, content, type = 'text',
  imageUrl = null, fileUrl = null, fileName = null, fileSize = null, replyTo = null, meta = null,
  hiddenFor = [],
  formatAsUserId = null,
}) {
  const convId = conversationId || roomId;

  const message = await Message.create({
    conversationId: convId,
    userId,
    content,
    type,
    imageUrl,
    fileUrl,
    fileName,
    fileSize,
    replyTo,
    meta,
    hiddenFor,
    deliveredTo: [userId],
    readBy: [{ userId, readAt: new Date() }],
  });

  await Conversation.findByIdAndUpdate(convId, { updatedAt: new Date() });

  const viewAs = formatAsUserId
    || (hiddenFor.map(String).includes(String(userId)) ? (meta?.calleeId || userId) : userId);
  return getMessageById(message._id, viewAs);
}

export async function createSystemMessage({ roomId, userId, content, meta = null, hiddenFor = [] }) {
  return createMessage({
    roomId,
    userId,
    content,
    type: 'system',
    meta,
    hiddenFor,
    formatAsUserId: meta?.calleeId || undefined,
  });
}

export async function logCompletedCall({ roomId, callerId, calleeId, callType, durationSec }) {
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  const duration = `${mins}:${String(secs).padStart(2, '0')}`;
  const label = callType === 'video' ? 'video' : 'voice';

  return createSystemMessage({
    roomId,
    userId: callerId,
    content: `${label.charAt(0).toUpperCase() + label.slice(1)} call · ${duration}`,
    meta: {
      kind: 'call_completed',
      callType: callType || 'audio',
      callerId,
      calleeId,
      duration,
      durationSec,
    },
  });
}

export async function markMessageDelivered(messageId, userId) {
  const msg = await Message.findByIdAndUpdate(
    messageId,
    { $addToSet: { deliveredTo: userId } },
    { new: true }
  );
  return msg;
}

export async function editMessage(messageId, userId, content) {
  const msg = await Message.findOne({ _id: messageId, userId, deletedAt: null });
  if (!msg) return null;

  const age = Date.now() - new Date(msg.createdAt).getTime();
  if (age > 15 * 60 * 1000) return null;

  msg.content = content;
  msg.editedAt = new Date();
  await msg.save();

  return getMessageById(messageId, userId);
}

export async function deleteMessage(messageId, userId, scope = 'everyone') {
  const msg = await Message.findById(messageId);
  if (!msg || msg.deletedAt) return null;

  if (scope === 'me') {
    if (!msg.hiddenFor.some((id) => id.toString() === userId)) {
      msg.hiddenFor.push(userId);
      await msg.save();
    }
    return { id: messageId, deletedForMe: true, roomId: msg.conversationId.toString() };
  }

  if (msg.userId.toString() !== userId) return null;
  msg.deletedAt = new Date();
  msg.content = '';
  msg.imageUrl = null;
  msg.fileUrl = null;
  await msg.save();
  return getMessageById(messageId, userId);
}

export async function toggleReaction(messageId, userId, emoji) {
  const msg = await Message.findById(messageId);
  if (!msg || msg.deletedAt) return null;

  const existing = msg.reactions.findIndex(
    (r) => r.userId.toString() === userId && r.emoji === emoji
  );
  if (existing >= 0) {
    msg.reactions.splice(existing, 1);
  } else {
    msg.reactions = msg.reactions.filter((r) => r.userId.toString() !== userId || r.emoji !== emoji);
    msg.reactions.push({ emoji, userId });
  }
  await msg.save();
  return getMessageById(messageId, userId);
}

export async function toggleStarMessage(messageId, userId) {
  const msg = await Message.findById(messageId);
  if (!msg || msg.deletedAt) return null;

  const idx = msg.starredBy.findIndex((id) => id.toString() === userId);
  if (idx >= 0) msg.starredBy.splice(idx, 1);
  else msg.starredBy.push(userId);
  await msg.save();
  return getMessageById(messageId, userId);
}

export async function markMessagesAsRead(conversationId, userId, upToMessageId = null) {
  await Conversation.updateOne(
    { _id: conversationId, 'members.userId': userId },
    { $set: { 'members.$.lastReadAt': new Date() } }
  );

  let query = {
    conversationId,
    userId: { $ne: userId },
    deletedAt: null,
  };

  if (upToMessageId) {
    const target = await Message.findById(upToMessageId);
    if (target) query.createdAt = { $lte: target.createdAt };
  }

  const messages = await Message.find(query);
  const readIds = [];

  for (const msg of messages) {
    const alreadyRead = msg.readBy.some((r) => r.userId.toString() === userId);
    if (!alreadyRead) {
      msg.readBy.push({ userId, readAt: new Date() });
      if (!msg.deliveredTo.some((id) => id.toString() === userId)) {
        msg.deliveredTo.push(userId);
      }
      await msg.save();
      readIds.push(msg._id.toString());
    }
  }

  return readIds;
}

export async function searchMessages(userId, query, limit = 50) {
  const convs = await Conversation.find({ 'members.userId': userId }).select('_id name type');
  const convIds = convs.map((c) => c._id);

  const messages = await Message.find({
    conversationId: { $in: convIds },
    content: { $regex: query, $options: 'i' },
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'displayName')
    .lean();

  return messages.map((m) => {
    const conv = convs.find((c) => c._id.toString() === m.conversationId.toString());
    return {
      id: m._id.toString(),
      roomId: m.conversationId.toString(),
      content: m.content,
      createdAt: m.createdAt,
      displayName: m.userId.displayName,
      roomName: conv?.name,
      roomType: conv?.type === 'private' ? 'dm' : conv?.type,
    };
  });
}

export async function getUnreadCount(userId) {
  const convs = await Conversation.find({ 'members.userId': userId });
  let total = 0;
  for (const conv of convs) {
    const member = conv.members.find((m) => m.userId.toString() === userId);
    const count = await Message.countDocuments({
      conversationId: conv._id,
      userId: { $ne: userId },
      deletedAt: null,
      createdAt: { $gt: member?.lastReadAt || new Date(0) },
    });
    total += count;
  }
  return total;
}
