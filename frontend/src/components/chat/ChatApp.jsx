import { useEffect, useRef, useState, useCallback } from 'react';
import { LogOut, Wifi, WifiOff, Users, MessageCircle, Pin, VolumeX, Archive } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useNotifications } from '../../context/NotificationContext';
import { useSocket } from '../../hooks/useSocket';
import { api } from '../../services/api';
import ConversationSidebar from './ConversationSidebar';
import MembersPanel from './MembersPanel';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';
import DateSeparator, { shouldShowDateSeparator } from './DateSeparator';
import CreateGroupModal from './CreateGroupModal';
import NewChatModal from './NewChatModal';
import SearchModal from './SearchModal';
import NotificationPanel from './NotificationPanel';
import ProfileModal from '../auth/ProfileModal';
import Avatar from '../ui/Avatar';
import { MessageListSkeleton } from '../ui/Skeleton';
import { formatDistanceToNow, parseISO } from 'date-fns';

export default function ChatApp() {
  const { user, logout, token } = useAuth();
  const { addToast } = useToast();
  const { addNotification, unreadCount } = useNotifications();
  const messagesEndRef = useRef(null);
  const activeRoomRef = useRef(null);

  const handleAuthError = useCallback(() => {
    logout();
    addToast('Session expired. Please sign in again.', 'error');
  }, [logout, addToast]);

  const [conversations, setConversations] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [showProfile, setShowProfile] = useState(false);

  const {
    connected, onlineUsers, typingInRoom,
    joinRoom, leaveRoom, sendMessage, editMessage, deleteMessage,
    reactMessage, starMessage, markRead, startTyping, stopTyping, on,
  } = useSocket(token, user, handleAuthError);

  const handleLogout = useCallback(() => {
    if (activeRoomRef.current) leaveRoom(activeRoomRef.current);
    setActiveRoom(null);
    setConversations([]);
    setMessages([]);
    logout();
    addToast('Signed out successfully', 'success');
  }, [leaveRoom, logout, addToast]);

  useEffect(() => {
    activeRoomRef.current = activeRoom?.id || null;
  }, [activeRoom]);

  useEffect(() => {
    if (connected && activeRoomRef.current) {
      joinRoom(activeRoomRef.current);
    }
  }, [connected, joinRoom]);

  const selectRoom = useCallback(async (room) => {
    if (activeRoomRef.current) leaveRoom(activeRoomRef.current);
    setActiveRoom(room);
    setMessages([]);
    setReplyTo(null);
    setLoadingMessages(true);
    joinRoom(room.id);

    try {
      const [msgs, mems] = await Promise.all([
        api.getMessages(room.id),
        api.getRoomMembers(room.id),
      ]);
      setMessages(msgs);
      setMembers(mems);

      if (msgs.length > 0) {
        const last = msgs[msgs.length - 1];
        markRead(room.id, last.id);
        api.markRead(room.id, last.id).catch(() => {});
      }

      setConversations((prev) =>
        prev.map((r) => (r.id === room.id ? { ...r, unreadCount: 0 } : r))
      );
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoadingMessages(false);
    }
  }, [joinRoom, leaveRoom, markRead, addToast]);

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.getRooms();
      setConversations(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const cleanups = [];

    cleanups.push(on('message:new', (msg) => {
      const isActive = msg.roomId === activeRoomRef.current;

      if (!isActive) {
        setConversations((prev) =>
          prev.map((r) =>
            r.id === msg.roomId
              ? {
                  ...r,
                  lastMessage: msg.type === 'image' ? '📷 Photo' : msg.content,
                  lastMessageAt: msg.createdAt,
                  unreadCount: (r.unreadCount || 0) + 1,
                }
              : r
          ).sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt))
        );
        return;
      }

      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      markRead(msg.roomId, msg.id);
      api.markRead(msg.roomId, msg.id).catch(() => {});
    }));

    cleanups.push(on('message:updated', (msg) => {
      if (msg.roomId === activeRoomRef.current) {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      }
    }));

    cleanups.push(on('message:status', ({ id, status }) => {
      if (activeRoomRef.current) {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
      }
    }));

    cleanups.push(on('message:read', ({ roomId, readIds }) => {
      if (roomId === activeRoomRef.current) {
        setMessages((prev) =>
          prev.map((m) => readIds.includes(m.id) ? { ...m, status: 'read' } : m)
        );
      }
    }));

    cleanups.push(on('room:updated', (room) => {
      setConversations((prev) => {
        const idx = prev.findIndex((r) => r.id === room.id);
        if (idx === -1) return [room, ...prev];
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...room };
        return updated.sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt));
      });
    }));

    cleanups.push(on('room:new', (room) => {
      setConversations((prev) => {
        if (prev.some((r) => r.id === room.id)) return prev;
        return [room, ...prev];
      });
      joinRoom(room.id);
      addToast(`New conversation: ${room.displayName || room.name}`, 'info');
    }));

    cleanups.push(on('message:deleted-for-me', ({ id }) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }));

    cleanups.push(on('notification:new', (notif) => {
      addNotification(notif);
      if (activeRoomRef.current !== notif.conversationId) {
        addToast(`${notif.title}: ${notif.body}`, 'info');
      }
    }));

    cleanups.push(on('error', ({ message }) => addToast(message, 'error')));

    return () => cleanups.forEach((fn) => fn?.());
  }, [on, markRead, addToast, addNotification, joinRoom]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingInRoom, activeRoom]);

  const handleSend = (payload) => {
    if (!activeRoom) return;
    sendMessage(activeRoom.id, payload.content || '', {
      type: payload.type,
      imageUrl: payload.imageUrl,
      fileUrl: payload.fileUrl,
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      replyTo: payload.replyTo,
    });
  };

  const handleDelete = (messageId, scope = 'everyone') => {
    deleteMessage(messageId, scope);
    if (scope === 'me') {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    }
  };

  const updatePrefs = async (prefs) => {
    if (!activeRoom) return;
    try {
      const room = await api.updateRoomPrefs(activeRoom.id, prefs);
      setActiveRoom(room);
      setConversations((prev) => prev.map((r) => (r.id === room.id ? { ...r, ...room } : r)));
      addToast('Chat preferences updated', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const lastSeenLabel = (() => {
    if (!activeRoom || activeRoom.type !== 'dm') return null;
    const online = onlineUsers.some((u) =>
      activeRoom.members?.some((m) => m.id === u.id && m.id !== user.id)
    );
    if (online) return 'Online';
    const other = activeRoom.members?.find((m) => m.id !== user.id);
    const seen = activeRoom.otherLastSeen || other?.lastSeen;
    if (!seen) return 'Offline';
    try {
      return `Last seen ${formatDistanceToNow(parseISO(seen), { addSuffix: true })}`;
    } catch {
      return 'Offline';
    }
  })();

  const handleCreateGroup = async (data) => {
    const room = await api.createGroup(data);
    setConversations((prev) => [room, ...prev]);
    selectRoom(room);
    addToast(`Group "${room.name}" created`, 'success');
  };

  const handleChatCreated = (room) => {
    setConversations((prev) => {
      if (prev.some((r) => r.id === room.id)) return prev;
      return [room, ...prev];
    });
    selectRoom(room);
  };

  const handleNotificationSelect = (conversationId) => {
    const room = conversations.find((r) => r.id === conversationId);
    if (room) selectRoom(room);
  };

  if (loading && conversations.length === 0) {
    return (
      <div className="app-layout">
        <header className="app-top-bar">
          <div className="app-top-brand"><MessageCircle size={20} /><span>PulseChat</span></div>
          <button className="sign-out-btn" onClick={handleLogout}><LogOut size={16} /><span>Sign out</span></button>
        </header>
        <div className="app-shell">
          <aside className="conv-sidebar"><div className="skeleton-sidebar" /></aside>
          <main className="chat-panel"><div className="app-loading"><div className="spinner" /></div></main>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <header className="app-top-bar">
        <div className="app-top-brand">
          <MessageCircle size={20} />
          <span>PulseChat</span>
        </div>
        <div className="app-top-right">
          <span className="app-top-user">{user.displayName}</span>
          <button className="sign-out-btn" onClick={handleLogout} title="Sign out">
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <div className="app-shell">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeRoom?.id}
        onSelect={selectRoom}
        onNewChat={() => setShowNewChat(true)}
        onNewGroup={() => setShowNewGroup(true)}
        onSearch={() => setShowSearch(true)}
        onNotifications={() => setShowNotifications(!showNotifications)}
        onProfile={() => setShowProfile(true)}
        notificationCount={unreadCount}
        user={user}
        loading={loading}
        onlineUsers={onlineUsers}
      />

      {showNotifications && (
        <NotificationPanel
          onSelectConversation={handleNotificationSelect}
          onClose={() => setShowNotifications(false)}
        />
      )}

      <main className="chat-panel">
        {activeRoom ? (
          <>
            <header className="chat-panel-header">
              <div className="chat-panel-title">
                {activeRoom.type === 'dm' ? (
                  <Avatar
                    name={activeRoom.displayName}
                    color={activeRoom.members?.find((m) => m.id !== user.id)?.avatarColor || '#6366f1'}
                    avatarUrl={activeRoom.avatarUrl || activeRoom.members?.find((m) => m.id !== user.id)?.avatarUrl}
                    size={40}
                    online={onlineUsers.some((u) =>
                      activeRoom.members?.some((m) => m.id === u.id && m.id !== user.id)
                    )}
                  />
                ) : (
                  <Avatar name={activeRoom.displayName || activeRoom.name} color={activeRoom.avatarColor || '#6366f1'} size={40} />
                )}
                <div>
                  <h2>{activeRoom.displayName || activeRoom.name}</h2>
                  <p>
                    {activeRoom.type === 'group'
                      ? `${members.length} members`
                      : lastSeenLabel}
                  </p>
                </div>
              </div>
              <div className="chat-panel-actions">
                <div className={`conn-badge ${connected ? 'on' : 'off'}`}>
                  {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
                  {connected ? 'Live' : 'Offline'}
                </div>
                <button
                  className={`icon-btn ${activeRoom.pinned ? 'active' : ''}`}
                  title={activeRoom.pinned ? 'Unpin' : 'Pin chat'}
                  onClick={() => updatePrefs({ pinned: !activeRoom.pinned })}
                >
                  <Pin size={16} />
                </button>
                <button
                  className={`icon-btn ${activeRoom.muted ? 'active' : ''}`}
                  title={activeRoom.muted ? 'Unmute' : 'Mute chat'}
                  onClick={() => updatePrefs({ muted: !activeRoom.muted })}
                >
                  <VolumeX size={16} />
                </button>
                <button
                  className={`icon-btn ${activeRoom.archived ? 'active' : ''}`}
                  title={activeRoom.archived ? 'Unarchive' : 'Archive chat'}
                  onClick={() => updatePrefs({ archived: !activeRoom.archived })}
                >
                  <Archive size={16} />
                </button>
                {activeRoom.type === 'group' && (
                  <button className="icon-btn" onClick={() => setShowMembers(!showMembers)} title="Members">
                    <Users size={18} />
                  </button>
                )}
              </div>
            </header>

            <div className="messages-area">
              {loadingMessages ? (
                <MessageListSkeleton />
              ) : messages.length === 0 ? (
                <div className="messages-empty">
                  <h3>Start the conversation</h3>
                  <p>Send a message to begin chatting</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const prev = messages[i - 1];
                  const showAvatar = !prev || prev.userId !== msg.userId || shouldShowDateSeparator(messages, i);
                  return (
                    <div key={msg.id}>
                      {shouldShowDateSeparator(messages, i) && <DateSeparator date={msg.createdAt} />}
                      <MessageBubble
                        message={msg}
                        isOwn={msg.userId === user.id}
                        showAvatar={showAvatar}
                        onReply={setReplyTo}
                        onEdit={editMessage}
                        onDelete={handleDelete}
                        onReact={reactMessage}
                        onStar={starMessage}
                      />
                    </div>
                  );
                })
              )}
              <TypingIndicator users={typingInRoom[activeRoom.id]} />
              <div ref={messagesEndRef} />
            </div>

            <MessageInput
              onSend={handleSend}
              onTypingStart={() => startTyping(activeRoom.id)}
              onTypingStop={() => stopTyping(activeRoom.id)}
              disabled={!connected}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
            />
          </>
        ) : (
          <div className="no-room">
            <div className="no-room-body">
              <MessageCircle size={56} strokeWidth={1.5} />
              <h3>Welcome back, {user.displayName}</h3>
              <p>Pick a chat from the sidebar or start a new conversation</p>
            </div>
          </div>
        )}
      </main>

      {showMembers && activeRoom?.type === 'group' && (
        <MembersPanel
          members={members}
          onlineUsers={onlineUsers}
          currentUser={user}
          onStartDm={async (userId) => {
            const room = await api.createDm(userId);
            handleChatCreated(room);
          }}
        />
      )}

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} onChatCreated={handleChatCreated} />}
      {showNewGroup && <CreateGroupModal onClose={() => setShowNewGroup(false)} onCreate={handleCreateGroup} />}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showSearch && (
        <SearchModal
          onClose={() => setShowSearch(false)}
          onSelectResult={(result) => {
            const room = conversations.find((r) => r.id === result.roomId);
            if (room) selectRoom(room);
          }}
        />
      )}
      </div>
    </div>
  );
}
