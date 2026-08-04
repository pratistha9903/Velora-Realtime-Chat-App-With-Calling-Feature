/** ICE/TURN config for WebRTC — critical for video calls across networks after deployment. */
export function getRtcConfiguration() {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const turnUrl = String(import.meta.env.VITE_TURN_URL || '').trim();
  const turnUser = String(import.meta.env.VITE_TURN_USERNAME || '').trim();
  const turnCred = String(import.meta.env.VITE_TURN_CREDENTIAL || '').trim();

  if (turnUrl && turnUser && turnCred) {
    iceServers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
  } else if (import.meta.env.PROD) {
    // Public relay fallback so deployed calls work across NAT/firewalls
    iceServers.push(
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    );
  }

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
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };
}
