import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff, X, PhoneMissed, Clock,
} from 'lucide-react';
import Avatar from '../ui/Avatar';
import { APP_NAME } from '../../config/brand';
import { startCallRingtone, stopCallRingtone, playDeclineTone } from '../../utils/audio';
import { getRtcConfiguration, waitForIceGathering, getOfferAnswerConstraints } from '../../utils/webrtc';

function showCallNotification(title, body) {
  try {
    if (!('Notification' in window)) return null;
    if (Notification.permission === 'granted') {
      return new Notification(title, {
        body,
        icon: '/favicon.svg',
        tag: 'pulsechat-call',
        requireInteraction: true,
      });
    }
    if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  } catch { /* ignore */ }
  return null;
}

function formatClock(date = new Date()) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

/**
 * Premium 1:1 WebRTC voice/video call UI + signaling via Socket.io.
 */
export default function CallOverlay({
  user,
  emit,
  on,
  addToast,
  outgoing,
  onClearOutgoing,
  connected,
}) {
  const [incoming, setIncoming] = useState(null);
  const [call, setCall] = useState(null);
  const [result, setResult] = useState(null); // declined / busy / offline / timeout / ended
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [status, setStatus] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const peerIdRef = useRef(null);
  const callActiveRef = useRef(false);
  const roomIdRef = useRef(null);
  const callTypeRef = useRef('audio');
  const answeredRef = useRef(false);
  const notifRef = useRef(null);
  const startingRef = useRef(false);
  const hasIncomingRef = useRef(false);
  const startedAtRef = useRef(null);
  const callSnapshotRef = useRef(null);
  const resultRef = useRef(null);
  const iceQueueRef = useRef([]);

  const bindRemoteMedia = useCallback((stream) => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
      // Muted on video element — audio plays through remoteAudioRef (autoplay-friendly)
      remoteVideoRef.current.play?.().catch(() => {});
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream;
      remoteAudioRef.current.play?.().catch(() => {});
    }
  }, []);

  const syncRemoteTracks = useCallback((pc) => {
    if (!pc) return false;
    let stream = remoteStreamRef.current;
    if (!stream) stream = new MediaStream();

    let changed = false;
    pc.getReceivers().forEach((receiver) => {
      const { track } = receiver;
      if (track && track.readyState === 'live' && !stream.getTracks().some((t) => t.id === track.id)) {
        stream.addTrack(track);
        changed = true;
      }
    });

    if (stream.getTracks().length > 0) {
      remoteStreamRef.current = stream;
      bindRemoteMedia(stream);
      setStatus('connected');
      return true;
    }
    return changed;
  }, [bindRemoteMedia]);

  const attachRemoteTrack = useCallback((ev) => {
    let stream = remoteStreamRef.current;
    if (!stream) {
      stream = ev.streams?.[0] || new MediaStream();
      remoteStreamRef.current = stream;
    }
    if (ev.track && !stream.getTracks().some((t) => t.id === ev.track.id)) {
      stream.addTrack(ev.track);
    }
    bindRemoteMedia(stream);
    setStatus('connected');
  }, [bindRemoteMedia]);

  const flushIceQueue = useCallback(async (pc) => {
    const queued = iceQueueRef.current;
    iceQueueRef.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        /* ignore stale candidates */
      }
    }
  }, []);

  const addIceCandidateSafe = useCallback(async (candidate) => {
    const pc = pcRef.current;
    if (!pc || !candidate) return;
    if (!pc.remoteDescription) {
      iceQueueRef.current.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  const stopRing = useCallback(() => {
    stopCallRingtone();
    if (notifRef.current) {
      try { notifRef.current.close(); } catch { /* */ }
      notifRef.current = null;
    }
  }, []);

  const tearDownMedia = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    iceQueueRef.current = [];
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, []);

  const cleanup = useCallback(() => {
    stopRing();
    tearDownMedia();
    callActiveRef.current = false;
    answeredRef.current = false;
    startingRef.current = false;
    peerIdRef.current = null;
    roomIdRef.current = null;
    hasIncomingRef.current = false;
    startedAtRef.current = null;
    callSnapshotRef.current = null;
    setCall(null);
    setIncoming(null);
    setResult(null);
    setMuted(false);
    setCamOff(false);
    setStatus('');
    setElapsed(0);
    onClearOutgoing?.();
  }, [onClearOutgoing, stopRing, tearDownMedia]);

  const showResultScreen = useCallback((reason, peerOverride = null) => {
    stopRing();
    tearDownMedia();
    callActiveRef.current = false;
    startingRef.current = false;
    hasIncomingRef.current = false;

    const snap = callSnapshotRef.current || call;
    const peer = peerOverride || snap?.peer;
    const callType = snap?.callType || callTypeRef.current || 'audio';
    const startedAt = startedAtRef.current || new Date();
    const durationMs = answeredRef.current && startedAtRef.current
      ? Date.now() - startedAtRef.current
      : 0;

    const titles = {
      declined: 'Call declined',
      busy: 'User is busy',
      offline: 'User is offline',
      timeout: 'No answer',
      ended: 'Call ended',
      failed: 'Call failed',
    };

    const subtitles = {
      declined: `${peer?.displayName || 'They'} declined your ${callType === 'video' ? 'video' : 'voice'} call`,
      busy: `${peer?.displayName || 'User'} is on another call right now`,
      offline: `${peer?.displayName || 'User'} is currently offline`,
      timeout: `${peer?.displayName || 'They'} didn’t pick up`,
      ended: 'The call has ended',
      failed: 'Something went wrong with the connection',
    };

    setIncoming(null);
    setCall(null);
    setStatus('');
    setResult({
      reason,
      title: titles[reason] || 'Call ended',
      subtitle: subtitles[reason] || '',
      peer,
      callType,
      roomId: roomIdRef.current || snap?.roomId || null,
      time: formatClock(startedAt),
      duration: durationMs > 0 ? formatElapsed(durationMs) : null,
      answered: answeredRef.current,
    });
    onClearOutgoing?.();
  }, [call, onClearOutgoing, stopRing, tearDownMedia]);

  const endCall = useCallback((notify = true) => {
    const peerId = peerIdRef.current;
    if (notify && peerId) {
      emit('call:end', {
        toUserId: peerId,
        roomId: roomIdRef.current,
        callType: callTypeRef.current,
      });
    }
    if (answeredRef.current) {
      showResultScreen('ended');
    } else {
      cleanup();
    }
  }, [cleanup, emit, showResultScreen]);

  const createPeerConnection = useCallback((toUserId) => {
    const pc = new RTCPeerConnection(getRtcConfiguration());
    pcRef.current = pc;
    peerIdRef.current = String(toUserId);
    iceQueueRef.current = [];

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        emit('call:ice', { toUserId: String(toUserId), candidate: ev.candidate });
      }
    };

    pc.ontrack = attachRemoteTrack;

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        syncRemoteTracks(pc);
      }
      if (state === 'failed') {
        try {
          pc.restartIce();
        } catch {
          showResultScreen('failed');
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        syncRemoteTracks(pc);
      }
      if (pc.connectionState === 'failed') {
        showResultScreen('failed');
      }
    };

    return pc;
  }, [attachRemoteTrack, emit, showResultScreen, syncRemoteTracks]);

  const getMedia = useCallback(async (callType) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video',
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }, []);

  const startOutgoing = useCallback(async ({ peer, roomId, callType }) => {
    if (callActiveRef.current || startingRef.current) {
      addToast?.('Already in a call', 'error');
      onClearOutgoing?.();
      return;
    }
    if (!connected) {
      addToast?.('Not connected — wait for Live status', 'error');
      onClearOutgoing?.();
      return;
    }
    try {
      startingRef.current = true;
      callActiveRef.current = true;
      answeredRef.current = false;
      roomIdRef.current = roomId;
      callTypeRef.current = callType;
      startedAtRef.current = new Date();
      const callData = { peer, roomId, callType, role: 'caller' };
      callSnapshotRef.current = callData;
      setResult(null);
      setStatus('ringing');
      setCall(callData);
      startCallRingtone();

      const stream = await getMedia(callType);
      const pc = createPeerConnection(peer.id);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setLocalDescription(await pc.createOffer(getOfferAnswerConstraints(callType)));
      await waitForIceGathering(pc);
      emit('call:invite', {
        toUserId: String(peer.id),
        roomId,
        callType,
        offer: pc.localDescription,
        from: {
          id: user.id,
          displayName: user.displayName,
          avatarColor: user.avatarColor,
          avatarUrl: user.avatarUrl,
        },
      });
      startingRef.current = false;
    } catch (err) {
      addToast?.(err.message || 'Could not start call — check mic/camera permission', 'error');
      cleanup();
    }
  }, [addToast, cleanup, connected, createPeerConnection, emit, getMedia, onClearOutgoing, user]);

  useEffect(() => {
    if (outgoing?.peer) {
      startOutgoing(outgoing);
    }
  }, [outgoing, startOutgoing]);

  // Live elapsed timer while connected
  useEffect(() => {
    if (status !== 'connected') return undefined;
    const tick = setInterval(() => {
      if (startedAtRef.current) {
        setElapsed(Date.now() - startedAtRef.current);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [status]);

  const acceptIncoming = useCallback(async () => {
    if (!incoming) return;
    try {
      stopRing();
      callActiveRef.current = true;
      answeredRef.current = true;
      hasIncomingRef.current = false;
      setStatus('connecting');
      const { from, roomId, callType, offer } = incoming;
      roomIdRef.current = roomId;
      callTypeRef.current = callType;
      startedAtRef.current = new Date();
      const callData = { peer: from, roomId, callType, role: 'callee' };
      callSnapshotRef.current = callData;
      setIncoming(null);
      setResult(null);
      setCall(callData);
      const stream = await getMedia(callType);
      const pc = createPeerConnection(from.id);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushIceQueue(pc);
      syncRemoteTracks(pc);
      await pc.setLocalDescription(await pc.createAnswer(getOfferAnswerConstraints(callType)));
      await waitForIceGathering(pc);
      emit('call:answer', { toUserId: String(from.id), answer: pc.localDescription });
      setStatus('connecting');
    } catch (err) {
      addToast?.(err.message || 'Could not answer call', 'error');
      emit('call:reject', { toUserId: String(incoming.from.id) });
      cleanup();
    }
  }, [incoming, getMedia, createPeerConnection, emit, addToast, cleanup, stopRing, flushIceQueue, syncRemoteTracks]);

  const rejectIncoming = useCallback(() => {
    if (!incoming) return;
    stopRing();
    hasIncomingRef.current = false;
    emit('call:reject', { toUserId: String(incoming.from.id), roomId: incoming.roomId });
    setIncoming(null);
  }, [incoming, emit, stopRing]);

  useEffect(() => {
    const offs = [];

    offs.push(on('call:incoming', (payload) => {
      if (!payload?.from?.id || !payload?.offer) return;
      if (callActiveRef.current || hasIncomingRef.current || resultRef.current) {
        emit('call:reject', { toUserId: String(payload.from.id), reason: 'busy' });
        return;
      }
      hasIncomingRef.current = true;
      setResult(null);
      setIncoming(payload);
      startCallRingtone();
      notifRef.current = showCallNotification(
        'Incoming call',
        `${payload.from.displayName} is calling you on ${APP_NAME}`
      );
    }));

    offs.push(on('call:answered', async ({ answer }) => {
      try {
        stopRing();
        answeredRef.current = true;
        startedAtRef.current = new Date();
        if (pcRef.current && answer) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          await flushIceQueue(pcRef.current);
          syncRemoteTracks(pcRef.current);
          setStatus('connecting');
        }
      } catch {
        showResultScreen('failed');
      }
    }));

    offs.push(on('call:rejected', ({ reason } = {}) => {
      const mapped = reason === 'offline' ? 'offline'
        : reason === 'busy' ? 'busy'
          : 'declined';
      playDeclineTone();
      showResultScreen(mapped);
    }));

    offs.push(on('call:ice', async ({ candidate }) => {
      await addIceCandidateSafe(candidate);
    }));

    offs.push(on('call:ended', ({ reason } = {}) => {
      if (reason === 'timeout') {
        playDeclineTone();
        showResultScreen('timeout');
      } else if (answeredRef.current) {
        showResultScreen('ended');
      } else {
        showResultScreen('timeout');
      }
    }));

    return () => offs.forEach((fn) => fn?.());
  }, [on, emit, stopRing, showResultScreen, addIceCandidateSafe, flushIceQueue, syncRemoteTracks]);

  // While connecting, keep trying to attach remote media (handles slow ICE on Render)
  useEffect(() => {
    if (status !== 'connecting' || !pcRef.current) return undefined;
    const interval = setInterval(() => {
      if (pcRef.current) syncRemoteTracks(pcRef.current);
    }, 1500);
    const timeout = setTimeout(() => {
      if (status === 'connecting') {
        addToast?.('Still connecting — check camera permissions on both sides', 'info');
      }
    }, 20000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [status, syncRemoteTracks, addToast]);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.play?.().catch(() => {});
    }
    if (remoteAudioRef.current && remoteStreamRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
    }
  }, [call, status, incoming]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
  };

  const toggleCam = () => {
    const next = !camOff;
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !next; });
    setCamOff(next);
  };

  const callAgain = () => {
    const peer = result?.peer;
    const roomId = result?.roomId;
    const callType = result?.callType || 'audio';
    if (!peer || !roomId) {
      cleanup();
      return;
    }
    cleanup();
    setTimeout(() => {
      startOutgoing({ peer, roomId, callType });
    }, 50);
  };

  if (!call && !incoming && !result) return null;

  // ── Declined / ended / no-answer result card ──
  if (result) {
    const isVideo = result.callType === 'video';
    return (
      <div className="call-overlay result">
        <div className="call-card call-result-card">
          <div className={`call-result-badge ${result.reason}`}>
            <PhoneMissed size={18} />
            <span>{result.title}</span>
          </div>

          <Avatar
            name={result.peer?.displayName || 'User'}
            color={result.peer?.avatarColor}
            avatarUrl={result.peer?.avatarUrl}
            size={88}
          />
          <h2>{result.peer?.displayName || 'User'}</h2>
          <p className="call-status">{result.subtitle}</p>

          <div className="call-details">
            <div className="call-detail-row">
              {isVideo ? <Video size={15} /> : <Phone size={15} />}
              <span>{isVideo ? 'Video call' : 'Voice call'}</span>
            </div>
            <div className="call-detail-row">
              <Clock size={15} />
              <span>{result.time}</span>
            </div>
            {result.duration && (
              <div className="call-detail-row">
                <span className="call-detail-label">Duration</span>
                <span>{result.duration}</span>
              </div>
            )}
            <div className="call-detail-row">
              <span className="call-detail-label">Status</span>
              <span className={`call-detail-status ${result.reason}`}>
                {result.title}
              </span>
            </div>
          </div>

          <div className="call-result-actions">
            <button type="button" className="call-result-btn secondary" onClick={cleanup}>
              Close
            </button>
            {result.peer && result.roomId && (
              <button type="button" className="call-result-btn primary" onClick={callAgain}>
                <Phone size={16} />
                Call again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (incoming && !call) {
    return (
      <div className="call-overlay incoming ringing">
        <div className="call-card">
          <div className="call-ring-pulse" />
          <Avatar
            name={incoming.from.displayName}
            color={incoming.from.avatarColor}
            avatarUrl={incoming.from.avatarUrl}
            size={88}
          />
          <h2>{incoming.from.displayName}</h2>
          <p className="call-status">
            Incoming {incoming.callType === 'video' ? 'video' : 'voice'} call…
          </p>
          <div className="call-details compact">
            <div className="call-detail-row">
              {incoming.callType === 'video' ? <Video size={15} /> : <Phone size={15} />}
              <span>{incoming.callType === 'video' ? 'Video call' : 'Voice call'}</span>
            </div>
            <div className="call-detail-row">
              <Clock size={15} />
              <span>{formatClock()}</span>
            </div>
          </div>
          <div className="call-actions">
            <button type="button" className="call-btn decline" onClick={rejectIncoming} title="Decline">
              <PhoneOff size={22} />
            </button>
            <button type="button" className="call-btn accept" onClick={acceptIncoming} title="Accept">
              <Phone size={22} />
            </button>
          </div>
        </div>
        <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
      </div>
    );
  }

  const isVideo = call?.callType === 'video';

  return (
    <div className={`call-overlay active ${isVideo ? 'video' : 'audio'} ${status === 'ringing' ? 'ringing' : ''}`}>
      <div className="call-stage">
        {isVideo ? (
          <>
            <video ref={remoteVideoRef} className="call-remote" autoPlay playsInline muted />
            <video ref={localVideoRef} className="call-local" autoPlay playsInline muted />
          </>
        ) : (
          <div className="call-audio-hero">
            <div className={`call-avatar-wrap ${status === 'ringing' ? 'pulse' : ''}`}>
              <Avatar
                name={call.peer.displayName}
                color={call.peer.avatarColor}
                avatarUrl={call.peer.avatarUrl}
                size={112}
              />
            </div>
            <div className="call-details floating">
              <div className="call-detail-row">
                <Phone size={14} />
                <span>Voice call</span>
              </div>
              <div className="call-detail-row">
                <Clock size={14} />
                <span>{status === 'connected' ? formatElapsed(elapsed) : formatClock(startedAtRef.current || new Date())}</span>
              </div>
            </div>
          </div>
        )}
        <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

        <div className="call-hud">
          <div className="call-hud-top">
            <span className="call-peer-name">{call.peer.displayName}</span>
            <span className="call-status-pill">
              {status === 'ringing' ? 'Ringing…' : status === 'connecting' ? 'Connecting…' : formatElapsed(elapsed)}
            </span>
            <button type="button" className="icon-btn" onClick={() => endCall(true)} title="Close">
              <X size={18} />
            </button>
          </div>

          <div className="call-actions">
            <button type="button" className={`call-btn ${muted ? 'off' : ''}`} onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
              {muted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            {isVideo && (
              <button type="button" className={`call-btn ${camOff ? 'off' : ''}`} onClick={toggleCam} title={camOff ? 'Camera on' : 'Camera off'}>
                {camOff ? <VideoOff size={20} /> : <Video size={20} />}
              </button>
            )}
            <button type="button" className="call-btn decline" onClick={() => endCall(true)} title="End call">
              <PhoneOff size={22} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
