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

// Novo — módulo Estoque. Segue o mesmo estilo (stroke, sem preenchimento)
// dos demais ícones desta suíte.
export function IconBox({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8l9-5 9 5-9 5-9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <line x1="12" y1="13" x2="12" y2="21" />
    </svg>
  );
}

// Novo — módulo Restaurante (cloche/campânula de prato).
export function IconCloche({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16a8 8 0 0 1 16 0" />
      <line x1="2" y1="16" x2="22" y2="16" />
      <line x1="12" y1="8" x2="12" y2="6" />
      <circle cx="12" cy="5" r="1" />
      <line x1="5" y1="20" x2="19" y2="20" />
    </svg>
  );
}

// Novo — módulo Central de Inteligência (AI Engine). Estrela de 4 pontas
// ("sparkle") em vez de estrela de 5 (já usada pelo módulo Avaliações) —
// mesmo estilo (stroke, sem preenchimento) dos demais ícones desta suíte.
export function IconSparkle({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
      <path d="M19 15l0.7 2 2 0.7-2 0.7-0.7 2-0.7-2-2-0.7 2-0.7 0.7-2z" />
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
