import { useEffect, useMemo, useState } from 'react';
import {
  Users, UserPlus, UserMinus, Shield, ShieldOff, Search, Crown, X, Info,
} from 'lucide-react';
import Avatar from '../ui/Avatar';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export default function MembersPanel({
  members,
  onlineUsers,
  currentUser,
  room,
  onStartDm,
  onViewProfile,
  onMembersChanged,
  onClose,
}) {
  const { addToast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [people, setPeople] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);

  const onlineIds = new Set(onlineUsers.map((u) => u.id));
  const isCreator = room?.createdBy === currentUser.id;
  const myMember = members.find((m) => m.id === currentUser.id);
  const isAdmin = isCreator
    || room?.myRole === 'admin'
    || myMember?.role === 'admin';
  const removed = !!room?.iWasRemoved;

  const memberIds = useMemo(() => new Set(members.map((m) => String(m.id))), [members]);

  useEffect(() => {
    if (!showAdd || removed) return undefined;
    let cancelled = false;
    (async () => {
      setLoadingPeople(true);
      try {
        const users = query.trim().length >= 2
          ? await api.searchUsers(query.trim())
          : await api.getUsers();
        if (cancelled) return;
        setPeople((users || []).filter((u) => !memberIds.has(String(u.id))));
      } catch (err) {
        if (!cancelled) {
          setPeople([]);
          addToast(err.message || 'Could not load users', 'error');
        }
      } finally {
        if (!cancelled) setLoadingPeople(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showAdd, query, memberIds, removed, addToast]);

  const sortedMembers = useMemo(() => (
    [...members].sort((a, b) => {
      const aAdmin = a.role === 'admin' || a.id === room?.createdBy;
      const bAdmin = b.role === 'admin' || b.id === room?.createdBy;
      if (aAdmin && !bAdmin) return -1;
      if (bAdmin && !aAdmin) return 1;
      return (a.displayName || '').localeCompare(b.displayName || '');
    })
  ), [members, room?.createdBy]);

  const toggleSelect = (id) => {
    const sid = String(id);
    setSelected((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]));
  };

  const addMembers = async () => {
    if (!selected.length || !room?.id) return;
    setBusy(true);
    try {
      const updated = await api.addRoomMembers(room.id, selected);
      let mems = updated?.members || [];
      try {
        mems = await api.getRoomMembers(room.id);
      } catch { /* use updated.members */ }
      onMembersChanged?.({ ...updated, members: mems });
      addToast(selected.length === 1 ? 'Member added' : 'Members added', 'success');
      setSelected([]);
      setShowAdd(false);
      setQuery('');
    } catch (err) {
      addToast(err.message || 'Could not add members', 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (userId, name) => {
    if (!room?.id) return;
    const self = userId === currentUser.id;
    if (!window.confirm(self ? 'Leave this group?' : `Remove ${name} from the group?`)) return;
    setBusy(true);
    try {
      const updated = await api.removeRoomMember(room.id, userId);
      onMembersChanged?.(updated);
      addToast(self ? 'You left the group' : `${name} removed`, 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (userId, role, name) => {
    if (!room?.id) return;
    setBusy(true);
    try {
      const updated = await api.setRoomMemberRole(room.id, userId, role);
      onMembersChanged?.(updated);
      addToast(role === 'admin' ? `${name} is now an admin` : `${name} is now a member`, 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="members-panel pro">
      <div className="panel-header">
        <Users size={16} />
        <div className="panel-title-wrap">
          <h3>Group members</h3>
          <span className="panel-subtitle">{room?.displayName || room?.name}</span>
        </div>
        <span className="panel-count">{members.length}</span>
        {onClose && (
          <button type="button" className="icon-btn sm" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        )}
      </div>

      {!removed && (
        <div className="members-admin-bar">
          <button
            type="button"
            className="admin-action-btn primary"
            onClick={() => setShowAdd((v) => !v)}
          >
            <UserPlus size={16} />
            {showAdd ? 'Close add panel' : 'Add people'}
          </button>
        </div>
      )}

      {showAdd && !removed && (
        <div className="add-members-box">
          <div className="search-input-wrap compact">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name..."
              autoFocus
            />
          </div>
          <div className="add-members-list">
            {loadingPeople && <p className="search-hint">Loading…</p>}
            {!loadingPeople && people.length === 0 && (
              <p className="search-hint">
                {query.trim().length >= 2 ? 'No matching users' : 'No users available to add'}
              </p>
            )}
            {people.map((u) => (
              <label key={u.id} className={`add-member-row ${selected.includes(String(u.id)) ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected.includes(String(u.id))}
                  onChange={() => toggleSelect(u.id)}
                />
                <Avatar name={u.displayName} color={u.avatarColor} avatarUrl={u.avatarUrl} size={28} />
                <span>{u.displayName}</span>
                <span className="add-member-handle">@{u.username}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="admin-action-btn primary full"
            disabled={!selected.length || busy}
            onClick={addMembers}
          >
            <UserPlus size={16} />
            {busy ? 'Adding…' : `Add ${selected.length || 0} member${selected.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}

      <div className="panel-section grow">
        <h4>People in this group</h4>
        <ul className="member-list">
          {sortedMembers.map((m) => {
            const isMe = m.id === currentUser.id;
            const memberIsCreator = room?.createdBy === m.id;
            const memberIsAdmin = m.role === 'admin' || memberIsCreator;
            const canRemove = isAdmin && !isMe && !removed;
            const canPromote = isAdmin && !isMe && !memberIsAdmin && !removed;
            const canDemote = isAdmin && !isMe && memberIsAdmin && !memberIsCreator && !removed;

            return (
              <li key={m.id} className="member-card">
                <button
                  type="button"
                  className="member-main"
                  onClick={() => !isMe && onStartDm?.(m.id)}
                  title={!isMe ? `Message ${m.displayName}` : undefined}
                >
                  <Avatar
                    name={m.displayName}
                    color={m.avatarColor}
                    avatarUrl={m.avatarUrl}
                    size={40}
                    online={onlineIds.has(m.id)}
                  />
                  <div className="member-meta">
                    <span className="member-name">
                      {m.displayName}
                      {isMe && <span className="you-tag">you</span>}
                    </span>
                    <span className="member-role-line">
                      {memberIsAdmin ? <><Crown size={12} /> Admin</> : 'Member'}
                      {' · '}
                      {onlineIds.has(m.id) ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </button>

                <div className="member-action-row">
                  {!isMe && onViewProfile && (
                    <button
                      type="button"
                      className="admin-chip"
                      onClick={() => onViewProfile(m)}
                    >
                      <Info size={14} /> Profile
                    </button>
                  )}
                  {canPromote && (
                    <button
                      type="button"
                      className="admin-chip"
                      disabled={busy}
                      onClick={() => changeRole(m.id, 'admin', m.displayName)}
                    >
                      <Shield size={14} /> Make admin
                    </button>
                  )}
                  {canDemote && (
                    <button
                      type="button"
                      className="admin-chip"
                      disabled={busy}
                      onClick={() => changeRole(m.id, 'member', m.displayName)}
                    >
                      <ShieldOff size={14} /> Remove admin
                    </button>
                  )}
                  {canRemove && (
                    <button
                      type="button"
                      className="admin-chip danger"
                      disabled={busy}
                      onClick={() => removeMember(m.id, m.displayName)}
                    >
                      <UserMinus size={14} /> Remove
                    </button>
                  )}
                  {isMe && !removed && (
                    <button
                      type="button"
                      className="admin-chip danger"
                      disabled={busy}
                      onClick={() => removeMember(m.id, m.displayName)}
                    >
                      <UserMinus size={14} /> Leave
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
