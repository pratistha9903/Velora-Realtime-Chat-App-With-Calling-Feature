import { useState } from 'react';
import {
  Check, CheckCheck, MoreHorizontal, Pencil, Trash2, Reply, Copy, Star, Smile, FileText, X,
} from 'lucide-react';
import Avatar from '../ui/Avatar';
import { formatMessageTime } from './DateSeparator';
import { getApiUrl } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function MessageStatus({ status }) {
  if (status === 'read') return <CheckCheck size={14} className="status-read" />;
  if (status === 'delivered') return <CheckCheck size={14} className="status-delivered" />;
  return <Check size={14} className="status-sent" />;
}

function mediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) return url;
  const base = getApiUrl().replace(/\/$/, '');
  return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}

function formatBytes(size) {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MessageBubble({
  message, isOwn, showAvatar, onReply, onEdit, onDelete, onReact, onStar, currentUserId,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content || '');
  const [lightbox, setLightbox] = useState(null);
  const { addToast } = useToast();

  if (message.type === 'system') {
    let text = message.content || '';
    if (
      message.meta?.kind === 'member_removed'
      && message.meta?.targetUserId === currentUserId
    ) {
      text = `${message.meta.actorName || 'Someone'} has removed you`;
    }
    const isMissed = message.meta?.kind === 'missed_call';
    const isCompleted = message.meta?.kind === 'call_completed';
    return (
      <div className={`msg-system ${isMissed ? 'missed-call' : ''} ${isCompleted ? 'call-completed' : ''}`}>
        <span>{isMissed ? `📞 ${text}` : isCompleted ? `📞 ${text}` : text}</span>
      </div>
    );
  }

  if (message.deletedAt) {
    return (
      <div className={`msg-row ${isOwn ? 'msg-own' : 'msg-other'}`}>
        <div className="msg-deleted">
          <span>This message was deleted</span>
        </div>
      </div>
    );
  }

  const imageSrc = message.type === 'image'
    ? mediaUrl(message.imageUrl || message.fileUrl)
    : null;
  const fileSrc = mediaUrl(message.fileUrl || message.imageUrl);
  const audioSrc = message.type === 'audio' ? fileSrc : null;

  const handleEdit = () => {
    if (editText.trim() && editText !== message.content) {
      onEdit(message.id, editText.trim());
    }
    setEditing(false);
    setMenuOpen(false);
  };

  const copyMessage = async () => {
    const text = message.content || message.fileName || imageSrc || fileSrc || '';
    try {
      await navigator.clipboard.writeText(text);
      addToast('Copied to clipboard', 'success');
    } catch {
      addToast('Could not copy', 'error');
    }
    setMenuOpen(false);
  };

  return (
    <div
      className={`msg-row ${isOwn ? 'msg-own' : 'msg-other'}`}
      onMouseLeave={() => { setMenuOpen(false); setReactOpen(false); }}
    >
      {!isOwn && showAvatar && (
        <Avatar
          name={message.displayName}
          color={message.avatarColor}
          avatarUrl={message.avatarUrl}
          size={32}
        />
      )}
      {!isOwn && !showAvatar && <div className="msg-avatar-spacer" />}

      <div className="msg-body">
        {!isOwn && showAvatar && (
          <span className="msg-sender">{message.displayName}</span>
        )}

        {message.replyContent && (
          <div className="msg-reply-preview">
            <span className="msg-reply-user">{message.replyUsername}</span>
            <span>{message.replyContent}</span>
          </div>
        )}

        {editing ? (
          <div className="msg-edit-form">
            <input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
              autoFocus
            />
            <div className="msg-edit-actions">
              <button onClick={() => setEditing(false)}>Cancel</button>
              <button className="primary" onClick={handleEdit}>Save</button>
            </div>
          </div>
        ) : (
          <div className={`msg-bubble ${isOwn ? 'bubble-own' : 'bubble-other'} ${message.starred ? 'starred' : ''}`}>
            {imageSrc && (
              <button type="button" className="msg-image-btn" onClick={() => setLightbox(imageSrc)}>
                <img
                  src={imageSrc}
                  alt="Shared"
                  className="msg-image"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.classList.add('broken');
                    e.currentTarget.alt = 'Image failed to load';
                  }}
                />
              </button>
            )}
            {message.type === 'file' && fileSrc && (
              <a className="msg-file-card" href={fileSrc} target="_blank" rel="noreferrer">
                <FileText size={22} />
                <div>
                  <strong>{message.fileName || 'Document'}</strong>
                  <span>{formatBytes(message.fileSize) || 'Open file'}</span>
                </div>
              </a>
            )}
            {audioSrc && (
              <div className="msg-audio-wrap">
                <span className="msg-audio-label">Voice note</span>
                <audio controls preload="metadata" className="msg-audio" src={audioSrc}>
                  <a href={audioSrc}>Download audio</a>
                </audio>
              </div>
            )}
            {message.content && <p>{message.content}</p>}
            {message.starred && <Star size={12} className="msg-star-icon" />}
          </div>
        )}

        {message.reactions?.length > 0 && (
          <div className="msg-reactions">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                className={`reaction-chip ${r.reacted ? 'active' : ''}`}
                onClick={() => onReact?.(message.id, r.emoji)}
              >
                {r.emoji} {r.count}
              </button>
            ))}
          </div>
        )}

        <div className="msg-meta">
          <span className="msg-time">{formatMessageTime(message.createdAt)}</span>
          {message.editedAt && <span className="msg-edited">edited</span>}
          {isOwn && <MessageStatus status={message.status} />}
        </div>
      </div>

      {!editing && (
        <div className="msg-actions">
          <button className="icon-btn sm" onClick={() => { setReactOpen(!reactOpen); setMenuOpen(false); }}>
            <Smile size={16} />
          </button>
          <button className="icon-btn sm" onClick={() => { setMenuOpen(!menuOpen); setReactOpen(false); }}>
            <MoreHorizontal size={16} />
          </button>
          {reactOpen && (
            <div className="msg-menu react-menu">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  className="react-btn"
                  onClick={() => { onReact?.(message.id, emoji); setReactOpen(false); }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          {menuOpen && (
            <div className="msg-menu">
              <button onClick={() => { onReply(message); setMenuOpen(false); }}>
                <Reply size={14} /> Reply
              </button>
              <button onClick={copyMessage}>
                <Copy size={14} /> Copy
              </button>
              <button onClick={() => { onStar?.(message.id); setMenuOpen(false); }}>
                <Star size={14} /> {message.starred ? 'Unstar' : 'Star'}
              </button>
              {isOwn && (
                <button onClick={() => { setEditing(true); setMenuOpen(false); }}>
                  <Pencil size={14} /> Edit
                </button>
              )}
              <button onClick={() => { onDelete(message.id, 'me'); setMenuOpen(false); }}>
                <Trash2 size={14} /> Delete for me
              </button>
              {isOwn && (
                <button className="danger" onClick={() => { onDelete(message.id, 'everyone'); setMenuOpen(false); }}>
                  <Trash2 size={14} /> Delete for everyone
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {lightbox && (
        <div className="media-lightbox" onClick={() => setLightbox(null)}>
          <button type="button" className="lightbox-close" onClick={() => setLightbox(null)}>
            <X size={20} />
          </button>
          <img src={lightbox} alt="Full size" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
