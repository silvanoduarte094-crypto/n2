import { useId } from 'react';
import { cn } from '../lib/utils';

export function Logo({ size = 30, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={cn('logo', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`g1-${id}`} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(var(--accent-hsl) / 0.95)" />
          <stop offset="1" stopColor="hsl(var(--accent-hsl) / 0.35)" />
        </linearGradient>
        <linearGradient id={`g2-${id}`} x1="16" y1="48" x2="48" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.95" />
          <stop offset="1" stopColor="white" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill={`url(#g1-${id})`} />
      <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="17.25" stroke="white" strokeOpacity="0.16" strokeWidth="1.5" />
      <text
        x="32"
        y="43.5"
        textAnchor="middle"
        fill="white"
        fillOpacity="0.94"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="27"
        fontWeight="800"
        letterSpacing="-1.5"
      >
        N2
      </text>
      <circle cx="48" cy="16" r="3" fill="white" fillOpacity="0.75" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('brand', compact && 'brand-compact')}>
      <Logo size={compact ? 26 : 32} />
      {!compact && (
        <div className="brand-text">
          <strong>N2</strong>
          <span>Núcleo de Inteligência</span>
        </div>
      )}
    </div>
  );
}
