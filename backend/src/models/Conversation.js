import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: Date.now },
    lastReadAt: { type: Date },
    archived: { type: Boolean, default: false },
    muted: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    type: { type: String, enum: ['private', 'group'], required: true },
    description: { type: String, trim: true },
    members: [memberSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    avatarColor: { type: String },
  },
  { timestamps: true }
);

conversationSchema.index({ 'members.userId': 1 });
conversationSchema.index({ type: 1 });

export default mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
