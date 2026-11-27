/**
 * Autosave for long forms: saves shortly after typing stops, keeps a copy on the device until the server has it
 * (restored after a failed save, expired login or closed tab), saves when leaving, and warns before closing the page.
 */
import { useEffect, useRef, useState } from 'react';

export type SaveState = { s: 'idle' | 'saving' | 'saved' | 'error'; at?: string; err?: string };

export function useAutosaveDoc<T>(opts: {
  draftKey: string;                     // localStorage key for the device copy
  canEdit: boolean;
  save: (value: T) => Promise<unknown>; // sends to the server
  delay?: number;
}) {
  const [value, setValue] = useState<T | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ s: 'idle' });
  const [restored, setRestored] = useState(false);
  const ref = useRef<T | null>(null);
  const dirtyRef = useRef(false);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  /** Start from the server's value, or from the device copy when that is newer */
  const init = (server: T, serverSavedAt: string | null, merge: (draft: any) => T) => {
    let draft: { at: number; value: any } | null = null;
    try { draft = JSON.parse(localStorage.getItem(opts.draftKey) || 'null'); } catch { draft = null; }
    const savedAt = serverSavedAt ? Date.parse(serverSavedAt) : 0;
    if (opts.canEdit && draft?.value && draft.at > savedAt) {
      const v = merge(draft.value);
      setValue(v); ref.current = v; setDirty(true); dirtyRef.current = true; setRestored(true);
    } else {
      setValue(server); ref.current = server;
      try { localStorage.removeItem(opts.draftKey); } catch { /* storage unavailable */ }
    }
    if (serverSavedAt) setSaveState({ s: 'saved', at: serverSavedAt });
  };

  const update = (next: T) => {
    setValue(next); ref.current = next; setDirty(true); dirtyRef.current = true;
    try { localStorage.setItem(optsRef.current.draftKey, JSON.stringify({ at: Date.now(), value: next })); } catch { /* storage full or blocked */ }
  };

  /** Save what is on screen now; `force` also saves an untouched first draft. True when the server has it. */
  const saveNow = async (force = false): Promise<boolean> => {
    if (!optsRef.current.canEdit || !ref.current) return false;
    if (inFlight.current) await inFlight.current;
    if (!dirtyRef.current && !force) return true;
    const sent = ref.current;
    setSaveState({ s: 'saving' });
    const job = (async () => {
      try {
        await optsRef.current.save(sent);
        if (ref.current === sent) {
          dirtyRef.current = false; setDirty(false);
          try { localStorage.removeItem(optsRef.current.draftKey); } catch { /* storage unavailable */ }
        }
        setSaveState({ s: 'saved', at: new Date().toISOString() });
        return true;
      } catch (e: any) {
        setSaveState({ s: 'error', err: e?.message || 'Could not reach the server' });
        return false;
      } finally { inFlight.current = null; }
    })();
    inFlight.current = job;
    return job;
  };
  const saveRef = useRef(saveNow);
  saveRef.current = saveNow;

  useEffect(() => {
    if (!dirty || !opts.canEdit) return;
    const t = setTimeout(() => { void saveRef.current(); }, opts.delay ?? 2500);
    return () => clearTimeout(t);
  }, [value, dirty, opts.canEdit, opts.delay]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => () => { if (dirtyRef.current) void saveRef.current(); }, []);

  return { value, init, update, dirty, saveState, saveNow, restored, neverSaved: !saveState.at };
}
