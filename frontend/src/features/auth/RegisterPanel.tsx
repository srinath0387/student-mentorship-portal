import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, User, UserPlus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { cognitoSignIn, cognitoSignUp, isCognitoConfigError } from '../../lib/cognitoAuth';
import {
  studentSignUpSchema, facultySignUpSchema, REGISTRATION_NUMBER_REGEX, VALID_DEPARTMENT_NAMES,
  getDeptFromRollNumber, isLateralEntry,
} from '../../lib/validation/auth';

const field = 'w-full pl-10 pr-4 py-2.5 rounded-xl neu-inset border border-transparent text-slate-800 placeholder-slate-400 text-xs sm:text-sm font-medium focus:outline-none';
const label = 'block text-xs font-bold text-slate-700 mb-1.5';
const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'] as const;

/**
 * Work out department, current year and batch from a registration number such as 23091A3251:
 *  - 23 = admission year (2023), 5th char '5' = lateral entry (joined in 2nd year)
 *  - 32 = department code; 1E00 / 1F00 = MBA / MCA (2-year programmes)
 */
export function deriveFromRegNo(reg: string, today = new Date()) {
  const r = reg.trim().toUpperCase();
  if (!REGISTRATION_NUMBER_REGEX.test(r)) return null;
  const dept = getDeptFromRollNumber(r);
  const pg = dept === 'MBA' || dept === 'MCA';
  const admitted = 2000 + Number(r.slice(0, 2));
  const lateral = isLateralEntry(r);
  const batchStart = lateral ? admitted - 1 : admitted;
  const duration = pg ? 2 : 4;
  const acadStart = today.getMonth() + 1 >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  const yearNum = Math.min(duration, Math.max(1, acadStart - batchStart + 1));
  return {
    department: dept === 'Unknown' ? '' : dept,
    year: YEARS[yearNum - 1],
    batch: `${batchStart}-${batchStart + duration}`,
    lateral,
    email: `${r.toLowerCase()}@rgmcet.edu.in`,
    graduated: acadStart - batchStart + 1 > duration,
  };
}

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={`${field} pr-10`} />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

