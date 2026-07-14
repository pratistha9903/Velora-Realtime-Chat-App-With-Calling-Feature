import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, required: true, lowercase: true, trim: true },
    email: { type: String, unique: true, required: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    displayName: { type: String, required: true, trim: true },
    avatarColor: { type: String, required: true },
    avatarUrl: { type: String, default: null },
    bio: { type: String, default: '', maxlength: 160 },
    lastSeen: { type: Date },
    emailVerified: { type: Boolean, default: false },
    emailVerifyToken: { type: String, default: null },
    passwordResetToken: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },
    googleId: { type: String, default: null, sparse: true },
    refreshTokenHash: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model('User', userSchema);
