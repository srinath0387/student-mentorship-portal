import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock, Loader2, MapPin, Megaphone, QrCode, Search, Settings2, Sparkles, X } from 'lucide-react';
import { api } from '../../lib/api';
import { ClubWorkspace } from './ClubWorkspace';
import {
  CATEGORY_EMOJI, Empty, RoleChip, SeatBar, StatusChip, WindowChip, btnGhost, btnPrimary, card, fmtDate, fmtDateTime, input, money, todayIso,
} from './clubUi';

/** Payment step: QR + UPI ID, then the student enters the transaction ID (UTR). */
function PayModal({ clubId, membership, onClose, onDone }: { clubId: number; membership: any; onClose: () => void; onDone: () => void }) {
  const { data: pay, isLoading } = useQuery({ queryKey: ['clubPayment', clubId], queryFn: () => api.getClubPayment(clubId) });
  const [ref, setRef] = useState(membership?.payment_ref || '');
  const [err, setErr] = useState<string | null>(null);
  const submit = useMutation({
    mutationFn: () => api.submitClubPayment(clubId, ref.trim()),
    onSuccess: onDone,
    onError: (e: any) => setErr(e.message || 'Could not submit'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className={`${card} w-full max-w-sm p-5 space-y-4`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-black text-textPrimary">Pay {pay ? money(pay.fee) : ''} · {pay?.name}</p>
            {membership?.pay_by && <p className="text-[11px] font-bold text-amber-600">Seat held until {fmtDateTime(membership.pay_by)}</p>}
          </div>
          <button onClick={onClose} className="p-1 text-textMuted" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        {isLoading ? <Empty><Loader2 className="w-4 h-4 animate-spin inline" /></Empty> : (
          <div className="text-center space-y-2">
            {pay?.payment_qr
              ? <img src={pay.payment_qr} alt="Payment QR code" className="mx-auto w-56 h-56 object-contain bg-white rounded-xl border border-borderLine p-2" />
              : <div className="mx-auto w-56 h-32 grid place-items-center rounded-xl bg-surface-2 text-xs text-textMuted">No QR — pay to the UPI ID below</div>}
            {pay?.upi_id && <p className="text-xs text-textSecondary">UPI ID: <b className="font-mono text-textPrimary select-all">{pay.upi_id}</b></p>}
          </div>
        )}
        <ol className="text-[11px] text-textSecondary list-decimal pl-4 space-y-0.5">
          <li>Scan with any UPI app (GPay, PhonePe, Paytm…) and pay the exact amount.</li>
          <li>Copy the <b>UTR / transaction ID</b> from the payment receipt.</li>
          <li>Enter it below. The club admin confirms it against the bank statement.</li>
        </ol>
        <input value={ref} onChange={e => setRef(e.target.value.replace(/\s/g, ''))} placeholder="UTR / transaction ID, e.g. 412345678901" className={`${input} w-full font-mono`} />
        {err && <p className="text-xs font-bold text-rose-600">{err}</p>}
        <button className={`${btnPrimary} w-full`} disabled={ref.trim().length < 6 || submit.isPending} onClick={() => submit.mutate()}>
          {submit.isPending ? 'Submitting…' : 'I have paid — submit transaction ID'}
        </button>
      </div>
    </div>
  );
}

function ClubCard({ c, onRegister, busy, onPay, onWithdraw }: { c: any; onRegister: () => void; busy: boolean; onPay: () => void; onWithdraw: () => void }) {
  const [more, setMore] = useState(false);
  const m = c.my_membership && !['withdrawn', 'expired', 'rejected'].includes(c.my_membership.status) ? c.my_membership : null;
  const full = c.seats_taken >= c.max_seats;
  return (
    <div className={`${card} p-4 flex flex-col gap-3`}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-brand-soft grid place-items-center text-xl shrink-0">{CATEGORY_EMOJI[c.category] || '✨'}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-textPrimary">{c.name}</p>
          <p className="text-[11px] text-textSecondary">{c.category} · {money(c.fee)}{c.coordinator_name ? ` · Coordinator: ${c.coordinator_name}` : ''}</p>
        </div>
      </div>
      {c.motive && <p className={`text-xs text-textSecondary whitespace-pre-line ${more ? '' : 'line-clamp-3'}`}>{c.motive}</p>}
      {more && c.activities && <p className="text-[11px] text-textSecondary whitespace-pre-line"><b className="text-textPrimary">Activities:</b> {c.activities}</p>}
      {(c.motive?.length > 160 || c.activities) && <button onClick={() => setMore(!more)} className="text-[11px] font-bold text-brand-primary self-start">{more ? 'Show less' : 'Read more'}</button>}
      <WindowChip club={c} />
      <SeatBar taken={c.seats_taken} max={c.max_seats} waitlisted={c.waitlisted} />
      {(c.allowed_departments?.length || c.allowed_years?.length) ? (
        <p className="text-[10px] text-textMuted">Open to {[c.allowed_departments?.join(', '), c.allowed_years?.join(', ')].filter(Boolean).join(' · ')}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {m ? (
          <>
            <StatusChip status={m.status} /><RoleChip role={m.role} />
            {m.status === 'pending_payment' && <button className={btnPrimary} onClick={onPay}><QrCode className="w-3.5 h-3.5 inline mr-1" />Pay now</button>}
            {m.status === 'payment_submitted' && <button className={btnGhost} onClick={onPay}>Change transaction ID</button>}
            {m.status !== 'approved' && <button className="text-[11px] font-bold text-textMuted hover:text-rose-600 ml-auto" onClick={onWithdraw}>Withdraw</button>}
          </>
        ) : c.window === 'open' ? (
          <button className={btnPrimary} disabled={busy} onClick={onRegister}>
            {busy ? 'Registering…' : full ? 'Join waitlist' : Number(c.fee) > 0 ? `Register · ${money(c.fee)}` : 'Register (free)'}
          </button>
        ) : (
          <span className="text-[11px] font-bold text-textMuted">{c.window === 'upcoming' ? 'Registration not open yet' : 'Registration closed'}</span>
        )}
        {c.my_membership?.status === 'rejected' && <span className="text-[10px] text-rose-600 w-full">Previous registration rejected: {c.my_membership.remarks}</span>}
        {c.my_membership?.status === 'expired' && <span className="text-[10px] text-textMuted w-full">Your earlier seat expired because payment wasn't submitted in time.</span>}
      </div>
    </div>
  );
}

function UpdatesFeed({ updates }: { updates: any[] }) {
  if (!updates.length) return <Empty>No sessions or announcements yet. Your club's lead or coordinator will post them here.</Empty>;
  const today = todayIso();
  return (
    <div className="space-y-2">
      {updates.map(u => {
        const d = u.session_date ? String(u.session_date).slice(0, 10) : null;
        const upcoming = u.kind === 'session' && d && d >= today;
        return (
          <div key={u.id} className={`rounded-xl border p-3 flex gap-3 ${upcoming ? 'border-brand-primary/40 bg-brand-soft/30' : 'border-borderLine'}`}>
            <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${u.kind === 'session' ? 'bg-brand-soft text-brand-primary' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>
              {u.kind === 'session' ? <CalendarDays className="w-4 h-4" /> : <Megaphone className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-black text-textPrimary">{u.title}</p>
                <span className="text-[10px] font-bold text-textMuted">{u.club_name}</span>
                {upcoming && <span className="px-1.5 py-px rounded bg-brand-primary text-white text-[9px] font-black">{d === today ? 'TODAY' : 'UPCOMING'}</span>}
                {u.kind === 'session' && !upcoming && <span className={`text-[10px] font-bold ${u.attended ? 'text-emerald-600' : 'text-textMuted'}`}>{u.attended ? '✓ Attended' : 'Not marked'}</span>}
              </div>
              {u.kind === 'session' ? (
                <p className="text-[11px] text-textSecondary flex flex-wrap gap-x-3">
                  <span><CalendarDays className="w-3 h-3 inline" /> {fmtDate(d)}</span>
                  {u.start_time && <span><Clock className="w-3 h-3 inline" /> {u.start_time}{u.end_time ? `–${u.end_time}` : ''}</span>}
                  {u.venue && <span><MapPin className="w-3 h-3 inline" /> {u.venue}</span>}
                </p>
              ) : <p className="text-[11px] text-textMuted">{fmtDateTime(u.created_at)} · {u.posted_by_name}</p>}
              {u.details && <p className="text-[11px] text-textSecondary mt-1 whitespace-pre-line">{u.details}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ClubsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'mine' | 'browse'>('browse');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [paying, setPaying] = useState<{ clubId: number; membership: any } | null>(null);
  const [leading, setLeading] = useState<any | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { data: clubs = [], isLoading } = useQuery<any[]>({ queryKey: ['clubs', 'student'], queryFn: () => api.getClubs() });
  const { data: mine } = useQuery({ queryKey: ['myClubs'], queryFn: () => api.getMyClubs() });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['clubs'] }); qc.invalidateQueries({ queryKey: ['myClubs'] }); qc.invalidateQueries({ queryKey: ['employabilityScore'] }); };
  const register = useMutation({
    mutationFn: (c: any) => api.registerClub(c.id),
    onSuccess: (r: any, c: any) => {
      refresh();
      if (r.status === 'pending_payment') { setPaying({ clubId: c.id, membership: null }); setMsg({ ok: true, text: `Seat held in ${c.name}. Pay and submit the transaction ID to confirm.` }); }
      else if (r.status === 'waitlisted') setMsg({ ok: true, text: `${c.name} is full — you're on the waitlist and will move up automatically if a seat frees.` });
      else setMsg({ ok: true, text: `You're now a member of ${c.name}! 🎉` });
    },
    onError: (e: any) => setMsg({ ok: false, text: e.message || 'Could not register' }),
  });
  const withdraw = useMutation({ mutationFn: (id: number) => api.withdrawClub(id), onSuccess: refresh, onError: (e: any) => setMsg({ ok: false, text: e.message }) });

  const memberships = mine?.memberships || [];
  const active = memberships.filter((m: any) => !['expired', 'rejected'].includes(m.status));
  const leads = memberships.filter((m: any) => m.status === 'approved' && ['lead', 'co_lead'].includes(m.role));
  const cats = ['All', ...Array.from(new Set(clubs.map(c => c.category)))];
  const shown = clubs.filter(c => (cat === 'All' || c.category === cat) && (!q.trim() || `${c.name} ${c.motive || ''}`.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => (['open', 'upcoming', 'closed'].indexOf(a.window) - ['open', 'upcoming', 'closed'].indexOf(b.window)));
  const upcomingCount = (mine?.updates || []).filter((u: any) => u.kind === 'session' && u.session_date && String(u.session_date).slice(0, 10) >= todayIso()).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-textPrimary">Clubs</h1>
          <p className="text-xs text-textSecondary">Join up to 3 clubs. Membership, attending sessions and leading a club raise your employability score.</p>
        </div>
        <div className="flex rounded-xl border border-borderLine overflow-hidden text-xs font-bold">
          <button onClick={() => setTab('browse')} className={`px-4 py-2 ${tab === 'browse' ? 'bg-brand-primary text-white' : 'text-textSecondary hover:bg-surface-2'}`}>Browse clubs</button>
          <button onClick={() => setTab('mine')} className={`px-4 py-2 ${tab === 'mine' ? 'bg-brand-primary text-white' : 'text-textSecondary hover:bg-surface-2'}`}>
            My clubs{active.length ? ` (${active.length})` : ''}{upcomingCount ? ` · ${upcomingCount} upcoming` : ''}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`rounded-xl px-4 py-2.5 text-xs font-bold flex items-center justify-between ${msg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>
          {msg.text}<button onClick={() => setMsg(null)} aria-label="Dismiss"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {tab === 'browse' ? (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            {cats.map(c => (
              <button key={c} onClick={() => setCat(c)} className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border ${cat === c ? 'bg-brand-primary text-white border-brand-primary' : 'border-borderLine text-textSecondary hover:bg-surface-2'}`}>
                {c !== 'All' && (CATEGORY_EMOJI[c] || '')} {c}
              </button>
            ))}
            <div className="relative ml-auto"><Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search clubs" className={`${input} pl-8 w-56`} /></div>
          </div>
          {isLoading ? <Empty><Loader2 className="w-4 h-4 animate-spin inline" /></Empty> : shown.length === 0 ? (
            <div className={card}><Empty>No clubs are listed yet. Check back soon.</Empty></div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {shown.map(c => (
                <ClubCard key={c.id} c={c} busy={register.isPending && register.variables?.id === c.id}
                  onRegister={() => register.mutate(c)}
                  onPay={() => setPaying({ clubId: c.id, membership: memberships.find((m: any) => m.club_id === c.id) })}
                  onWithdraw={() => window.confirm(`Withdraw from ${c.name}? Your seat goes to the next student.`) && withdraw.mutate(c.id)} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="grid lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 space-y-3">
            {memberships.length === 0 ? (
              <div className={card}><Empty>You haven't joined a club yet. <button className="text-brand-primary font-bold" onClick={() => setTab('browse')}>Browse clubs →</button></Empty></div>
            ) : memberships.map((m: any) => (
              <div key={m.id} className={`${card} p-4 space-y-2`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg">{CATEGORY_EMOJI[m.category] || '✨'}</span>
                  <p className="text-sm font-black text-textPrimary flex-1">{m.name}</p>
                  <RoleChip role={m.role} /><StatusChip status={m.status} />
                </div>
                {m.status === 'approved' && (
                  <p className="text-[11px] text-textSecondary">Sessions attended: <b className="text-textPrimary">{m.sessions_attended}</b> of {m.sessions_held}{m.coordinator_name ? ` · Coordinator: ${m.coordinator_name}` : ''}</p>
                )}
                {m.status === 'pending_payment' && (
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-bold text-amber-600 flex-1">Pay {money(m.fee)} by {fmtDateTime(m.pay_by)} or the seat is released.</p>
                    <button className={btnPrimary} onClick={() => setPaying({ clubId: m.club_id, membership: m })}><QrCode className="w-3.5 h-3.5 inline mr-1" />Pay</button>
                  </div>
                )}
                {m.status === 'payment_submitted' && <p className="text-[11px] text-textSecondary">Transaction <span className="font-mono">{m.payment_ref}</span> is being verified.</p>}
                {m.status === 'waitlisted' && <p className="text-[11px] text-textSecondary">You're #{m.waitlist_position} on the waitlist.</p>}
                {m.status === 'rejected' && m.remarks && <p className="text-[11px] text-rose-600">{m.remarks}</p>}
                {m.status === 'expired' && <p className="text-[11px] text-textMuted">{m.remarks}</p>}
                {m.status === 'approved' && ['lead', 'co_lead'].includes(m.role) && (
                  <button className={btnGhost} onClick={() => setLeading({ id: m.club_id, name: m.name })}><Settings2 className="w-3.5 h-3.5 inline mr-1" />Run this club</button>
                )}
              </div>
            ))}
            {leads.length === 0 && memberships.some((m: any) => m.status === 'approved') && (
              <p className="text-[11px] text-textMuted flex gap-1.5"><Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-500" />Active members can be appointed lead (+40 XP) or co-lead (+25 XP) by the admin.</p>
            )}
          </div>
          <div className={`${card} p-4 lg:col-span-3 space-y-3`}>
            <p className="text-sm font-black text-textPrimary">Updates</p>
            <UpdatesFeed updates={mine?.updates || []} />
          </div>
          {leading && <div className="lg:col-span-5"><ClubWorkspace key={leading.id} club={leading} mode="lead" onClose={() => setLeading(null)} /></div>}
        </div>
      )}

      {paying && <PayModal clubId={paying.clubId} membership={paying.membership} onClose={() => setPaying(null)}
        onDone={() => { setPaying(null); refresh(); setMsg({ ok: true, text: 'Transaction ID submitted. You become a member once the admin verifies it.' }); }} />}
    </div>
  );
}
