import { useState } from 'react';
import {
  Check, CheckCheck, MoreHorizontal, Pencil, Trash2, Reply, Copy, Star, Smile,
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
  if (url.startsWith('http')) return url;
  return `${getApiUrl()}${url}`;
}

export default function MessageBubble({
  message, isOwn, showAvatar, onReply, onEdit, onDelete, onReact, onStar,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content || '');
  const { addToast } = useToast();

  if (message.deletedAt) {
    return (
      <div className={`msg-row ${isOwn ? 'msg-own' : 'msg-other'}`}>
        <div className="msg-deleted">
          <span>This message was deleted</span>
        </div>
      </div>
    );
  }

  const handleEdit = () => {
    if (editText.trim() && editText !== message.content) {
      onEdit(message.id, editText.trim());
    }
    setEditing(false);
    setMenuOpen(false);
  };

  const copyMessage = async () => {
    const text = message.content || message.fileName || message.imageUrl || '';
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
            {message.type === 'image' && message.imageUrl && (
              <img
                src={mediaUrl(message.imageUrl)}
                alt="Shared"
                className="msg-image"
                loading="lazy"
              />
            )}
            {message.type === 'file' && (
              <a
                className="msg-file"
                href={mediaUrl(message.fileUrl)}
                target="_blank"
                rel="noreferrer"
              >
                📎 {message.fileName || 'Document'}
                {message.fileSize ? ` (${Math.round(message.fileSize / 1024)} KB)` : ''}
              </a>
            )}
            {message.type === 'audio' && (
              <audio controls className="msg-audio" src={mediaUrl(message.fileUrl || message.imageUrl)} />
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
    </div>
  );
}
