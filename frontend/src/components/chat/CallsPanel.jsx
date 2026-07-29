import { useCallback, useEffect, useState } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video } from 'lucide-react';
import Avatar from '../ui/Avatar';
import { api } from '../../services/api';
import { useContactNicknames } from '../../hooks/useContactNicknames';
import { format, parseISO, isToday, isYesterday } from 'date-fns';

function formatCallTime(dateStr) {
  const d = parseISO(dateStr);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
}

function CallIcon({ call }) {
  if (call.kind === 'missed_call') return <PhoneMissed size={18} className="call-icon missed" />;
  if (call.direction === 'incoming') return <PhoneIncoming size={18} className="call-icon in" />;
  return <PhoneOutgoing size={18} className="call-icon out" />;
}

export default function CallsPanel({ onSelectCall, onlineUsers, callHistoryTick = 0, onSocket }) {
  const { labelFor } = useContactNicknames();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  const onlineIds = new Set(onlineUsers.map((u) => u.id));

  const loadCalls = useCallback(async () => {
    try {
      const data = await api.getCallHistory();
      setCalls(data || []);
    } catch {
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCalls();
  }, [loadCalls, callHistoryTick]);

  useEffect(() => {
    if (!onSocket) return undefined;
    const offUpdated = onSocket('calls:updated', () => loadCalls());
    const offMessage = onSocket('message:new', (msg) => {
      if (msg.type === 'system'
        && (msg.meta?.kind === 'missed_call' || msg.meta?.kind === 'call_completed')) {
        loadCalls();
      }
    });
    return () => {
      offUpdated?.();
      offMessage?.();
    };
  }, [onSocket, loadCalls]);

  return (
    <div className="calls-panel">
      <div className="calls-panel-header">
        <Phone size={18} />
        <h3>Calls</h3>
      </div>

      <div className="calls-list">
        {loading && <p className="search-hint">Loading call history…</p>}
        {!loading && calls.length === 0 && (
          <div className="calls-empty">
            <Phone size={40} strokeWidth={1.5} />
            <p>No calls yet</p>
            <span>Voice and video calls will appear here</span>
          </div>
        )}
        {calls.map((call) => (
          <button
            key={call.id}
            type="button"
            className={`call-history-row ${call.kind}`}
            onClick={() => onSelectCall?.(call)}
          >
            <Avatar
              name={call.peer.displayName}
              color={call.peer.avatarColor}
              avatarUrl={call.peer.avatarUrl}
              size={44}
              online={onlineIds.has(call.peer.id)}
            />
            <div className="call-history-body">
              <div className="call-history-top">
                <span className="call-history-name">
                  {labelFor(call.peer.id, call.peer.displayName)}
                </span>
                <span className="call-history-time">{formatCallTime(call.createdAt)}</span>
              </div>
              <div className="call-history-bottom">
                <CallIcon call={call} />
                <span>{call.label}</span>
                {call.callType === 'video' && <Video size={13} className="call-type-tag" />}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
