import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getRoomMessages,
  createMessage,
  editMessage,
  deleteMessage,
  markMessagesAsRead,
  searchMessages,
  isRoomMember,
  canSendInConversation,
  toggleReaction,
  toggleStarMessage,
} from '../db/services.js';

const router = Router();

router.use(authenticate);

router.get('/search', async (req, res, next) => {
  try {
    const q = req.query.q?.trim();
    if (!q || q.length < 2) {
      return res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
    }
    const results = await searchMessages(req.user.id, q);
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

router.get('/:roomId', async (req, res, next) => {
  try {
    const { roomId } = req.params;
    if (!(await isRoomMember(roomId, req.user.id))) {
      return res.status(403).json({ success: false, error: 'Not a member of this conversation' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const before = req.query.before || null;
    const messages = await getRoomMessages(roomId, req.user.id, limit, before);
    res.json({ success: true, data: messages });
  } catch (error) {
    next(error);
  }
});

router.post('/:roomId', async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { content, type, imageUrl, fileUrl, fileName, fileSize, replyTo } = req.body;

    if (!(await canSendInConversation(roomId, req.user.id))) {
      return res.status(403).json({ success: false, error: 'You cannot send messages in this chat' });
    }
    if (!content?.trim() && !imageUrl && !fileUrl) {
      return res.status(400).json({ success: false, error: 'Message content is required' });
    }

    const message = await createMessage({
      roomId,
      userId: req.user.id,
      content: content?.trim() || '',
      type: type || 'text',
      imageUrl,
      fileUrl,
      fileName,
      fileSize,
      replyTo,
    });

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
});

router.put('/:messageId', async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    const message = await editMessage(req.params.messageId, req.user.id, content.trim());
    if (!message) {
      return res.status(403).json({ success: false, error: 'Cannot edit this message' });
    }
    res.json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
});

router.delete('/:messageId', async (req, res, next) => {
  try {
    const scope = req.query.scope === 'me' ? 'me' : 'everyone';
    const message = await deleteMessage(req.params.messageId, req.user.id, scope);
    if (!message) {
      return res.status(403).json({ success: false, error: 'Cannot delete this message' });
    }
    res.json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
});

router.post('/:messageId/react', async (req, res, next) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ success: false, error: 'Emoji required' });
    const message = await toggleReaction(req.params.messageId, req.user.id, emoji);
    if (!message) return res.status(404).json({ success: false, error: 'Message not found' });
    res.json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
});

router.post('/:messageId/star', async (req, res, next) => {
  try {
    const message = await toggleStarMessage(req.params.messageId, req.user.id);
    if (!message) return res.status(404).json({ success: false, error: 'Message not found' });
    res.json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
});

router.post('/:roomId/read', async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { messageId } = req.body;

    if (!(await isRoomMember(roomId, req.user.id))) {
      return res.status(403).json({ success: false, error: 'Not a member of this conversation' });
    }

    const readIds = await markMessagesAsRead(roomId, req.user.id, messageId);
    res.json({ success: true, data: { readIds } });
  } catch (error) {
    next(error);
  }
});

export default router;
