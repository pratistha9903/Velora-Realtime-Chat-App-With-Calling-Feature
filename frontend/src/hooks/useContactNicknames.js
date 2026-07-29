import { useCallback, useEffect, useState } from 'react';
import {
  loadNicknames,
  setNickname as saveNickname,
  clearNickname as removeNickname,
  displayNameFor,
  NICKNAME_EVENT,
} from '../utils/contactNicknames';

export function useContactNicknames() {
  const [map, setMap] = useState(loadNicknames);

  useEffect(() => {
    const sync = () => setMap(loadNicknames());
    const onStorage = (e) => {
      if (e.key === 'pulsechat_nicknames') sync();
    };
    window.addEventListener(NICKNAME_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(NICKNAME_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setNickname = useCallback((userId, name) => {
    saveNickname(userId, name);
    setMap(loadNicknames());
  }, []);

  const clearNickname = useCallback((userId) => {
    removeNickname(userId);
    setMap(loadNicknames());
  }, []);

  const labelFor = useCallback(
    (userId, fallback) => displayNameFor(userId, fallback),
    [map]
  );

  return { map, setNickname, clearNickname, labelFor };
}
