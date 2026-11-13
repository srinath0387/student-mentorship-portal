import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ImagePlus, Pencil, Plus, RotateCcw, Search, Settings2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { ClubWorkspace } from './ClubWorkspace';
import {
  CATEGORY_EMOJI, DEPARTMENTS, Empty, SeatBar, WindowChip, YEARS, btnGhost, btnPrimary, card, input, label, money,
} from './clubUi';

const CATEGORIES = ['Technical', 'Coding', 'Cultural', 'Literary', 'Sports', 'Social Service', 'Entrepreneurship', 'Arts', 'Other'];

/** datetime-local value in the browser's zone */
const toLocalInput = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

/** Shrink the QR image so it stores small but stays scannable */
function readQr(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Not a valid image'));
      img.onload = () => {
        const scale = Math.min(1, 700 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.imageSmoothingEnabled = false; // keep QR modules crisp
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function ClubForm({ club, onDone, onClose }: { club?: any; onDone: () => void; onClose: () => void }) {
  const { data: faculty = [] } = useQuery<any[]>({ queryKey: ['allFacultyForClubs'], queryFn: () => api.getAllFaculty() });
  const now = new Date();
  const [f, setF] = useState<any>(() => ({
    name: club?.name || '', category: club?.category || 'Technical', motive: club?.motive || '', activities: club?.activities || '',
    max_seats: club?.max_seats ?? 100, fee: club?.fee != null ? Number(club.fee) : 0, upi_id: club?.upi_id || '',
    reg_open: toLocalInput(club?.reg_open || now), reg_close: toLocalInput(club?.reg_close || new Date(now.getTime() + 7 * 864e5)),
    allowed_departments: club?.allowed_departments || [], allowed_years: club?.allowed_years || [],
    coordinator_email: club?.coordinator_email || '',
  }));
  const [qr, setQr] = useState<string | null | undefined>(undefined); // undefined = keep existing
  const [hasQr, setHasQr] = useState<boolean>(!!club?.has_qr);
  const [fq, setFq] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const linked = faculty.filter((x: any) => x.email && !String(x.email).startsWith('pending_'));
  const coord = linked.find((x: any) => String(x.email).toLowerCase() === String(f.coordinator_email).toLowerCase());
  const matches = fq.trim() ? linked.filter((x: any) => `${x.name} ${x.email} ${x.department}`.toLowerCase().includes(fq.trim().toLowerCase())).slice(0, 6) : [];
  const toggle = (k: 'allowed_departments' | 'allowed_years', v: string) =>
    setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x: string) => x !== v) : [...f[k], v] });

  const save = useMutation({
    mutationFn: () => {
      const body: any = { ...f, max_seats: Number(f.max_seats), fee: Number(f.fee || 0),
        reg_open: new Date(f.reg_open).toISOString(), reg_close: new Date(f.reg_close).toISOString() };
      if (qr !== undefined) body.payment_qr = qr;
      else if (!club) body.payment_qr = null;
      return club ? api.updateClub(club.id, body) : api.createClub(body);
    },
    onSuccess: onDone,
    onError: (e: any) => setErr(e.message || 'Could not save'),
  });
  const paid = Number(f.fee) > 0;
  const ready = f.name.trim() && Number(f.max_seats) > 0 && f.reg_open && f.reg_close && (!paid || hasQr || f.upi_id.trim());

  return (
    <div className={`${card} p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-textPrimary">{club ? `Edit · ${club.name}` : 'New club'}</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg text-textMuted hover:text-textPrimary" aria-label="Close"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-1 md:col-span-2"><label className={label}>Club name</label>
          <input className={`${input} w-full`} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Google Developer Student Club" /></div>
        <div className="space-y-1"><label className={label}>Category</label>
          <select className={`${input} w-full`} value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c}</option>)}
          </select></div>
        <div className="space-y-1 md:col-span-3"><label className={label}>Motive</label>
          <textarea rows={2} className={`${input} w-full`} value={f.motive} onChange={e => setF({ ...f, motive: e.target.value })} placeholder="Why this club exists — what students gain" /></div>
        <div className="space-y-1 md:col-span-3"><label className={label}>Planned activities (optional)</label>
          <textarea rows={2} className={`${input} w-full`} value={f.activities} onChange={e => setF({ ...f, activities: e.target.value })} placeholder="Weekly workshops, hackathons, industry talks…" /></div>

        <div className="space-y-1"><label className={label}>Seats</label>
          <input type="number" min={1} className={`${input} w-full`} value={f.max_seats} onChange={e => setF({ ...f, max_seats: e.target.value })} />
          <p className="text-[10px] text-textMuted">Extra registrations join a waitlist</p></div>
        <div className="space-y-1"><label className={label}>Registration opens</label>
          <input type="datetime-local" className={`${input} w-full`} value={f.reg_open} onChange={e => setF({ ...f, reg_open: e.target.value })} /></div>
        <div className="space-y-1"><label className={label}>Registration closes</label>
          <input type="datetime-local" className={`${input} w-full`} value={f.reg_close} onChange={e => setF({ ...f, reg_close: e.target.value })} /></div>

        <div className="space-y-1"><label className={label}>Fee (₹, 0 = free)</label>
          <input type="number" min={0} className={`${input} w-full`} value={f.fee} onChange={e => setF({ ...f, fee: e.target.value })} /></div>
        <div className="space-y-1"><label className={label}>UPI ID {paid ? '' : '(optional)'}</label>
          <input className={`${input} w-full`} value={f.upi_id} onChange={e => setF({ ...f, upi_id: e.target.value })} placeholder="club@okaxis" /></div>
        <div className="space-y-1"><label className={label}>Payment QR</label>
          <div className="flex items-center gap-2">
            {qr ? <img src={qr} alt="QR preview" className="w-12 h-12 rounded border border-borderLine object-contain bg-white" />
              : hasQr && qr === undefined ? <span className="text-[11px] font-bold text-emerald-600">QR uploaded ✓</span> : null}
            <label className={`${btnGhost} cursor-pointer`}>
              <ImagePlus className="w-3.5 h-3.5 inline mr-1" />{hasQr || qr ? 'Replace' : 'Upload'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return;
                try { setQr(await readQr(file)); setHasQr(true); setErr(null); } catch (x: any) { setErr(x.message); }
              }} />
            </label>
            {(hasQr || qr) && <button className="text-[11px] font-bold text-rose-600" onClick={() => { setQr(null); setHasQr(false); }}>Remove</button>}
          </div></div>

        <div className="space-y-1.5 md:col-span-3"><label className={label}>Open to departments <span className="normal-case font-semibold text-textMuted">(none selected = all)</span></label>
          <div className="flex flex-wrap gap-1.5">{DEPARTMENTS.map(d => (
            <button key={d} onClick={() => toggle('allowed_departments', d)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${f.allowed_departments.includes(d) ? 'bg-brand-primary text-white border-brand-primary' : 'border-borderLine text-textSecondary'}`}>{d}</button>
          ))}</div></div>
        <div className="space-y-1.5 md:col-span-3"><label className={label}>Open to years <span className="normal-case font-semibold text-textMuted">(none selected = all)</span></label>
          <div className="flex flex-wrap gap-1.5">{YEARS.map(y => (
            <button key={y} onClick={() => toggle('allowed_years', y)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${f.allowed_years.includes(y) ? 'bg-brand-primary text-white border-brand-primary' : 'border-borderLine text-textSecondary'}`}>{y}</button>
          ))}</div></div>

        <div className="space-y-1 md:col-span-3 relative"><label className={label}>Faculty coordinator (optional — can post sessions &amp; mark attendance)</label>
          {coord || f.coordinator_email ? (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-brand-primary/40 bg-brand-soft/40 text-xs max-w-md">
              <span><b className="text-textPrimary">{coord?.name || f.coordinator_email}</b> {coord && <span className="text-textMuted">· {coord.department}</span>}</span>
              <button onClick={() => setF({ ...f, coordinator_email: '' })} className="text-textMuted hover:text-rose-600"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <div className="max-w-md">
              <div className="relative"><Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
                <input value={fq} onChange={e => setFq(e.target.value)} placeholder="Search faculty" className={`${input} w-full pl-8`} /></div>
              {matches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-w-md bg-surface border border-borderLine rounded-xl shadow-lg">
                  {matches.map((m: any) => (
                    <button key={m.email} onClick={() => { setF({ ...f, coordinator_email: m.email }); setFq(''); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-surface-2 border-b border-borderLine last:border-0">
                      <b className="text-textPrimary">{m.name}</b> <span className="text-textMuted">· {m.department}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}</div>
      </div>
      {paid && !hasQr && !f.upi_id.trim() && <p className="text-[11px] font-bold text-amber-600">A paid club needs a payment QR or a UPI ID.</p>}
      {err && <p className="text-xs font-bold text-rose-600">{err}</p>}
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={!ready || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : club ? 'Save changes' : 'Create club'}</button>
        <button className={btnGhost} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

export default function ClubManagePage() {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const { data: clubs = [], isLoading } = useQuery<any[]>({ queryKey: ['clubs', 'manage', showArchived], queryFn: () => api.getClubs(showArchived) });
  const [editing, setEditing] = useState<any | null | 'new'>(null);
  const [working, setWorking] = useState<any | null>(null);
  const status = useMutation({
    mutationFn: ({ id, s }: { id: number; s: 'active' | 'archived' }) => api.setClubStatus(id, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clubs'] }),
  });
  const active = clubs.filter(c => c.status === 'active');
  const kpis = [
    { k: 'Active clubs', v: active.length },
    { k: 'Members', v: active.reduce((n, c) => n + c.members, 0) },
    { k: 'Payments to verify', v: active.reduce((n, c) => n + c.payments_to_verify, 0), warn: true },
    { k: 'Waitlisted', v: active.reduce((n, c) => n + c.waitlisted, 0) },
    { k: 'Registration open', v: active.filter(c => c.window === 'open').length },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-textPrimary">Clubs</h1>
          <p className="text-xs text-textSecondary">Create clubs, set seats and the registration window, verify payments and appoint student leads.</p>
        </div>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Hide archived' : 'Show archived'}</button>
          <button className={btnPrimary} onClick={() => { setEditing('new'); setWorking(null); }}><Plus className="w-3.5 h-3.5 inline mr-1" />New club</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map(x => (
          <div key={x.k} className={`${card} p-3`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-textMuted">{x.k}</p>
            <p className={`text-2xl font-black ${x.warn && x.v ? 'text-sky-600' : 'text-textPrimary'}`}>{x.v}</p>
          </div>
        ))}
      </div>

      {editing && (
        <ClubForm key={editing === 'new' ? 'new' : editing.id} club={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['clubs'] }); }} />
      )}
      {working && <ClubWorkspace key={working.id} club={working} mode="admin" onClose={() => setWorking(null)} />}

      {isLoading ? <Empty>Loading clubs…</Empty> : clubs.length === 0 ? (
        <div className={card}><Empty>No clubs yet. Click “New club” to add the first one.</Empty></div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {clubs.map(c => (
            <div key={c.id} className={`${card} p-4 flex flex-col gap-3 ${c.status === 'archived' ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-soft grid place-items-center text-lg shrink-0">{CATEGORY_EMOJI[c.category] || '✨'}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-textPrimary truncate">{c.name}</p>
                  <p className="text-[11px] text-textSecondary">{c.category} · {money(c.fee)}{c.coordinator_name ? ` · ${c.coordinator_name}` : ''}</p>
                </div>
                {c.payments_to_verify > 0 && <span className="px-2 py-0.5 rounded-full bg-sky-600 text-white text-[10px] font-black" title="Payments to verify">{c.payments_to_verify} to verify</span>}
              </div>
              {c.status === 'archived' ? <span className="text-[10px] font-black text-textMuted">ARCHIVED</span> : <WindowChip club={c} />}
              <SeatBar taken={c.seats_taken} max={c.max_seats} waitlisted={c.waitlisted} />
              <p className="text-[11px] text-textSecondary">
                {c.members} members · {c.sessions_count} sessions · Lead: <b className="text-textPrimary">{c.lead_name || 'not assigned'}</b>
                {(c.allowed_departments?.length || c.allowed_years?.length) ? <><br />Open to {[c.allowed_departments?.join(', '), c.allowed_years?.join(', ')].filter(Boolean).join(' · ')}</> : null}
              </p>
              <div className="flex gap-2 mt-auto">
                <button className={btnPrimary} onClick={() => { setWorking(c); setEditing(null); }}><Settings2 className="w-3.5 h-3.5 inline mr-1" />Manage</button>
                <button className={btnGhost} onClick={() => { setEditing(c); setWorking(null); }}><Pencil className="w-3.5 h-3.5 inline mr-1" />Edit</button>
                {c.status === 'active'
                  ? <button className={btnGhost} title="Archive" onClick={() => window.confirm(`Archive ${c.name}? Students will no longer see it.`) && status.mutate({ id: c.id, s: 'archived' })}><Archive className="w-3.5 h-3.5" /></button>
                  : <button className={btnGhost} title="Restore" onClick={() => status.mutate({ id: c.id, s: 'active' })}><RotateCcw className="w-3.5 h-3.5" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
