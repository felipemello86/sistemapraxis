// Ícones próprios (sem emoji, sem lib externa) — copiados 1:1 da v1
// (apps/gateway/src/lib/icons.tsx) pra manter a mesma cara.

type IconProps = { size?: number };

export function IconBed({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="7" rx="1.5" />
      <line x1="3" y1="18" x2="3" y2="20" />
      <line x1="21" y1="18" x2="21" y2="20" />
      <line x1="3" y1="11" x2="3" y2="8" />
      <rect x="5" y="8" width="6" height="3" rx="1" />
      <rect x="13" y="8" width="6" height="3" rx="1" />
    </svg>
  );
}

export function IconWrench({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <line x1="8.2" y1="8.2" x2="15.8" y2="15.8" />
    </svg>
  );
}

export function IconStar({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <polygon points="12,3 14.5,9.5 21,10 16,14.5 17.5,21 12,17.5 6.5,21 8,14.5 3,10 9.5,9.5" />
    </svg>
  );
}

export function IconGear({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
      <line x1="4.9" y1="4.9" x2="7" y2="7" />
      <line x1="17" y1="17" x2="19.1" y2="19.1" />
      <line x1="19.1" y1="4.9" x2="17" y2="7" />
      <line x1="7" y1="17" x2="4.9" y2="19.1" />
    </svg>
  );
}
