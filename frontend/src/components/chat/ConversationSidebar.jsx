import { MessageCircle, Search, Bell, Users, UserPlus, Pin, VolumeX, Archive, Phone } from 'lucide-react';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import Avatar from '../ui/Avatar';
import { SidebarSkeleton } from '../ui/Skeleton';
import CallsPanel from './CallsPanel';
import { useContactNicknames } from '../../hooks/useContactNicknames';

function formatTime(dateStr) {
  if (!dateStr) return '';
  const date = parseISO(dateStr);
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMM d');
}

export default function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onNewGroup,
  onSearch,
  onNotifications,
  onProfile,
  onContactClick,
  notificationCount,
  user,
  loading,
  onlineUsers,
  sidebarView = 'chats',
  onSidebarViewChange,
  showArchived = false,
  callHistoryTick = 0,
  onSocket,
}) {
  const { labelFor } = useContactNicknames();
  const onlineIds = new Set(onlineUsers.map((u) => u.id));
  const visible = conversations.filter((c) => (showArchived ? c.archived : !c.archived));

  return (
    <aside className="conv-sidebar">
      <div className="conv-sidebar-header">
        <div className="sidebar-brand">
          <MessageCircle size={22} />
          <span>Chats</span>
        </div>
        <div className="sidebar-actions">
          <button className="icon-btn" onClick={onNotifications} title="Notifications">
            <Bell size={18} />
            {notificationCount > 0 && <span className="notif-dot">{notificationCount}</span>}
          </button>
          <button className="icon-btn" onClick={onSearch} title="Search"><Search size={18} /></button>
          <button className="icon-btn" onClick={onNewGroup} title="New group"><Users size={18} /></button>
          <button className="icon-btn" onClick={onNewChat} title="New chat"><UserPlus size={18} /></button>
        </div>
      </div>

      <div className="sidebar-tabs">
        <button
          type="button"
          className={`sidebar-tab ${sidebarView === 'chats' ? 'active' : ''}`}
          onClick={() => onSidebarViewChange?.('chats')}
        >
          <MessageCircle size={15} />
          Chats
        </button>
        <button
          type="button"
          className={`sidebar-tab ${sidebarView === 'calls' ? 'active' : ''}`}
          onClick={() => onSidebarViewChange?.('calls')}
        >
          <Phone size={15} />
          Calls
        </button>
      </div>

      {sidebarView === 'calls' ? (
        <CallsPanel
          onlineUsers={onlineUsers}
          callHistoryTick={callHistoryTick}
          onSocket={onSocket}
          onSelectCall={(call) => {
            const room = conversations.find((r) => r.id === call.roomId);
            if (room) onSelect(room);
          }}
        />
      ) : (
        <div className="conv-list">
          {loading ? (
            <SidebarSkeleton />
          ) : visible.length === 0 ? (
            <div className="conv-empty">
              <MessageCircle size={40} strokeWidth={1.5} />
              <h3>{showArchived ? 'No archived chats' : 'No conversations yet'}</h3>
              <p>Start a private chat or create a group</p>
              {!showArchived && (
                <button className="btn-primary sm" onClick={onNewChat}>Start Chatting</button>
              )}
            </div>
          ) : (
            visible.map((conv) => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                active={conv.id === activeId}
                onClick={() => onSelect(conv)}
                onContactClick={onContactClick}
                userId={user.id}
                labelFor={labelFor}
                isOnline={conv.type === 'dm' && conv.members?.some(
                  (m) => m.id !== user.id && onlineIds.has(m.id)
                )}
              />
            ))
          )}
        </div>
      )}

      <button type="button" className="sidebar-user" onClick={onProfile}>
        <Avatar
          name={user.displayName}
          color={user.avatarColor}
          avatarUrl={user.avatarUrl}
          size={32}
          online
        />
        <div className="sidebar-user-info">
          <span className="sidebar-user-name">{user.displayName}</span>
          <span className="sidebar-user-handle">@{user.username}</span>
        </div>
      </button>
    </aside>
  );
}

function ConversationItem({
  conv, active, onClick, onContactClick, userId, labelFor, isOnline,
}) {
  const isPrivate = conv.type === 'dm';
  const other = isPrivate ? conv.members?.find((m) => m.id !== userId) : null;
  const isGroup = conv.type === 'group';
  const title = isPrivate && other
    ? labelFor(other.id, conv.displayName || other.displayName)
    : (conv.displayName || conv.name);

  const openContact = (e) => {
    if (!isPrivate || !other) return;
    e.stopPropagation();
    onContactClick?.({ peer: other, room: conv });
  };

  return (
    <div className={`conv-item ${active ? 'active' : ''}`}>
      <button type="button" className="conv-avatar-btn" onClick={openContact} title="Contact info">
        {isPrivate && other ? (
          <Avatar
            name={other.displayName}
            color={other.avatarColor}
            avatarUrl={other.avatarUrl || conv.avatarUrl}
            size={44}
            online={isOnline}
          />
        ) : (
          <Avatar
            name={conv.displayName || conv.name}
            color={conv.avatarColor || '#6366f1'}
            size={44}
          />
        )}
      </button>

      <button type="button" className="conv-item-body" onClick={onClick}>
        <div className="conv-item-top">
          <span
            className={`conv-item-name ${isPrivate ? 'clickable-name' : ''}`}
            onClick={isPrivate ? openContact : undefined}
            role={isPrivate ? 'button' : undefined}
            tabIndex={isPrivate ? 0 : undefined}
            onKeyDown={isPrivate ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openContact(e); } } : undefined}
            title={isPrivate ? 'Contact info' : undefined}
          >
            {conv.pinned && <Pin size={12} className="conv-pin" />}
            {title}
            {isGroup && <span className="group-tag">Group</span>}
            {conv.muted && <VolumeX size={12} className="conv-muted" />}
            {conv.archived && <Archive size={12} className="conv-archived" />}
          </span>
          {conv.lastMessageAt && (
            <span className="conv-item-time">{formatTime(conv.lastMessageAt)}</span>
          )}
        </div>
        <div className="conv-item-bottom">
          <span className="conv-item-preview">
            {conv.lastMessage || 'No messages yet'}
          </span>
          {conv.unreadCount > 0 && !conv.muted && (
            <span className="unread-badge">{conv.unreadCount}</span>
          )}
        </div>
      </button>
    </div>
  );
}
