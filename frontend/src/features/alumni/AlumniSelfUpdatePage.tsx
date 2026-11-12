import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { GraduationCap, Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useLandingTheme } from '../../lib/pageTheme';

const STATUSES = ['Employed', 'Higher Studies', 'Entrepreneur', 'Preparing', 'Other'];
const input = 'w-full px-3.5 py-2.5 rounded-xl neu-inset border border-transparent text-slate-800 text-sm focus:outline-none';

/** Public page (no login) where an alum updates their own details via a private link. */
export const AlumniSelfUpdatePage: React.FC = () => {
  useLandingTheme();
  const { token = '' } = useParams();
  const [a, setA] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { api.getAlumniSelf(token).then(r => setA(r.alumni)).catch(e => setErr(e.message || 'This link is not valid.')); }, [token]);

  const save = async () => {
    setSaving(true); setErr(null);
    try { await api.updateAlumniSelf(token, a); setDone(true); } catch (e: any) { setErr(e.message || 'Could not save'); } finally { setSaving(false); }
  };
  const f = (k: string, label: string, type = 'text') => (
    <label className="block"><span className="text-xs font-bold text-slate-600">{label}</span>
      <input type={type} value={a?.[k] ?? ''} onChange={e => setA({ ...a, [k]: e.target.value })} className={`${input} mt-1`} /></label>
  );

  return (
    <div className="neu-page min-h-screen flex items-center justify-center p-4 text-slate-700">
      <div className="w-full max-w-lg neu-raised rounded-[28px] p-6 sm:p-8 space-y-4">
        <div className="text-center space-y-1">
          <GraduationCap className="w-8 h-8 mx-auto text-brand-primary" />
          <h1 className="text-xl font-black text-slate-800">RGMCET Alumni</h1>
          <p className="text-xs text-slate-500">Keep your details up to date — it helps juniors and the college.</p>
        </div>
        {err && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-semibold">{err}</div>}
        {done ? (
          <div className="text-center space-y-2 py-6"><CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600" /><p className="text-sm font-bold text-slate-800">Thank you! Your details have been updated.</p></div>
        ) : !a ? (!err && <p className="text-center text-xs text-slate-500">Loading…</p>) : (
          <>
            <p className="text-sm text-slate-700 text-center"><b>{a.name}</b><br /><span className="text-xs text-slate-500">{a.department} · Batch {a.batch}</span></p>
            <label className="block"><span className="text-xs font-bold text-slate-600">What are you doing now?</span>
              <select value={a.status || 'Other'} onChange={e => setA({ ...a, status: e.target.value })} className={`${input} mt-1`}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>
            {a.status === 'Higher Studies'
              ? <div className="grid sm:grid-cols-2 gap-3">{f('institute', 'Institute')}{f('course', 'Course')}</div>
              : <div className="grid sm:grid-cols-2 gap-3">{f('organization', 'Organisation')}{f('role_title', 'Role')}</div>}
            <div className="grid sm:grid-cols-2 gap-3">{f('location', 'City')}{f('country', 'Country')}</div>
            <div className="grid sm:grid-cols-2 gap-3">{f('email', 'Email', 'email')}{f('phone', 'Phone', 'tel')}</div>
            {f('linkedin_url', 'LinkedIn profile URL')}
            <button onClick={save} disabled={saving} className="w-full py-3 rounded-xl bg-brand-primary text-white font-black text-sm neu-accent inline-flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save my details</button>
          </>
        )}
      </div>
    </div>
  );
};

export default AlumniSelfUpdatePage;
