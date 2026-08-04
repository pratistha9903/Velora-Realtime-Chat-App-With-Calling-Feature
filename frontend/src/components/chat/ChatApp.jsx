import { useEffect, useRef, useState, useCallback } from 'react';
import {
  LogOut, Wifi, WifiOff, Users, MessageCircle, Pin, VolumeX, Archive, Phone, Video,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useNotifications } from '../../context/NotificationContext';
import { useSocket } from '../../hooks/useSocket';
import { api } from '../../services/api';
import ConversationSidebar from './ConversationSidebar';
import MembersPanel from './MembersPanel';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import CallOverlay from './CallOverlay';
import TypingIndicator from './TypingIndicator';
import DateSeparator, { shouldShowDateSeparator } from './DateSeparator';
import CreateGroupModal from './CreateGroupModal';
import NewChatModal from './NewChatModal';
import SearchModal from './SearchModal';
import NotificationPanel from './NotificationPanel';
import ContactProfileModal from './ContactProfileModal';
import ProfileModal from '../auth/ProfileModal';
import BrandMark from '../ui/BrandMark';
import Avatar from '../ui/Avatar';
import { MessageListSkeleton } from '../ui/Skeleton';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useContactNicknames } from '../../hooks/useContactNicknames';
import { sortConversations } from '../../utils/conversations';

