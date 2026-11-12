import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, Loader2 } from 'lucide-react';
import { api } from '../../../lib/api';

/** Students type the live 6-digit code shown by the faculty. */
export const LiveCheckinCard: React.FC = () => {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const checkin = useMutation({
    mutationFn: () => api.liveCheckin(code),
    onSuccess: (r: any) => { setMsg({ ok: true, text: r?.message || 'Checked in.' }); setCode(''); },
    onError: (e: any) => setMsg({ ok: false, text: e.message || 'Could not check in.' }),
  });
  return (
    <div className="bg-surface border border-borderLine rounded-2xl shadow-sm p-4 flex flex-wrap items-center gap-3">
      <KeyRound className="w-5 h-5 text-brand-primary" />
      <div className="mr-auto">
        <p className="text-xs font-black text-textPrimary">Enter class code</p>
        <p className="text-[11px] text-textMuted">Type the 6-digit code your teacher is showing</p>
      </div>
      <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="000000"
        className="w-32 px-3 py-2 text-center font-mono text-lg tracking-[0.3em] rounded-xl border border-borderLine bg-background" />
      <button disabled={code.length !== 6 || checkin.isPending} onClick={() => checkin.mutate()}
        className="px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold disabled:opacity-40 inline-flex items-center gap-1.5">
        {checkin.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Check in
      </button>
      {msg && <p className={`w-full text-[11px] font-semibold ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</p>}
    </div>
  );
};

export default LiveCheckinCard;
