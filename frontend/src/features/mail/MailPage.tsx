/**
 * Email Faculty — HOD (own department), department admin, principal / director (all departments).
 * Write the mail in the portal, choose all faculty or selected faculty, attach documents, Send.
 * Each faculty member gets their own email from the college sender address; replies go to the sender.
 * Route: #/mail
 */
import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight, Mail, Paperclip, Search, Send, X } from 'lucide-react';
import { api } from '../../lib/api';
import { BouncingDots } from '../../components/common/BouncingDots';

const card = 'bg-surface border border-borderLine rounded-2xl shadow-sm';
const input = 'px-3 py-2 text-xs rounded-xl border border-borderLine bg-background font-semibold text-textPrimary focus:outline-none focus:ring-2 focus:ring-brand-primary/30';
const lbl = 'text-[11px] font-bold text-textSecondary uppercase tracking-wider';
const btnPrimary = 'px-3.5 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold disabled:opacity-50 hover:opacity-90';
const btnGhost = 'px-3 py-2 rounded-xl border border-borderLine text-xs font-bold text-textSecondary hover:bg-surface-2 disabled:opacity-50';
const DEPTS = ['CSE', 'CSE (Data Science)', 'CSE (AI & ML)', 'CSE (BS)', 'CSE (CS)', 'ECE', 'EEE', 'Mechanical', 'Civil', 'MCA', 'MBA'];
const MAX = 25 * 1024 * 1024;
const mb = (n: number) => `${(n / 1048576).toFixed(n < 1048576 ? 2 : 1)} MB`;
const when = (v: any) => new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const STATUS: Record<string, [string, string]> = {
  sending: ['Sending…', 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300'],
  sent: ['Sent', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'],
  partial: ['Partly sent', 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'],
  failed: ['Failed', 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'],
};

type Att = { id: string; key?: string; name: string; size: number; uploading: boolean; error?: string };

export default function MailPage() {
  const qc = useQueryClient();
  const [dept, setDept] = useState('All');
  const meta = useQuery({ queryKey: ['mailMeta', dept], queryFn: () => api.getMailMeta(dept) });
  const sent = useQuery({
    queryKey: ['sentMail'], queryFn: api.getSentMail,
    refetchInterval: q => ((q.state.data as any[] | undefined)?.some(m => m.status === 'sending') ? 8000 : false),
  });
  const [mode, setMode] = useState<'all' | 'some'>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [atts, setAtts] = useState<Att[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const faculty = meta.data?.faculty || [];
  const shown = useMemo(() => faculty.filter(f => !q || `${f.name} ${f.email} ${f.department}`.toLowerCase().includes(q.toLowerCase())), [faculty, q]);
  const count = mode === 'all' ? faculty.length : picked.size;
  const total = atts.reduce((n, a) => n + a.size, 0);
  const uploading = atts.some(a => a.uploading);
  const ready = subject.trim() && body.trim() && count > 0 && !uploading && total <= MAX && !atts.some(a => a.error);

  const addFiles = (files: FileList) => {
    Array.from(files).slice(0, 10 - atts.length).forEach(async file => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setAtts(list => [...list, { id, name: file.name, size: file.size, uploading: true }]);
      const done = (patch: Partial<Att>) => setAtts(list => list.map(a => (a.id === id ? { ...a, ...patch } : a)));
      try {
        if (file.size > MAX) throw new Error('Larger than 25 MB');
        const { uploadUrl, fileKey } = await api.getMailUploadUrl(file);
        const r = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
        if (!r.ok) throw new Error('Upload failed');
        done({ key: fileKey, uploading: false });
      } catch (e: any) { done({ uploading: false, error: e.message || 'Upload failed' }); }
    });
  };

  const send = useMutation({
    mutationFn: () => api.sendMail({
      subject: subject.trim(), body: body.trim(), recipients: mode === 'all' ? 'all' : Array.from(picked), department: dept,
      attachments: atts.filter(a => a.key).map(a => ({ key: a.key!, name: a.name })),
    }),
    onSuccess: (r: any) => {
      setMsg({ ok: true, text: `Sending to ${r.recipients} faculty${r.attachments ? ` with ${r.attachments} attachment${r.attachments > 1 ? 's' : ''}` : ''}. Delivery shows below.` });
      setSubject(''); setBody(''); setAtts([]); setPicked(new Set()); setConfirming(false);
      qc.invalidateQueries({ queryKey: ['sentMail'] });
    },
    onError: (e: any) => { setMsg({ ok: false, text: e.message }); setConfirming(false); },
  });

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-black text-textPrimary tracking-tight flex items-center gap-2"><Mail className="w-5 h-5 text-brand-primary" />Email faculty</h1>
        <p className="text-xs text-textSecondary">Write here and press Send. Each faculty member gets the email in their own inbox, with your attachments. Replies come back to you.</p>
      </div>

      {meta.data && !meta.data.configured && (
        <div className="rounded-xl px-4 py-3 text-xs bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><b>Email sending is not switched on yet.</b> The administrator needs to verify the college sender address in Amazon SES once. You can still write your message.</span>
        </div>
      )}
      {msg && <div role="status" className={`rounded-xl px-4 py-2.5 text-xs font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>{msg.text}</div>}

      <div className={`${card} p-4 space-y-4`}>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={lbl}>To</span>
            <div className="flex rounded-xl border border-borderLine overflow-hidden text-xs font-bold" role="radiogroup" aria-label="Recipients">
              <button role="radio" aria-checked={mode === 'all'} onClick={() => setMode('all')} className={`px-3 py-1.5 ${mode === 'all' ? 'bg-brand-primary text-white' : 'text-textSecondary hover:bg-surface-2'}`}>All faculty ({faculty.length})</button>
              <button role="radio" aria-checked={mode === 'some'} onClick={() => setMode('some')} className={`px-3 py-1.5 ${mode === 'some' ? 'bg-brand-primary text-white' : 'text-textSecondary hover:bg-surface-2'}`}>Choose faculty{picked.size ? ` (${picked.size})` : ''}</button>
            </div>
            {meta.data?.scope === 'All' && (
              <select aria-label="Department" className={input} value={dept} onChange={e => { setDept(e.target.value); setPicked(new Set()); }}>
                <option value="All">All departments</option>{DEPTS.map(d => <option key={d}>{d}</option>)}
              </select>
            )}
            {meta.data?.scope && meta.data.scope !== 'All' && <span className="text-[11px] font-bold text-textMuted">Department of {meta.data.scope}</span>}
          </div>
          {meta.isLoading && <BouncingDots size="sm" className="text-brand-primary" label="Loading faculty…" />}
          {mode === 'some' && !meta.isLoading && (
            <div className="rounded-xl border border-borderLine">
              <div className="flex flex-wrap items-center gap-2 p-2 border-b border-borderLine">
                <div className="relative flex-1 min-w-[180px]"><Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-textMuted" />
                  <input aria-label="Search faculty" className={`${input} pl-8 w-full`} placeholder="Search name or email" value={q} onChange={e => setQ(e.target.value)} /></div>
                <button className={btnGhost} onClick={() => setPicked(new Set([...picked, ...shown.map(f => f.email)]))}>Select all shown</button>
                <button className={btnGhost} disabled={!picked.size} onClick={() => setPicked(new Set())}>Clear</button>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-borderLine">
                {shown.map(f => (
                  <label key={f.email} className="flex items-center gap-3 px-3 py-2 text-xs cursor-pointer hover:bg-surface-2/60">
                    <input type="checkbox" checked={picked.has(f.email)} onChange={() => { const s = new Set(picked); if (s.has(f.email)) s.delete(f.email); else s.add(f.email); setPicked(s); }} />
                    <span className="font-bold text-textPrimary">{f.name}</span>
                    <span className="text-textMuted truncate">{f.email}</span>
                    {meta.data?.scope === 'All' && <span className="ml-auto text-[10px] text-textMuted">{f.department}</span>}
                  </label>
                ))}
                {!shown.length && <p className="p-3 text-xs text-textMuted">No faculty match.</p>}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1"><label htmlFor="mail-subject" className={lbl}>Subject</label>
          <input id="mail-subject" className={`${input} w-full`} maxLength={200} value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Submission of lesson plans by 5 December" /></div>
        <div className="space-y-1"><label htmlFor="mail-body" className={lbl}>Message</label>
          <textarea id="mail-body" rows={10} className={`${input} w-full font-normal`} value={body} onChange={e => setBody(e.target.value)}
            placeholder={'Dear Faculty,\n\n…\n\nRegards'} /></div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className={`${btnGhost} cursor-pointer ${atts.length >= 10 ? 'opacity-40 pointer-events-none' : ''}`}><Paperclip className="w-3.5 h-3.5 inline mr-1" />Attach documents
              <input type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv,image/*"
                onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} /></label>
            <span className={`text-[11px] font-bold ${total > MAX ? 'text-rose-600' : 'text-textMuted'}`}>{atts.length ? `${atts.length} file${atts.length > 1 ? 's' : ''} · ${mb(total)} of 25 MB` : 'PDF, Word, Excel, PowerPoint, images or ZIP · up to 25 MB in total'}</span>
          </div>
          {atts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {atts.map(a => (
                <span key={a.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] ${a.error ? 'border-rose-300 text-rose-700' : 'border-borderLine text-textPrimary bg-surface-2'}`}>
                  {a.uploading && <BouncingDots size="xs" className="text-brand-primary" />}
                  <span className="font-bold max-w-[220px] truncate">{a.name}</span><span className="text-textMuted">{mb(a.size)}</span>{a.error && <span>· {a.error}</span>}
                  <button aria-label={`Remove ${a.name}`} onClick={() => setAtts(list => list.filter(x => x.id !== a.id))} className="text-textMuted hover:text-rose-600"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!confirming ? (
            <button className={btnPrimary} disabled={!ready || !meta.data?.configured} onClick={() => { setMsg(null); setConfirming(true); }}>
              <Send className="w-3.5 h-3.5 inline mr-1" />Send to {count} faculty</button>
          ) : (
            <>
              <span className="text-xs font-bold text-textPrimary">Send “{subject.trim()}” to {count} faculty{atts.length ? ` with ${atts.length} attachment${atts.length > 1 ? 's' : ''}` : ''}?</span>
              <button className={btnPrimary} disabled={send.isPending} onClick={() => send.mutate()}>{send.isPending ? <BouncingDots size="xs" /> : 'Yes, send'}</button>
              <button className={btnGhost} disabled={send.isPending} onClick={() => setConfirming(false)}>Cancel</button>
            </>
          )}
          {uploading && <span className="text-[11px] font-bold text-textMuted">Waiting for attachments to upload…</span>}
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-black text-textPrimary">Sent</h2>
        {sent.isLoading ? <BouncingDots size="sm" className="text-brand-primary" label="Loading…" />
          : !sent.data?.length ? <p className="text-xs text-textMuted">Nothing sent yet.</p>
          : (
            <div className={`${card} divide-y divide-borderLine`}>
              {sent.data.map((m: any) => {
                const [label, cls] = STATUS[m.status] || [m.status, ''];
                const ok = (m.recipients || []).filter((r: any) => r.status === 'sent').length;
                const failed = (m.recipients || []).filter((r: any) => r.status === 'failed');
                return (
                  <div key={m.id}>
                    <button className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-3 hover:bg-surface-2/60" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>
                      {open === m.id ? <ChevronDown className="w-3.5 h-3.5 text-textMuted" /> : <ChevronRight className="w-3.5 h-3.5 text-textMuted" />}
                      <div className="flex-1 min-w-[200px]">
                        <p className="text-sm font-bold text-textPrimary">{m.subject}</p>
                        <p className="text-[11px] text-textSecondary">{when(m.created_at)} · {(m.recipients || []).length} faculty{(m.attachments || []).length ? ` · ${(m.attachments || []).length} attachment${m.attachments.length > 1 ? 's' : ''}` : ''}{m.sender_name ? ` · by ${m.sender_name}` : ''}</p>
                      </div>
                      <span className="text-[11px] font-bold text-textMuted tabular-nums">{ok}/{(m.recipients || []).length} delivered</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${cls}`}>{m.status === 'sending' ? <BouncingDots size="xs" label={label} /> : label}</span>
                    </button>
                    {open === m.id && (
                      <div className="px-4 pb-4 space-y-3">
                        <p className="text-xs text-textPrimary whitespace-pre-line rounded-xl bg-surface-2/60 p-3">{m.body}</p>
                        {failed.length > 0 && <p className="text-[11px] font-bold text-rose-600">Not delivered: {failed[0].error}</p>}
                        <div className="overflow-x-auto"><table className="w-full text-xs">
                          <thead><tr className="text-[10px] uppercase text-textMuted"><th className="text-left px-2 py-1">Faculty</th><th className="text-left px-2 py-1">Email</th><th className="text-left px-2 py-1">Delivery</th></tr></thead>
                          <tbody>{(m.recipients || []).map((r: any) => (
                            <tr key={r.email} className="border-t border-borderLine">
                              <td className="px-2 py-1.5 font-bold text-textPrimary">{r.name}</td><td className="px-2 py-1.5 text-textSecondary">{r.email}</td>
                              <td className={`px-2 py-1.5 font-bold ${r.status === 'sent' ? 'text-emerald-600' : r.status === 'failed' ? 'text-rose-600' : 'text-textMuted'}`}>{r.status === 'queued' ? 'Sending…' : r.status === 'sent' ? 'Delivered to mail server' : 'Failed'}</td>
                            </tr>))}</tbody>
                        </table></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
      </section>
    </div>
  );
}
