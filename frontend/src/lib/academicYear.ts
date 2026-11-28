/**
 * The academic year the pages show (June–May, India time). Subject allotments, attendance, lesson plans, execution
 * plans and CO attainment all belong to a year; lists show the year in progress unless another year is picked.
 * The choice lasts for this browser tab only, so a new session always opens on the current year.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'advitiyans_view_ay';

/** "2026–27" for any date from 1 June 2026 to 31 May 2027 */
export function academicYearOf(d = new Date()): string {
  const ist = new Date(d.getTime() + 330 * 60000);
  const y = ist.getUTCFullYear(); const start = ist.getUTCMonth() + 1 >= 6 ? y : y - 1;
  return `${start}–${String(start + 1).slice(-2)}`;
}
export const currentAY = () => academicYearOf();
export const shiftAY = (ay: string, by: number) => { const s = Number(ay.slice(0, 4)) + by; return `${s}–${String(s + 1).slice(-2)}`; };

const listeners = new Set<() => void>();
function read(): string {
  try { const v = sessionStorage.getItem(KEY); if (v && /^\d{4}–\d{2}$/.test(v)) return v; } catch { /* storage unavailable */ }
  return currentAY();
}
/** The year lists should show */
export const viewAY = read;
/** Show another year (null / the current year = back to the year in progress) */
export function setViewAY(ay: string | null) {
  try {
    if (!ay || ay === currentAY()) sessionStorage.removeItem(KEY); else sessionStorage.setItem(KEY, ay);
  } catch { /* storage unavailable */ }
  listeners.forEach(l => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** [year shown, is it the current year] — re-renders when the year changes */
export function useViewAY(): { ay: string; current: string; isCurrent: boolean } {
  const ay = useSyncExternalStore(subscribe, read, read);
  const current = currentAY();
  return { ay, current, isCurrent: ay === current };
}

/** Adds ?ay= to a GET request when another year than the current one is being viewed */
export function withViewAY(endpoint: string): string {
  const ay = read();
  if (ay === currentAY() || /[?&]ay=/.test(endpoint)) return endpoint;
  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}ay=${encodeURIComponent(ay)}`;
}