export default function ChatApp() {
  const { user, logout, token } = useAuth();
  const { addToast } = useToast();
  const { addNotification, unreadCount, setOpenHandler } = useNotifications();
  const { labelFor } = useContactNicknames();
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
  const [outgoingCall, setOutgoingCall] = useState(null);
  const [removalNotice, setRemovalNotice] = useState(null);
  const [sidebarView, setSidebarView] = useState('chats');
  const [contactProfile, setContactProfile] = useState(null);
  const [showContactProfile, setShowContactProfile] = useState(false);
  const [callHistoryTick, setCallHistoryTick] = useState(0);

  const {
    connected, onlineUsers, typingInRoom,
    joinRoom, leaveRoom, sendMessage, editMessage, deleteMessage,
    reactMessage, starMessage, markRead, startTyping, stopTyping, on, emit,
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
    if (connected) {
      conversationsRef.current.forEach((room) => joinRoom(room.id));
      if (activeRoomRef.current) joinRoom(activeRoomRef.current);
    }
  }, [connected, joinRoom]);

  const selectRoom = useCallback(async (room) => {
    if (activeRoomRef.current) leaveRoom(activeRoomRef.current);
    setActiveRoom(room);
    setMessages([]);
    setReplyTo(null);
    setRemovalNotice(
      room.iWasRemoved
        ? (room.removalNotice || 'You were removed from this group')
        : null
    );
    setLoadingMessages(true);
    joinRoom(room.id);

    try {
      const [msgs, mems] = await Promise.all([
        api.getMessages(room.id),
        api.getRoomMembers(room.id),
      ]);
      setMessages(msgs);
      setMembers(mems);

      if (msgs.length > 0 && !room.iWasRemoved) {
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

  const conversationsRef = useRef([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const bumpCallHistory = useCallback(() => {
    setCallHistoryTick((t) => t + 1);
  }, []);

  const ensureRoomInList = useCallback(async (roomId, msg) => {
    if (conversationsRef.current.some((r) => r.id === roomId)) return;
    try {
      const room = await api.getRoom(roomId);
      setConversations((prev) => {
        if (prev.some((r) => r.id === room.id)) return prev;
        return [{
          ...room,
          lastMessage: msg?.type === 'image' ? '📷 Photo'
            : msg?.type === 'system' ? msg.content
              : msg?.content,
          lastMessageAt: msg?.createdAt || room.lastMessageAt,
          unreadCount: msg && msg.userId !== user.id ? 1 : 0,
        }, ...prev];
      });
      joinRoom(room.id);
    } catch {
      loadConversations();
    }
  }, [joinRoom, loadConversations, user.id]);

  const applyConversationPreview = useCallback((msg, isOwn, { skipUnread = false } = {}) => {
    setConversations((prev) => {
      const idx = prev.findIndex((r) => r.id === msg.roomId);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        lastMessage: msg.type === 'image' ? '📷 Photo'
          : msg.type === 'system' ? msg.content
            : msg.content,
        lastMessageAt: msg.createdAt,
        unreadCount: skipUnread
          ? 0
          : isOwn ? (updated[idx].unreadCount || 0) : (updated[idx].unreadCount || 0) + 1,
      };
      return sortConversations(updated);
    });
  }, []);

  useEffect(() => {
    setOpenHandler?.((conversationId) => {
      const room = conversationsRef.current.find((r) => r.id === conversationId);
      if (room) selectRoom(room);
    });
  }, [setOpenHandler, selectRoom]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const cleanups = [];

    cleanups.push(on('message:new', (msg) => {
      const isActive = msg.roomId === activeRoomRef.current;
      const isOwn = msg.userId === user.id;
      const isCallMsg = msg.type === 'system'
        && (msg.meta?.kind === 'missed_call' || msg.meta?.kind === 'call_completed');

      if (isCallMsg) bumpCallHistory();

      if (!isActive) {
        if (!conversationsRef.current.some((r) => r.id === msg.roomId)) {
          ensureRoomInList(msg.roomId, msg);
        } else {
          applyConversationPreview(msg, isOwn);
        }

        if (!isOwn && msg.type !== 'system') {
          const room = conversationsRef.current.find((r) => r.id === msg.roomId);
          if (!room?.muted) {
            addNotification({
              type: 'message',
              title: msg.displayName || 'New message',
              body: msg.type === 'image' ? '📷 Photo'
                : msg.type === 'file' ? `📎 ${msg.fileName || 'File'}`
                  : msg.type === 'audio' ? '🎤 Voice note'
                    : (msg.content || 'New message'),
              conversationId: msg.roomId,
              playSound: true,
            });
          }
        }
        return;
      }

      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      applyConversationPreview(msg, isOwn, { skipUnread: true });

      // Tab in background while this chat is open — still notify
      const activeRoomData = conversationsRef.current.find((r) => r.id === msg.roomId);
      if (!isOwn && document.hidden && msg.type !== 'system' && !activeRoomData?.muted) {
        addNotification({
          type: 'message',
          title: msg.displayName || 'New message',
          body: msg.type === 'image' ? '📷 Photo'
            : msg.type === 'file' ? `📎 ${msg.fileName || 'File'}`
              : msg.type === 'audio' ? '🎤 Voice note'
                : (msg.content || 'New message'),
          conversationId: msg.roomId,
          playSound: true,
        });
      }

      if (msg.type !== 'system') {
        markRead(msg.roomId, msg.id);
        api.markRead(msg.roomId, msg.id).catch(() => {});
      }
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
        if (idx === -1) return sortConversations([room, ...prev]);
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...room };
        return sortConversations(updated);
      });
      if (activeRoomRef.current === room.id) {
        setActiveRoom((prev) => ({ ...prev, ...room }));
        if (room.members) setMembers(room.members.filter((m) => !m.removedAt || m.id === user.id));
        if (room.iWasRemoved) {
          setRemovalNotice((n) => n || 'You were removed from this group');
        }
      }
    }));

    cleanups.push(on('room:new', (room) => {
      setConversations((prev) => {
        if (prev.some((r) => r.id === room.id)) {
          return prev.map((r) => (r.id === room.id ? { ...r, ...room } : r));
        }
        return [room, ...prev];
      });
      joinRoom(room.id);
    }));

    cleanups.push(on('calls:updated', () => {
      bumpCallHistory();
    }));

    cleanups.push(on('message:deleted-for-me', ({ id }) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }));

    cleanups.push(on('room:member-removed', ({ roomId, notice, systemMessage, room }) => {
      const merged = room
        ? { ...room, iWasRemoved: true, removalNotice: notice }
        : null;
      if (merged) {
        setConversations((prev) => {
          const idx = prev.findIndex((r) => r.id === roomId);
          if (idx === -1) return [merged, ...prev];
          const next = [...prev];
          next[idx] = { ...next[idx], ...merged };
          return next;
        });
      }
      if (activeRoomRef.current === roomId) {
        if (merged) setActiveRoom((prev) => ({ ...prev, ...merged }));
        setRemovalNotice(notice || 'You were removed from this group');
        if (systemMessage) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === systemMessage.id)) return prev;
            return [...prev, systemMessage];
          });
        }
        addToast(notice || 'You were removed from this group', 'info');
      } else {
        addToast(notice || 'You were removed from a group', 'info');
      }
    }));

    cleanups.push(on('room:removed', ({ roomId }) => {
      setConversations((prev) => prev.filter((r) => r.id !== roomId));
      if (activeRoomRef.current === roomId) {
        setActiveRoom(null);
        setMessages([]);
        addToast('You were removed from a group', 'info');
      }
    }));

    cleanups.push(on('notification:new', (notif) => {
      if (notif.type === 'incoming_call') {
        // CallOverlay handles ringtone; still show banner if user missed call:incoming
        addNotification({ ...notif, playSound: false });
        return;
      }
      addNotification(notif);
    }));

    cleanups.push(on('error', ({ message }) => addToast(message, 'error')));

    return () => cleanups.forEach((fn) => fn?.());
  }, [on, markRead, addToast, addNotification, joinRoom, user.id, bumpCallHistory, ensureRoomInList, applyConversationPreview]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingInRoom, activeRoom]);

  const handleSend = (payload) => {
    if (!activeRoom || activeRoom.iWasRemoved) return;
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
    const roomId = activeRoom.id;
    const previous = activeRoom;

    // Optimistic update — UI changes instantly
    const optimistic = { ...activeRoom, ...prefs };
    setActiveRoom(optimistic);
    setConversations((prev) => sortConversations(
      prev.map((r) => (r.id === roomId ? { ...r, ...prefs } : r))
    ));

    try {
      const room = await api.updateRoomPrefs(roomId, prefs);
      setActiveRoom((current) => (current?.id === roomId ? { ...current, ...room } : current));
      setConversations((prev) => sortConversations(
        prev.map((r) => (r.id === roomId ? { ...r, ...room } : r))
      ));
    } catch (err) {
      setActiveRoom(previous);
      setConversations((prev) => sortConversations(
        prev.map((r) => (r.id === roomId ? { ...r, ...previous } : r))
      ));
      addToast(err.message, 'error');
    }
  };

  const dmPeer = (() => {
    if (!activeRoom || activeRoom.type !== 'dm') return null;
    const fromRoom = activeRoom.members?.find((m) => m.id !== user.id);
    if (fromRoom) return fromRoom;
    return members.find((m) => m.id !== user.id) || null;
  })();

  const startCall = (callType) => {
    if (!dmPeer || !activeRoom) return;
    if (!connected) {
      addToast('Wait until status shows Live, then try again', 'error');
      return;
    }
    setShowContactProfile(false);
    setOutgoingCall({
      peer: {
        id: String(dmPeer.id),
        displayName: dmPeer.displayName || activeRoom.displayName,
        avatarColor: dmPeer.avatarColor,
        avatarUrl: dmPeer.avatarUrl || activeRoom.avatarUrl,
      },
      roomId: activeRoom.id,
      callType,
    });
  };

  const openContactProfile = useCallback(({ peer, room }) => {
    if (!peer) return;
    setContactProfile({ peer, room: room || activeRoom });
    setShowContactProfile(true);
  }, [activeRoom]);

  const handleDeleteChat = useCallback((roomId) => {
    leaveRoom(roomId);
    setConversations((prev) => prev.filter((r) => r.id !== roomId));
    if (activeRoomRef.current === roomId) {
      setActiveRoom(null);
      setMessages([]);
    }
  }, [leaveRoom]);

  const dmTitle = activeRoom?.type === 'dm' && dmPeer
    ? labelFor(dmPeer.id, activeRoom.displayName || dmPeer.displayName)
    : (activeRoom?.displayName || activeRoom?.name);

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

  const handleChatCreated = async (room, initialMessage) => {
    setConversations((prev) => {
      if (prev.some((r) => r.id === room.id)) return prev;
      return [room, ...prev];
    });
    await selectRoom(room);
    const text = initialMessage?.trim();
    if (text) {
      sendMessage(room.id, text);
      addToast('Message sent', 'success');
    }
  };

  const handleNotificationSelect = (conversationId) => {
    const room = conversations.find((r) => r.id === conversationId);
    if (room) selectRoom(room);
  };

  if (loading && conversations.length === 0) {
    return (
      <div className="app-layout">
        <header className="app-top-bar">
          <BrandMark size="md" />
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
        <BrandMark size="md" />
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
        onSelect={(room) => { setSidebarView('chats'); selectRoom(room); }}
        onNewChat={() => setShowNewChat(true)}
        onNewGroup={() => setShowNewGroup(true)}
        onSearch={() => setShowSearch(true)}
        onNotifications={() => setShowNotifications(!showNotifications)}
        onProfile={() => setShowProfile(true)}
        onContactClick={openContactProfile}
        sidebarView={sidebarView}
        onSidebarViewChange={setSidebarView}
        callHistoryTick={callHistoryTick}
        onSocket={on}
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
              <button
                type="button"
                className={`chat-panel-title ${activeRoom.type === 'dm' ? 'clickable' : ''}`}
                onClick={() => {
                  if (activeRoom.type === 'dm' && dmPeer) {
                    openContactProfile({ peer: dmPeer, room: activeRoom });
                  }
                }}
                title={activeRoom.type === 'dm' ? 'View contact' : undefined}
              >
                {activeRoom.type === 'dm' ? (
                  <Avatar
                    name={dmPeer?.displayName || activeRoom.displayName}
                    color={activeRoom.members?.find((m) => m.id !== user.id)?.avatarColor || '#0d9488'}
                    avatarUrl={activeRoom.avatarUrl || activeRoom.members?.find((m) => m.id !== user.id)?.avatarUrl}
                    size={40}
                    online={onlineUsers.some((u) =>
                      activeRoom.members?.some((m) => m.id === u.id && m.id !== user.id)
                    )}
                  />
                ) : (
                  <Avatar name={activeRoom.displayName || activeRoom.name} color={activeRoom.avatarColor || '#0d9488'} size={40} />
                )}
                <div>
                  <h2>{dmTitle}</h2>
                  <p>
                    {activeRoom.iWasRemoved
                      ? 'Removed from group'
                      : activeRoom.type === 'group'
                        ? `${members.length} members`
                        : lastSeenLabel}
                  </p>
                </div>
              </button>
              <div className="chat-panel-actions">
                <div className={`conn-badge ${connected ? 'on' : 'off'}`}>
                  {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
                  {connected ? 'Live' : 'Offline'}
                </div>
                {activeRoom.type === 'dm' && dmPeer && (
                  <>
                    <button
                      type="button"
                      className="icon-btn call-action"
                      title="Voice call"
                      onClick={() => startCall('audio')}
                      disabled={!connected}
                    >
                      <Phone size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn call-action"
                      title="Video call"
                      onClick={() => startCall('video')}
                      disabled={!connected}
                    >
                      <Video size={16} />
                    </button>
                  </>
                )}
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
                {activeRoom.type === 'group' && !activeRoom.iWasRemoved && (
                  <button
                    className={`manage-group-btn ${showMembers ? 'active' : ''}`}
                    onClick={() => setShowMembers(!showMembers)}
                    title="Manage group members"
                  >
                    <Users size={16} />
                    <span>Manage group</span>
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
                        currentUserId={user.id}
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
              disabled={!connected || !!activeRoom.iWasRemoved}
              blocked={!!activeRoom.iWasRemoved}
              blockedMessage={removalNotice || 'You were removed from this group and cannot send messages'}
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

      {showMembers && activeRoom?.type === 'group' && !activeRoom.iWasRemoved && (
        <MembersPanel
          members={members}
          onlineUsers={onlineUsers}
          currentUser={user}
          room={activeRoom}
          onClose={() => setShowMembers(false)}
          onStartDm={async (userId) => {
            const room = await api.createDm(userId);
            handleChatCreated(room);
          }}
          onMembersChanged={async (updated) => {
            if (updated?.deleted) {
              setConversations((prev) => prev.filter((r) => r.id !== activeRoom.id));
              setActiveRoom(null);
              setMessages([]);
              return;
            }
            if (updated?.id) {
              setActiveRoom(updated);
              try {
                const mems = await api.getRoomMembers(updated.id);
                setMembers(mems);
              } catch {
                setMembers((updated.members || []).filter((m) => !m.removedAt));
              }
              setConversations((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
              if (updated.iWasRemoved) {
                setRemovalNotice('You left this group');
                setShowMembers(false);
              }
            }
          }}
        />
      )}

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} onChatCreated={handleChatCreated} />}
      {showNewGroup && <CreateGroupModal onClose={() => setShowNewGroup(false)} onCreate={handleCreateGroup} />}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showContactProfile && contactProfile?.peer && (
        <ContactProfileModal
          peer={contactProfile.peer}
          room={contactProfile.room}
          online={onlineUsers.some((u) => u.id === contactProfile.peer.id)}
          lastSeen={contactProfile.room?.otherLastSeen}
          onClose={() => setShowContactProfile(false)}
          onDeleteChat={handleDeleteChat}
          onStartCall={(type) => startCall(type)}
          callHistoryTick={callHistoryTick}
          onOpenChat={() => {
            if (contactProfile.room) selectRoom(contactProfile.room);
          }}
        />
      )}
      {showSearch && (
        <SearchModal
          onClose={() => setShowSearch(false)}
          onSelectUser={(room) => handleChatCreated(room)}
          onSelectResult={(result) => {
            const room = conversations.find((r) => r.id === result.roomId);
            if (room) selectRoom(room);
          }}
        />
      )}
      </div>

      <CallOverlay
        user={user}
        emit={emit}
        on={on}
        addToast={addToast}
        connected={connected}
        outgoing={outgoingCall}
        onClearOutgoing={() => setOutgoingCall(null)}
      />
    </div>
  );
}
