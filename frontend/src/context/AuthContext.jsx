import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setUnauthorizedHandler } from '../services/api';

const AuthContext = createContext(null);

const TOKEN_KEY = 'pulsechat_token';
const REFRESH_KEY = 'pulsechat_refresh';
const USER_KEY = 'pulsechat_user';

function clearStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // ignore network errors on logout
    }
    clearStorage();
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
    });
  }, []);

  useEffect(() => {
    async function restoreSession() {
      const savedToken = localStorage.getItem(TOKEN_KEY);
      if (!savedToken) {
        setLoading(false);
        return;
      }

      try {
        const validUser = await api.getMe();
        setToken(savedToken);
        setUser(validUser);
        localStorage.setItem(USER_KEY, JSON.stringify(validUser));
      } catch {
        clearStorage();
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    restoreSession();
  }, []);

  const persist = useCallback((userData, accessToken, refreshToken) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setToken(accessToken);
    setUser(userData);
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.login({ username, password });
    persist(data.user, data.accessToken || data.token, data.refreshToken);
    return data.user;
  }, [persist]);

  const register = useCallback(async (form) => {
    const data = await api.register(form);
    persist(data.user, data.accessToken || data.token, data.refreshToken);
    return data;
  }, [persist]);

  const googleLogin = useCallback(async (payload) => {
    const data = await api.googleLogin(payload);
    persist(data.user, data.accessToken || data.token, data.refreshToken);
    return data.user;
  }, [persist]);

  const updateProfile = useCallback(async (updates) => {
    const updated = await api.updateProfile(updates);
    setUser(updated);
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
    return updated;
  }, []);

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, register, logout, googleLogin, updateProfile, persist,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
