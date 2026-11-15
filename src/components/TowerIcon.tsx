import { TOWER_DEFS, isSuperTowerType } from '../game/catalog';
import { getTowerThumbnail3D } from '../game/towerThumbnails3d';
import type { TowerType } from '../game/types';

export function TowerIcon({
  type,
  className = 'w-6 h-6',
}: {
  type: TowerType;
  className?: string;
}) {
  const thumb3d = getTowerThumbnail3D(type);
  if (thumb3d) {
    return (
      <img
        src={thumb3d}
        alt=""
        draggable={false}
        aria-hidden="true"
        className={`${className} select-none object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.75)]`}
      />
    );
  }

  if (isSuperTowerType(type)) {
    const def = TOWER_DEFS[type];
    const primary = def.accentColor;
    const secondary = def.secondaryColor ?? '#FBBF24';
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <polygon
          points="7,2 17,2 22,7 22,17 17,22 7,22 2,17 2,7"
          fill="#1B232D"
          stroke={secondary}
          strokeWidth="1.8"
        />
        <polygon
          points="8,5 16,5 19,8 19,16 16,19 8,19 5,16 5,8"
          fill="#26313E"
          stroke={primary}
          strokeWidth="1.4"
        />
        <polygon points="12,6.5 16.5,12 12,17.5 7.5,12" fill={primary} />
        <circle cx="12" cy="12" r="2.2" fill={secondary} />
      </svg>
    );
  }
  if (type === 'cannon') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <polygon
          points="7,3 17,3 21,7 21,17 17,21 7,21 3,17 3,7"
          fill="#242E38"
          stroke="#536270"
          strokeWidth="1.5"
        />
        <rect x="11" y="7" width="10" height="3.2" rx="0.8" fill="#94A3B8" />
        <rect x="11" y="13.8" width="10" height="3.2" rx="0.8" fill="#94A3B8" />
        <circle cx="10.5" cy="12" r="5" fill="#E5A93C" stroke="#141A21" strokeWidth="1.5" />
      </svg>
    );
  }
  if (type === 'cryo') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <polygon
          points="7,3 17,3 21,7 21,17 17,21 7,21 3,17 3,7"
          fill="#242E38"
          stroke="#536270"
          strokeWidth="1.5"
        />
        <rect
          x="9"
          y="7"
          width="11"
          height="10"
          rx="1.5"
          fill="#334155"
          stroke="#38BDF8"
          strokeWidth="1.6"
        />
        <circle cx="10" cy="12" r="4" fill="#38BDF8" />
      </svg>
    );
  }
  if (type === 'tesla') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <polygon
          points="7,3 17,3 21,7 21,17 17,21 7,21 3,17 3,7"
          fill="#242E38"
          stroke="#536270"
          strokeWidth="1.5"
        />
        <circle cx="12" cy="12" r="6" stroke="#A78BFA" strokeWidth="2" />
        <circle cx="12" cy="12" r="3" fill="#C4B5FD" />
        <path d="M13 4L10 11H14L11 20" stroke="#F5F3FF" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === 'pyro') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <polygon
          points="7,3 17,3 21,7 21,17 17,21 7,21 3,17 3,7"
          fill="#242E38"
          stroke="#536270"
          strokeWidth="1.5"
        />
        <path
          d="M12 5C14.5 8 16.5 10.5 16.5 13.5C16.5 16.2 14.5 18.2 12 18.2C9.5 18.2 7.5 16.2 7.5 13.5C7.5 11.4 8.7 9.6 10 8.2C10.2 10 11.2 10.6 12 9.4C12.6 8.5 12.2 6.8 12 5Z"
          fill="#FB7185"
          stroke="#FDA4AF"
          strokeWidth="1.2"
        />
      </svg>
    );
  }
  if (type === 'missile') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <polygon
          points="7,3 17,3 21,7 21,17 17,21 7,21 3,17 3,7"
          fill="#242E38"
          stroke="#536270"
          strokeWidth="1.5"
        />
        <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="#1E293B" stroke="#10B981" strokeWidth="1.5" />
        <circle cx="9.6" cy="9.6" r="1.5" fill="#34D399" />
        <circle cx="14.4" cy="9.6" r="1.5" fill="#34D399" />
        <circle cx="9.6" cy="14.4" r="1.5" fill="#34D399" />
        <circle cx="14.4" cy="14.4" r="1.5" fill="#34D399" />
      </svg>
    );
  }
  if (type === 'laser') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <polygon
          points="7,3 17,3 21,7 21,17 17,21 7,21 3,17 3,7"
          fill="#242E38"
          stroke="#536270"
          strokeWidth="1.5"
        />
        <polygon points="10,6 15,12 10,18 6,12" fill="#EC4899" />
        <line x1="14" y1="12" x2="21.5" y2="12" stroke="#F472B6" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === 'chrono') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <polygon
          points="7,3 17,3 21,7 21,17 17,21 7,21 3,17 3,7"
          fill="#242E38"
          stroke="#536270"
          strokeWidth="1.5"
        />
        <ellipse cx="12" cy="12" rx="6.5" ry="3.2" transform="rotate(-35 12 12)" stroke="#22D3EE" strokeWidth="1.5" />
        <ellipse cx="12" cy="12" rx="6.5" ry="3.2" transform="rotate(35 12 12)" stroke="#A78BFA" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="2.2" fill="#67E8F9" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <polygon
        points="7,3 17,3 21,7 21,17 17,21 7,21 3,17 3,7"
        fill="#242E38"
        stroke="#536270"
        strokeWidth="1.5"
      />
      <rect x="9" y="7.5" width="13" height="2.6" fill="#64748B" />
      <rect x="9" y="13.9" width="13" height="2.6" fill="#64748B" />
      <rect x="7" y="10.4" width="11" height="3.2" fill="#F97316" />
      <circle cx="9" cy="12" r="4" fill="#F97316" stroke="#141A21" strokeWidth="1.4" />
    </svg>
  );
}

export function ShardIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <polygon
        points="12,2 20,9 16,22 8,22 4,9"
        fill="#E5A93C"
        stroke="#FEF3C7"
        strokeWidth="1.4"
      />
      <polygon points="12,2 16,9 12,22 8,9" fill="#F59E0B" opacity="0.65" />
    </svg>
  );
}
