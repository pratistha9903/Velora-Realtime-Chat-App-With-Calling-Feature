import { getInitials } from '../../utils/avatar';
import { getApiUrl } from '../../services/api';

function resolveAvatar(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${getApiUrl()}${url}`;
}

export default function Avatar({ name, color, size = 36, online, avatarUrl, className = '' }) {
  const src = resolveAvatar(avatarUrl);

  return (
    <div className={`avatar-wrap ${className}`} style={{ width: size, height: size }}>
      <div
        className="avatar"
        style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.35 }}
        title={name}
      >
        {src ? (
          <img src={src} alt={name} className="avatar-img" />
        ) : (
          getInitials(name)
        )}
      </div>
      {online !== undefined && (
        <span className={`avatar-status ${online ? 'online' : 'offline'}`} />
      )}
    </div>
  );
}
