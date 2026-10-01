import { useEffect, useState } from 'react';
import {
  AtSign, Mail, Phone, Trash2, User, Video, MessageCircle,
} from 'lucide-react';
import Modal from '../ui/Modal';
import Avatar from '../ui/Avatar';
import { useContactNicknames } from '../../hooks/useContactNicknames';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';
import { format, parseISO } from 'date-fns';

export default function ContactProfileModal({
  peer,
  room,
  online,
  lastSeen,
  onClose,
  onDeleteChat,
  onStartCall,
  onOpenChat,
  callHistoryTick = 0,
}) {
  const { addToast } = useToast();
  const { map, setNickname, clearNickname, labelFor } = useContactNicknames();
  const [customName, setCustomName] = useState('');
  const [profileDetails, setProfileDetails] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [calls, setCalls] = useState([]);
  const [loadingCalls, setLoadingCalls] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!peer?.id) return;
    setCustomName(map[String(peer.id)] || '');
  }, [peer?.id, map]);

  useEffect(() => {
    if (!peer?.id) return undefined;
    let cancelled = false;
    (async () => {
      setLoadingProfile(true);
      try {
        const data = await api.getUserProfile(peer.id);
        if (!cancelled) setProfileDetails(data);
      } catch {
        if (!cancelled) setProfileDetails(null);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();
    return () => { cancelled = true; };
  }, [peer?.id]);

  useEffect(() => {
    if (!room?.id) return;
    (async () => {
      setLoadingCalls(true);
      try {
        const all = await api.getCallHistory();
        setCalls((all || []).filter((c) => c.roomId === room.id).slice(0, 8));
      } catch {
        setCalls([]);
      } finally {
        setLoadingCalls(false);
      }
    })();
  }, [room?.id, callHistoryTick]);

  if (!peer) return null;

  const saveCustomName = () => {
    setNickname(peer.id, customName);
    addToast(customName.trim() ? 'Custom name saved (only you can see it)' : 'Custom name removed', 'success');
  };

  const handleDelete = async () => {
    if (!room?.id) return;
    if (!window.confirm('Delete this chat? Messages stay on the server but the chat is removed from your list.')) return;
    setDeleting(true);
    try {
      await api.deleteRoom(room.id);
      onDeleteChat?.(room.id);
      addToast('Chat deleted', 'success');
      onClose();
    } catch (err) {
      addToast(err.message || 'Could not delete chat', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const displayLabel = labelFor(peer.id, peer.displayName);
  const email = profileDetails?.email || peer.email || null;
  const emailVerified = profileDetails?.emailVerified ?? peer.emailVerified;
  const bio = profileDetails?.bio ?? peer.bio;

  return (
    <Modal title="Contact info" onClose={onClose} width={440}>
      <div className="contact-profile">
        <div className="contact-profile-hero">
          <Avatar
            name={peer.displayName}
            color={peer.avatarColor}
            avatarUrl={peer.avatarUrl}
            size={88}
            online={online}
          />
          <h2>{displayLabel}</h2>
          {customName.trim() && customName.trim() !== peer.displayName && (
            <p className="contact-real-name">{peer.displayName}</p>
          )}
          <p className="contact-handle">
            <AtSign size={14} />
            {peer.username || 'unknown'}
          </p>
          <p className="contact-status">
            {online ? 'Online' : lastSeen ? `Last seen ${format(parseISO(lastSeen), 'MMM d, h:mm a')}` : 'Offline'}
          </p>
        </div>

        <div className="contact-section">
          <label className="contact-label">
            <User size={14} />
            Custom name <span className="contact-hint">(only visible to you)</span>
          </label>
          <div className="contact-name-row">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={peer.displayName}
              maxLength={30}
            />
            <button type="button" className="contact-save-btn" onClick={saveCustomName}>
              Save
            </button>
          </div>
          {map[String(peer.id)] && (
            <button type="button" className="link-btn sm" onClick={() => { clearNickname(peer.id); setCustomName(''); }}>
              Reset to {peer.displayName}
            </button>
          )}
        </div>

        <div className="contact-section">
          <h4>Profile</h4>
          <div className="contact-detail-grid">
            <div><span>Display name</span><strong>{profileDetails?.displayName || peer.displayName}</strong></div>
            <div><span>Username</span><strong>@{profileDetails?.username || peer.username || 'unknown'}</strong></div>
            <div className="full">
              <span><Mail size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Email</span>
              {loadingProfile && <strong>Loading…</strong>}
              {!loadingProfile && email && (
                <strong>
                  {email}
                  {emailVerified && <span className="contact-hint"> · verified</span>}
                </strong>
              )}
              {!loadingProfile && !email && <strong className="contact-hint">Not available</strong>}
            </div>
            {bio && <div className="full"><span>Bio</span><strong>{bio}</strong></div>}
          </div>
        </div>

        <div className="contact-actions-row">
          <button type="button" className="contact-action-btn" onClick={() => { onOpenChat?.(); onClose(); }}>
            <MessageCircle size={18} />
            Message
          </button>
          <button type="button" className="contact-action-btn" onClick={() => onStartCall?.('audio')}>
            <Phone size={18} />
            Call
          </button>
          <button type="button" className="contact-action-btn" onClick={() => onStartCall?.('video')}>
            <Video size={18} />
            Video
          </button>
        </div>

        <div className="contact-section">
          <h4>Recent calls</h4>
          {loadingCalls && <p className="search-hint">Loading…</p>}
          {!loadingCalls && calls.length === 0 && (
            <p className="search-hint">No calls with this contact yet</p>
          )}
          <ul className="contact-call-list">
            {calls.map((c) => (
              <li key={c.id} className={`contact-call-item ${c.kind}`}>
                {c.callType === 'video' ? <Video size={16} /> : <Phone size={16} />}
                <div>
                  <span>{c.label}</span>
                  <small>{format(parseISO(c.createdAt), 'MMM d, h:mm a')}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {room?.type === 'dm' && (
          <button
            type="button"
            className="contact-delete-btn"
            disabled={deleting}
            onClick={handleDelete}
          >
            <Trash2 size={16} />
            {deleting ? 'Deleting…' : 'Delete chat'}
          </button>
        )}
      </div>
    </Modal>
  );
}
