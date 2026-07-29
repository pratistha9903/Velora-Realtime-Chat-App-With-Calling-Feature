import { APP_NAME } from '../../config/brand';

export function BrandIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="brand-icon-svg">
      <defs>
        <linearGradient id="veloraGrad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0d9488" />
          <stop offset="0.55" stopColor="#14b8a6" />
          <stop offset="1" stopColor="#fde68a" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="9" fill="url(#veloraGrad)" />
      <path
        d="M10 11h12a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-7.2L11 22v-2.5H10a1 1 0 0 1-1-1V12a1 1 0 0 1 1-1Z"
        fill="white"
        fillOpacity="0.96"
      />
      <circle cx="22" cy="10" r="3" fill="#fde68a" fillOpacity="0.95" />
    </svg>
  );
}

export default function BrandMark({ size = 'md', showName = true, className = '' }) {
  const iconSize = size === 'lg' ? 28 : size === 'sm' ? 18 : 22;
  return (
    <div className={`brand-mark ${size} ${className}`.trim()}>
      <BrandIcon size={iconSize} />
      {showName && <span className="brand-name">{APP_NAME}</span>}
    </div>
  );
}
