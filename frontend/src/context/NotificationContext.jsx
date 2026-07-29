import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { APP_NAME } from '../config/brand';

const NotificationContext = createContext(null);

function playMessageSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    const beep = (freq, start, dur, gain = 0.12) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now + start);
      g.gain.exponentialRampToValueAtTime(gain, now + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    };

    // Soft two-tone chime (WhatsApp-like)
    beep(880, 0, 0.12, 0.1);
    beep(1174, 0.12, 0.18, 0.09);

    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* autoplay / unsupported */
  }
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [banner, setBanner] = useState(null);
  const bannerTimer = useRef(null);
  const onOpenRef = useRef(null);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'denied';
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  const setOpenHandler = useCallback((fn) => {
    onOpenRef.current = fn;
  }, []);

  const showBanner = useCallback((notification) => {
    clearTimeout(bannerTimer.current);
    setBanner(notification);
    bannerTimer.current = setTimeout(() => setBanner(null), 5000);
  }, []);

  const addNotification = useCallback((notification, { silent = false } = {}) => {
    const item = {
      ...notification,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      read: false,
    };
    setNotifications((prev) => [item, ...prev].slice(0, 50));

    const shouldSound = notification.playSound !== false && !silent;
    if (shouldSound) playMessageSound();

    // In-app popup (always when not silenced)
    if (!silent) showBanner(item);

    // OS notification — when tab hidden, or always for messages/missed calls
    if (permission === 'granted' && !silent) {
      try {
        const n = new Notification(notification.title || APP_NAME, {
          body: notification.body || '',
          icon: '/favicon.svg',
          tag: notification.conversationId || 'pulsechat',
          silent: true, // we play our own sound
        });
        n.onclick = () => {
          window.focus();
          if (notification.conversationId) {
            onOpenRef.current?.(notification.conversationId);
          }
          n.close();
        };
      } catch { /* ignore */ }
    } else if (permission === 'default') {
      requestPermission();
    }
  }, [permission, requestPermission, showBanner]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => setNotifications([]), []);

  const dismissBanner = useCallback(() => {
    clearTimeout(bannerTimer.current);
    setBanner(null);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      addNotification,
      markAllRead,
      clearNotifications,
      requestPermission,
      setOpenHandler,
      banner,
      dismissBanner,
      playMessageSound,
    }}>
      {children}
      {banner && (
        <button
          type="button"
          className="msg-notify-banner"
          onClick={() => {
            if (banner.conversationId) onOpenRef.current?.(banner.conversationId);
            dismissBanner();
          }}
        >
          <div className="msg-notify-banner-inner">
            <strong>{banner.title}</strong>
            <span>{banner.body}</span>
          </div>
          <span
            className="msg-notify-close"
            onClick={(e) => { e.stopPropagation(); dismissBanner(); }}
            role="presentation"
          >
            ×
          </span>
        </button>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
