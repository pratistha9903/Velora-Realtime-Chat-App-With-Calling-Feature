import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getUserRooms,
  getRoomById,
  createGroupChat,
  getOrCreateDmRoom,
  getRoomMembers,
  getAllUsers,
  searchUsers,
  lookupUserByUsername,
  getContactProfile,
  updateConversationPrefs,
  addGroupMembers,
  removeGroupMember,
  setGroupMemberRole,
  deleteConversationForUser,
  getCallHistory,
} from '../db/services.js';
import { notifyConversationCreated, emitToUser, broadcastRoomUpdated } from '../sockets/socketHelpers.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const rooms = await getUserRooms(req.user.id);
    res.json({ success: true, data: rooms });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const users = await getAllUsers(req.user.id);
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

router.get('/users/lookup', async (req, res, next) => {
  try {
    const username = req.query.username?.trim();
    if (!username) {
      return res.status(400).json({ success: false, error: 'Username is required' });
    }
    const user = await lookupUserByUsername(username, req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

router.get('/users/search', async (req, res, next) => {
  try {
    const q = req.query.q?.trim();
    if (!q || q.length < 2) {
      return res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
    }
    const users = await searchUsers(q, req.user.id);
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

router.get('/users/:userId/profile', async (req, res, next) => {
  try {
    const profile = await getContactProfile(req.user.id, req.params.userId);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: profile });
  } catch (error) {
    if (error.status === 403) {
      return res.status(403).json({ success: false, error: error.message });
    }
    next(error);
  }
});

router.get('/calls/history', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const calls = await getCallHistory(req.user.id, limit);
    res.json({ success: true, data: calls });
  } catch (error) {
    next(error);
  }
});

router.post('/group', async (req, res, next) => {
  try {
    const { name, description, memberIds } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'Group name is required' });
    }
    if (!memberIds?.length) {
      return res.status(400).json({ success: false, error: 'Select at least one member for the group' });
    }

    const room = await createGroupChat({
      name: name.trim(),
      description: description?.trim(),
      createdBy: req.user.id,
      memberIds: memberIds.filter((id) => id !== req.user.id),
    });

    const io = req.app.get('io');
    if (io) {
      const others = memberIds.filter((id) => id !== req.user.id);
      await notifyConversationCreated(io, room.id, others);
    }

    res.status(201).json({ success: true, data: room });
  } catch (error) {
    next(error);
  }
});

router.post('/dm/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (userId === req.user.id) {
      return res.status(400).json({ success: false, error: 'Cannot create chat with yourself' });
    }

    const room = await getOrCreateDmRoom(req.user.id, userId);

    const io = req.app.get('io');
    if (io) {
      await notifyConversationCreated(io, room.id, [userId]);
    }

    res.json({ success: true, data: room });
  } catch (error) {
    next(error);
  }
});

router.get('/:roomId', async (req, res, next) => {
  try {
    const room = await getRoomById(req.params.roomId, req.user.id);
    if (!room) return res.status(404).json({ success: false, error: 'Conversation not found' });
    res.json({ success: true, data: room });
  } catch (error) {
    next(error);
  }
});

router.get('/:roomId/members', async (req, res, next) => {
  try {
    const members = await getRoomMembers(req.params.roomId);
    res.json({ success: true, data: members });
  } catch (error) {
    next(error);
  }
});

router.patch('/:roomId/prefs', async (req, res, next) => {
  try {
    const { archived, muted, pinned } = req.body;
    const room = await updateConversationPrefs(req.params.roomId, req.user.id, {
      archived,
      muted,
      pinned,
    });
    if (!room) return res.status(404).json({ success: false, error: 'Conversation not found' });

    const io = req.app.get('io');
    if (io) {
      emitToUser(io, req.user.id, 'room:updated', room);
    }

    res.json({ success: true, data: room });
  } catch (error) {
    next(error);
  }
});

router.delete('/:roomId', async (req, res, next) => {
  try {
    const result = await deleteConversationForUser(req.params.roomId, req.user.id);
    if (!result) return res.status(404).json({ success: false, error: 'Conversation not found' });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/:roomId/members', async (req, res, next) => {
  try {
    const memberIds = req.body.memberIds || [];
    if (!memberIds.length) {
      return res.status(400).json({ success: false, error: 'Select at least one member' });
    }
    const result = await addGroupMembers(req.params.roomId, req.user.id, memberIds);
    if (!result?.room) return res.status(404).json({ success: false, error: 'Group not found' });

    const io = req.app.get('io');
    if (io) {
      const ids = result.addedIds?.length ? result.addedIds : memberIds;
      if (ids.length) await notifyConversationCreated(io, result.room.id, ids);
      await broadcastRoomUpdated(io, result.room.id);
      if (result.systemMessage) {
        io.to(`room:${result.room.id}`).emit('message:new', result.systemMessage);
      }
    }

    res.json({ success: true, data: result.room });
  } catch (error) {
    if (error.message?.includes('Only group') || error.message?.includes('members')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    next(error);
  }
});

router.delete('/:roomId/members/:userId', async (req, res, next) => {
  try {
    const result = await removeGroupMember(req.params.roomId, req.user.id, req.params.userId);
    if (!result) return res.status(404).json({ success: false, error: 'Group not found' });

    const io = req.app.get('io');
    if (io && !result.deleted) {
      if (result.systemMessage) {
        io.to(`room:${req.params.roomId}`).emit('message:new', result.systemMessage);
      }
      await broadcastRoomUpdated(io, req.params.roomId);
      const { getRoomById } = await import('../db/services.js');
      const removedRoom = await getRoomById(req.params.roomId, req.params.userId);
      emitToUser(io, req.params.userId, 'room:member-removed', {
        roomId: req.params.roomId,
        notice: result.noticeForRemoved || 'You were removed from this group',
        systemMessage: result.systemMessage,
        room: removedRoom,
      });
    }

    res.json({ success: true, data: result.room || result });
  } catch (error) {
    if (error.message) {
      return res.status(403).json({ success: false, error: error.message });
    }
    next(error);
  }
});

router.patch('/:roomId/members/:userId/role', async (req, res, next) => {
  try {
    const { role } = req.body;
    const room = await setGroupMemberRole(req.params.roomId, req.user.id, req.params.userId, role);
    if (!room) return res.status(404).json({ success: false, error: 'Group not found' });

    const io = req.app.get('io');
    if (io) await broadcastRoomUpdated(io, room.id);

    res.json({ success: true, data: room });
  } catch (error) {
    if (error.message) {
      return res.status(403).json({ success: false, error: error.message });
    }
    next(error);
  }
});

export default router;
