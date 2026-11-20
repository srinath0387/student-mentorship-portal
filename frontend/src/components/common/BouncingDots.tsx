/**
 * BouncingDots — the app's one loading indicator (three dots that bounce in turn).
 * Dots take the current text colour, so inside a button they match the button text and
 * elsewhere `className="text-brand-primary"` gives the role accent. With reduced motion
 * the dots fade instead of bouncing.
 */
import React from 'react';

type Size = 'xs' | 'sm' | 'md' | 'lg';
const DOT: Record<Size, string> = { xs: 'w-1 h-1', sm: 'w-1.5 h-1.5', md: 'w-2 h-2', lg: 'w-3 h-3' };
const GAP: Record<Size, string> = { xs: 'gap-0.5', sm: 'gap-1', md: 'gap-1.5', lg: 'gap-2' };

export function BouncingDots({ size = 'sm', label, className = '' }: { size?: Size; label?: string; className?: string }) {
  return (
    <span role="status" aria-label={label || 'Loading'} className={`inline-flex items-center gap-2 align-middle ${className}`}>
      <span className={`dots-bounce inline-flex items-end ${GAP[size]}`} aria-hidden="true">
        <span className={`${DOT[size]} rounded-full bg-current`} />
        <span className={`${DOT[size]} rounded-full bg-current`} />
        <span className={`${DOT[size]} rounded-full bg-current`} />
      </span>
      {label && <span className="text-xs font-semibold text-textMuted">{label}</span>}
    </span>
  );
}

/** Centered block for a page or a section that is still loading. */
export function LoadingBlock({ label, className = '', size = 'md' }: { label?: string; className?: string; size?: Size }) {
  return (
    <div className={`flex w-full items-center justify-center py-10 ${className}`}>
      <BouncingDots size={size} label={label} className="text-brand-primary" />
    </div>
  );
}

/** Full-height placeholder while a page's code is downloading. */
export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center">
      <BouncingDots size="lg" className="text-brand-primary" label="Loading…" />
    </div>
  );
}