/** New student / faculty registration, rendered on the back of the landing ID card. */
export const RegisterPanel: React.FC<{ kind: 'student' | 'faculty'; onBack: () => void }> = ({ kind, onBack }) => {
  const navigate = useNavigate();
  const { login, registerSession } = useAuth();
  const [f, setF] = useState({ fullName: '', reg: '', department: '', year: '' as string, email: '', securityKey: '', password: '', confirm: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const derived = useMemo(() => (kind === 'student' ? deriveFromRegNo(f.reg) : null), [kind, f.reg]);
  const dept = f.department || derived?.department || '';
  const year = f.year || derived?.year || '';
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));

  const submitStudent = async () => {
    const parsed = studentSignUpSchema.safeParse({
      fullName: f.fullName.trim(), registrationNumber: f.reg.trim(), year, department: dept,
      email: derived?.email || '', password: f.password, confirmPassword: f.confirm,
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Please check the form');
    const data = parsed.data;
    const regNo = data.registrationNumber.toUpperCase();
    let jwt: string | undefined;
    try {
      await cognitoSignUp({ email: data.email, password: data.password, regNo, year: data.year, role: 'student' });
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('User already exists') || msg.includes('UsernameExistsException')) {
        try { jwt = (await cognitoSignIn(data.email, data.password)).idToken; }
        catch { throw new Error('This registration number already has an account. Use “Forgot password” on the login card, or contact the administrator.'); }
      } else if (!isCognitoConfigError(e)) throw e;
    }
    if (!jwt) { try { jwt = (await cognitoSignIn(data.email, data.password)).idToken; } catch { /* session still created below */ } }
    await api.createStudent({
      roll_number: regNo, name: data.fullName, email: data.email, year: data.year,
      department: data.department, batch: derived?.batch,
    }).catch(() => { /* record may already exist */ });
    login(data.email, 'student', regNo, data.fullName, jwt, data.department);
    registerSession(data.email, 'student');
    navigate('/dashboard');
  };

  const submitFaculty = async () => {
    const parsed = facultySignUpSchema.safeParse({
      fullName: f.fullName.trim(), department: f.department, securityKey: f.securityKey.trim(),
      email: f.email.trim(), password: f.password, confirmPassword: f.confirm,
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Please check the form');
    const data = parsed.data;
    const key = await api.validateFacultyKey(data.securityKey);
    if (!key.valid) throw new Error(key.error || 'Invalid faculty passcode.');
    const facId = `FAC_${data.email.split('@')[0].toUpperCase()}`;
    await api.createFaculty({ faculty_id: facId, name: data.fullName, email: data.email, department: data.department, role: 'mentor' })
      .catch(() => { /* record may already exist */ });
    await cognitoSignUp({ email: data.email, password: data.password, regNo: facId, year: 'Faculty', role: 'faculty' });
    const auth = await cognitoSignIn(data.email, data.password);
    login(data.email, 'faculty', facId, data.fullName, auth.idToken, data.department);
    registerSession(data.email, 'faculty');
    navigate('/faculty/dashboard');
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { kind === 'student' ? await submitStudent() : await submitFaculty(); }
    catch (e: any) { setErr(e?.message || 'Registration failed. Please try again.'); }
    finally { setBusy(false); }
  };

  const regTyped = f.reg.trim().length >= 10;

  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      <div className="flex items-center gap-2 text-sm font-black text-slate-800"><UserPlus className="w-4 h-4 text-brand-primary" />{kind === 'student' ? 'Create student account' : 'Register as new faculty'}</div>

      {kind === 'student' && (
        <div>
          <label className={label}>Registration number</label>
          <div className="relative">
            <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={f.reg} onChange={e => setF(p => ({ ...p, reg: e.target.value.toUpperCase().slice(0, 10), department: '', year: '' }))}
              placeholder="e.g. 23091A3251" className={`${field} uppercase tracking-wider font-bold`} autoFocus />
          </div>
          {regTyped && !derived && <p className="text-[11px] text-red-600 font-semibold mt-1">Not a valid RGMCET registration number.</p>}
          {derived && (
            <div className="mt-2 p-2.5 rounded-xl bg-brand-soft/60 border border-brand-primary/20 text-[11px] text-slate-700 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand-primary shrink-0 mt-px" />
              <div className="min-w-0">
                <b>{derived.department || 'Department not recognised'}</b> · {derived.year} · Batch {derived.batch}{derived.lateral ? ' · Lateral entry' : ''}
                <span className="block text-slate-500 truncate">College email: {derived.email}</span>
                {derived.graduated && <span className="block text-amber-700 font-semibold">This batch has completed the programme — check the number.</span>}
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className={label}>Full name</label>
        <div className="relative">
          <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={f.fullName} onChange={e => set('fullName', e.target.value)} placeholder={kind === 'student' ? 'As in college records' : 'e.g. Dr. K. Ramesh'} className={field} />
        </div>
      </div>

      {kind === 'student' && derived && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>Department</label>
            <select value={dept} onChange={e => set('department', e.target.value)} className="w-full px-3 py-2.5 rounded-xl neu-inset text-xs font-semibold text-slate-800 focus:outline-none">
              <option value="">Select</option>
              {VALID_DEPARTMENT_NAMES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Year</label>
            <select value={year} onChange={e => set('year', e.target.value)} className="w-full px-3 py-2.5 rounded-xl neu-inset text-xs font-semibold text-slate-800 focus:outline-none">
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      )}

      {kind === 'faculty' && (
        <>
          <div>
            <label className={label}>College email</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="yourname@rgmcet.edu.in" className={field} />
            </div>
          </div>
          <div>
            <label className={label}>Department</label>
            <div className="flex flex-wrap gap-1.5">
              {VALID_DEPARTMENT_NAMES.map(d => (
                <button key={d} type="button" onClick={() => set('department', d)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${f.department === d ? 'bg-brand-primary text-white' : 'neu-raised-sm text-slate-600 hover:text-brand-primary'}`}>{d}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={label}>Faculty passcode <span className="font-normal text-slate-500">(from your HOD / admin)</span></label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="password" value={f.securityKey} onChange={e => set('securityKey', e.target.value)} placeholder="Passcode" className={field} />
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div><label className={label}>Password</label><PasswordInput value={f.password} onChange={v => set('password', v)} placeholder="Min 8, letter + number" /></div>
        <div><label className={label}>Confirm password</label><PasswordInput value={f.confirm} onChange={v => set('confirm', v)} placeholder="Re-enter password" /></div>
      </div>

      {err && (
        <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-700 font-medium">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" /><span>{err}</span>
        </div>
      )}

      <button type="submit" disabled={busy}
        className="w-full py-3 rounded-xl bg-brand-primary text-white font-black text-sm neu-accent flex items-center justify-center gap-2 disabled:opacity-50">
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" />Creating account…</> : <><UserPlus className="w-4 h-4" />{kind === 'student' ? 'Create student account' : 'Register & login'}</>}
      </button>
      <p className="text-center text-xs text-slate-500">
        Already registered? <button type="button" onClick={onBack} className="font-bold text-brand-primary hover:underline">Back to login</button>
      </p>
    </form>
  );
};

export default RegisterPanel;
