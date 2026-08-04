import { useState, useEffect } from 'react';
import { Search, Send } from 'lucide-react';
import Modal from '../ui/Modal';
import Avatar from '../ui/Avatar';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export default function NewChatModal({ onClose, onChatCreated }) {
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [directUsername, setDirectUsername] = useState('');
  const [directMessage, setDirectMessage] = useState('');
  const [sendingDirect, setSendingDirect] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async (q = '') => {
    setLoading(true);
    try {
      const data = q.length >= 2
        ? await api.searchUsers(q)
        : await api.getUsers();
      setUsers(data);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (q) => {
    setQuery(q);
    loadUsers(q);
  };

  const startChat = async (userId) => {
    const room = await api.createDm(userId);
    onChatCreated(room);
    onClose();
  };

  const sendDirectMessage = async (e) => {
    e.preventDefault();
    const username = directUsername.trim().replace(/^@/, '');
    const message = directMessage.trim();
    if (!username) {
      addToast('Enter a username', 'error');
      return;
    }
    if (!message) {
      addToast('Enter a message', 'error');
      return;
    }

    setSendingDirect(true);
    try {
      const found = await api.lookupUser(username);
      const room = await api.createDm(found.id);
      onChatCreated(room, message);
      onClose();
    } catch (err) {
      addToast(err.message || 'Could not send message', 'error');
    } finally {
      setSendingDirect(false);
    }
  };

  return (
    <Modal title="New Chat" onClose={onClose}>
      <form className="direct-message-form" onSubmit={sendDirectMessage}>
        <p className="direct-message-label">Message someone directly</p>
        <div className="direct-message-row">
          <input
            value={directUsername}
            onChange={(e) => setDirectUsername(e.target.value)}
            placeholder="@username"
            aria-label="Username"
          />
        </div>
        <div className="direct-message-row">
          <input
            value={directMessage}
            onChange={(e) => setDirectMessage(e.target.value)}
            placeholder="Type your message..."
            aria-label="Message"
          />
          <button type="submit" className="direct-message-send" disabled={sendingDirect} title="Send">
            <Send size={18} />
          </button>
        </div>
        <p className="form-hint">Enter their exact username (e.g. @alice) and send instantly.</p>
      </form>

      <div className="modal-divider"><span>or search people</span></div>

      <div className="search-input-wrap">
        <Search size={18} />
        <input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by name, username, or email..."
          autoFocus
        />
      </div>

      <div className="user-picker-list">
        {loading && <p className="search-hint">Loading...</p>}
        {!loading && users.length === 0 && (
          <p className="search-hint">No users found</p>
        )}
        {users.map((u) => (
          <button key={u.id} type="button" className="user-picker-item" onClick={() => startChat(u.id)}>
            <Avatar name={u.displayName} color={u.avatarColor} size={36} />
            <div>
              <span className="user-picker-name">{u.displayName}</span>
              <span className="user-picker-handle">@{u.username}</span>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
