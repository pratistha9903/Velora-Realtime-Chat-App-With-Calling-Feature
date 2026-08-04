/** ICE/TURN config for WebRTC — critical for video calls across networks after deployment. */
export function getRtcConfiguration() {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];

  const turnUrl = String(import.meta.env.VITE_TURN_URL || '').trim();
  const turnUser = String(import.meta.env.VITE_TURN_USERNAME || '').trim();
  const turnCred = String(import.meta.env.VITE_TURN_CREDENTIAL || '').trim();

  if (turnUrl && turnUser && turnCred) {
    iceServers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
  }

  // Public TURN relay — required for most cross-network video calls after deploy
  iceServers.push(
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  );

  try {
    const custom = String(import.meta.env.VITE_ICE_SERVERS || '').trim();
    if (custom) {
      const parsed = JSON.parse(custom);
      if (parsed?.iceServers?.length) return parsed;
    }
  } catch {
    /* use defaults */
  }

  return {
    iceServers,
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };
}

/** Wait until ICE gathering finishes so SDP includes candidates (helps when trickle ICE is slow). */
export function waitForIceGathering(pc, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve(pc.localDescription);
      return;
    }
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      resolve(pc.localDescription);
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    pc.addEventListener('icegatheringstatechange', onChange);
    setTimeout(done, timeoutMs);
  });
}

export function getOfferAnswerConstraints(callType) {
  return {
    offerToReceiveAudio: true,
    offerToReceiveVideo: callType === 'video',
    voiceActivityDetection: true,
  };
}
