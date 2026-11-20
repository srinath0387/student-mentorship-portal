/**
 * GlobalLoadingDots — a small bouncing-dots pill at the top of the screen whenever data is
 * loading for the first time or something is being saved. Background refreshes (e.g. the
 * 5-second live seat counts) do not show it. Appears only after 300 ms so fast loads don't flicker.
 */
import React, { useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { BouncingDots } from './BouncingDots';

export function GlobalLoadingDots() {
  const loading = useIsFetching({ predicate: q => q.state.data === undefined && q.state.fetchStatus === 'fetching' });
  const saving = useIsMutating();
  const busy = loading + saving > 0;
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!busy) { setShow(false); return; }
    const t = setTimeout(() => setShow(true), 300);
    return () => clearTimeout(t);
  }, [busy]);
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 z-[60] -translate-x-1/2 print:hidden"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 72px)' }}>
      <div className="rounded-full border border-borderLine bg-surface/95 px-3 py-2 shadow-md backdrop-blur">
        <BouncingDots size="sm" className="text-brand-primary" label={saving ? 'Saving…' : 'Loading…'} />
      </div>
    </div>
  );
}
