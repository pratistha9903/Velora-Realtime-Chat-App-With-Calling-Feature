const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

function getToken() {
  return localStorage.getItem('pulsechat_token');
}

function getRefreshToken() {
  return localStorage.getItem('pulsechat_refresh');
}

function clearSession() {
  localStorage.removeItem('pulsechat_token');
  localStorage.removeItem('pulsechat_refresh');
  localStorage.removeItem('pulsechat_user');
}

let refreshPromise = null;

async function tryRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return false;
        localStorage.setItem('pulsechat_token', data.data.accessToken || data.data.token);
        if (data.data.refreshToken) {
          localStorage.setItem('pulsechat_refresh', data.data.refreshToken);
        }
        if (data.data.user) {
          localStorage.setItem('pulsechat_user', JSON.stringify(data.data.user));
        }
        return true;
      })
      .catch(() => false)
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function request(path, options = {}, retried = false) {
  const token = getToken();
  const headers = { ...options.headers };

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    const isAuthAttempt =
      path.includes('/api/auth/login') ||
      path.includes('/api/auth/register') ||
      path.includes('/api/auth/refresh') ||
      path.includes('/api/auth/google') ||
      path.includes('/api/auth/forgot') ||
      path.includes('/api/auth/reset');

    if (!isAuthAttempt && !retried) {
      const ok = await tryRefresh();
      if (ok) return request(path, options, true);
      clearSession();
      onUnauthorized?.();
    } else if (!isAuthAttempt) {
      clearSession();
      onUnauthorized?.();
    }
    throw new Error(data.error || 'Session expired. Please sign in again.');
  }

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data.data;
}

export function getSocketUrl() {
  return import.meta.env.VITE_SOCKET_URL || API_URL;
}

export function getApiUrl() {
  return API_URL;
}

export const api = {
  getMe: () => request('/api/auth/me'),
  register: (body) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  refresh: (refreshToken) =>
    request('/api/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  googleLogin: (body) =>
    request('/api/auth/google', { method: 'POST', body: JSON.stringify(body) }),
  forgotPassword: (email) =>
    request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyResetToken: (token) =>
    request(`/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`),
  resetPassword: (body) =>
    request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),
  verifyEmail: (token) =>
    request('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
  updateProfile: (body) =>
    request('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(body) }),

  getRooms: () => request('/api/rooms'),
  getRoom: (id) => request(`/api/rooms/${id}`),
  createRoom: (body) => request('/api/rooms/group', { method: 'POST', body: JSON.stringify(body) }),
  createGroup: (body) => request('/api/rooms/group', { method: 'POST', body: JSON.stringify(body) }),
  createDm: (userId) => request(`/api/rooms/dm/${userId}`, { method: 'POST' }),
  updateRoomPrefs: (id, prefs) =>
    request(`/api/rooms/${id}/prefs`, { method: 'PATCH', body: JSON.stringify(prefs) }),
  addRoomMembers: (id, memberIds) =>
    request(`/api/rooms/${id}/members`, { method: 'POST', body: JSON.stringify({ memberIds }) }),
  removeRoomMember: (id, userId) =>
    request(`/api/rooms/${id}/members/${userId}`, { method: 'DELETE' }),
  deleteRoom: (id) => request(`/api/rooms/${id}`, { method: 'DELETE' }),
  getCallHistory: () => request('/api/rooms/calls/history'),
  setRoomMemberRole: (id, userId, role) =>
    request(`/api/rooms/${id}/members/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  getRoomMembers: (id) => request(`/api/rooms/${id}/members`),
  getUsers: () => request('/api/rooms/users'),
  searchUsers: (q) => request(`/api/rooms/users/search?q=${encodeURIComponent(q)}`),

  getMessages: (roomId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/messages/${roomId}${qs ? `?${qs}` : ''}`);
  },
  sendMessage: (roomId, body) =>
    request(`/api/messages/${roomId}`, { method: 'POST', body: JSON.stringify(body) }),
  editMessage: (id, content) =>
    request(`/api/messages/${id}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  deleteMessage: (id, scope = 'everyone') =>
    request(`/api/messages/${id}?scope=${scope}`, { method: 'DELETE' }),
  reactMessage: (id, emoji) =>
    request(`/api/messages/${id}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }),
  starMessage: (id) => request(`/api/messages/${id}/star`, { method: 'POST' }),
  markRead: (roomId, messageId) =>
    request(`/api/messages/${roomId}/read`, { method: 'POST', body: JSON.stringify({ messageId }) }),
  searchMessages: (q) => request(`/api/messages/search?q=${encodeURIComponent(q)}`),

  uploadFile: async (file, fieldName = 'file') => {
    const formData = new FormData();
    formData.append(fieldName, file);
    return request('/api/upload', { method: 'POST', body: formData });
  },
  uploadImage: async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    return request('/api/upload', { method: 'POST', body: formData });
  },
};
