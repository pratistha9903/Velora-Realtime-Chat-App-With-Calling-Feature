const STORAGE_KEY = 'pulsechat_nicknames';
const EVENT = 'pulsechat-nicknames';

export function loadNicknames() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveNicknames(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getNickname(userId) {
  if (!userId) return '';
  const map = loadNicknames();
  return map[String(userId)]?.trim() || '';
}

export function setNickname(userId, name) {
  if (!userId) return;
  const map = loadNicknames();
  const trimmed = (name || '').trim();
  if (trimmed) map[String(userId)] = trimmed;
  else delete map[String(userId)];
  saveNicknames(map);
}

export function clearNickname(userId) {
  setNickname(userId, '');
}

export function displayNameFor(userId, fallback = 'User') {
  return getNickname(userId) || fallback || 'User';
}

export { EVENT as NICKNAME_EVENT };
