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
  updateConversationPrefs,
} from '../db/services.js';
import { notifyConversationCreated } from '../sockets/socketHelpers.js';

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
    res.json({ success: true, data: room });
  } catch (error) {
    next(error);
  }
});

export default router;
