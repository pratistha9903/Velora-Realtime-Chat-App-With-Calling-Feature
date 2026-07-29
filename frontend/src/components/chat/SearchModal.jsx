import { useState } from 'react';
import { Search, MessageSquare, User } from 'lucide-react';
import Modal from '../ui/Modal';
import Avatar from '../ui/Avatar';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export default function SearchModal({ onClose, onSelectResult, onSelectUser }) {
  const { addToast } = useToast();
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('people'); // people | messages

  const runSearch = async (q) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setPeople([]);
      setMessages([]);
      return;
    }
    setLoading(true);
    try {
      const [users, msgs] = await Promise.all([
        api.searchUsers(q.trim()).catch(() => []),
        api.searchMessages(q.trim()).catch(() => []),
      ]);
      setPeople(users || []);
      setMessages(msgs || []);
    } catch {
      setPeople([]);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const openChatWith = async (userId) => {
    try {
      const room = await api.createDm(userId);
      onSelectUser?.(room);
      onClose();
    } catch (err) {
      addToast(err.message || 'Could not open chat', 'error');
    }
  };

  return (
    <Modal title="Search" onClose={onClose} width={520}>
      <div className="search-input-wrap">
        <Search size={18} />
        <input
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="Search people or messages..."
          autoFocus
        />
      </div>

      <div className="search-tabs">
        <button
          type="button"
          className={`search-tab ${tab === 'people' ? 'active' : ''}`}
          onClick={() => setTab('people')}
        >
          <User size={14} /> People
        </button>
        <button
          type="button"
          className={`search-tab ${tab === 'messages' ? 'active' : ''}`}
          onClick={() => setTab('messages')}
        >
          <MessageSquare size={14} /> Messages
        </button>
      </div>

      <div className="search-results">
        {loading && <p className="search-hint">Searching...</p>}

        {!loading && tab === 'people' && (
          <>
            {query.trim().length >= 2 && people.length === 0 && (
              <p className="search-hint">No people found</p>
            )}
            {query.trim().length < 2 && (
              <p className="search-hint">Type at least 2 characters to search</p>
            )}
            {people.map((u) => (
              <button
                key={u.id}
                type="button"
                className="search-result person"
                onClick={() => openChatWith(u.id)}
              >
                <Avatar name={u.displayName} color={u.avatarColor} size={36} />
                <div>
                  <span className="search-result-room">{u.displayName}</span>
                  <p>@{u.username}</p>
                </div>
              </button>
            ))}
          </>
        )}

        {!loading && tab === 'messages' && (
          <>
            {query.trim().length >= 2 && messages.length === 0 && (
              <p className="search-hint">No messages found</p>
            )}
            {query.trim().length < 2 && (
              <p className="search-hint">Type at least 2 characters to search</p>
            )}
            {messages.map((r) => (
              <button
                key={r.id}
                type="button"
                className="search-result"
                onClick={() => { onSelectResult(r); onClose(); }}
              >
                <span className="search-result-room">
                  {r.roomType === 'dm' ? r.displayName : `# ${r.roomName}`}
                </span>
                <p>{r.content}</p>
                <span className="search-result-meta">{r.displayName}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}
