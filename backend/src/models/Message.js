import mongoose from 'mongoose';

const readSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const reactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '' },
    type: { type: String, enum: ['text', 'image', 'file', 'audio'], default: 'text' },
    imageUrl: { type: String },
    fileUrl: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    readBy: [readSchema],
    reactions: [reactionSchema],
    hiddenFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    editedAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ content: 'text' });

export default mongoose.models.Message || mongoose.model('Message', messageSchema);
