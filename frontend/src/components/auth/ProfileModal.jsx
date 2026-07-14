import { useState } from 'react';
import { Upload } from 'lucide-react';
import Modal from '../ui/Modal';
import Avatar from '../ui/Avatar';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function ProfileModal({ onClose }) {
  const { user, updateProfile } = useAuth();
  const { addToast } = useToast();
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [bio, setBio] = useState(user.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [saving, setSaving] = useState(false);

  const uploadAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await api.uploadImage(file);
      setAvatarUrl(data.imageUrl || data.url);
      addToast('Photo uploaded', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({ displayName, bio, avatarUrl: avatarUrl || null });
      addToast('Profile updated', 'success');
      onClose();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit Profile" onClose={onClose}>
      <form className="profile-form" onSubmit={save}>
        <div className="profile-avatar-edit">
          <Avatar
            name={displayName || user.username}
            color={user.avatarColor}
            avatarUrl={avatarUrl}
            size={72}
          />
          <label className="btn-secondary sm">
            <Upload size={14} /> Change photo
            <input type="file" accept="image/*" hidden onChange={uploadAvatar} />
          </label>
        </div>

        <div className="form-group">
          <label>Display name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={30} required />
        </div>
        <div className="form-group">
          <label>Username</label>
          <input value={`@${user.username}`} disabled />
        </div>
        <div className="form-group">
          <label>Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            rows={3}
            placeholder="Tell others about yourself"
          />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input value={user.email} disabled />
          <span className="form-hint">
            {user.emailVerified ? 'Verified ✓' : 'Not verified'}
          </span>
        </div>

        <button type="submit" className="auth-submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </Modal>
  );
}
