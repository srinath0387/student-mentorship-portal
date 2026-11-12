import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Radio, X, Loader2, Users } from 'lucide-react';
import { api } from '../../../lib/api';

interface Props {
  allotmentId: string;
  sessionDate: string;
  periodStart: number;
  numPeriods: number;
  subjectLabel: string;
  onClose: () => void;
  /** Called with the checked-in roll numbers when the faculty member stops the live code. */
  onResult: (checkedIn: string[]) => void;
}

/** Rotating 6-digit code for students to check in; results pre-fill the attendance form. */
export const LiveCodePanel: React.FC<Props> = ({ allotmentId, sessionDate, periodStart, numPeriods, subjectLabel, onClose, onResult }) => {
  const [liveId, setLiveId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(10);
  const [stopping, setStopping] = useState(false);
  const [tick, setTick] = useState(0);

  const { data } = useQuery({
    queryKey: ['liveCode', liveId],
    queryFn: () => api.getLiveAttendance(liveId!),
    enabled: liveId !== null,
    refetchInterval: 2000,
  });
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, []);

  const start = async () => {
    setErr(null);
    try {
      const r = await api.startLiveAttendance({ allotment_id: allotmentId, session_date: sessionDate, period_start: periodStart, num_periods: numPeriods, minutes });
      setLiveId(r.live_id);
    } catch (e: any) { setErr(e.message || 'Could not start'); }
  };
  const stop = async () => {
    if (liveId === null) return onClose();
    setStopping(true);
    try {
      const r = await api.closeLiveAttendance(liveId);
      onResult(Array.isArray(r.checked_in) ? r.checked_in : []);
    } catch (e: any) { setErr(e.message || 'Could not stop'); setStopping(false); }
  };

  const secs = data ? Math.max(0, data.seconds_left_in_code - (tick % 2)) : 0;
  const remainingMin = data?.expires_at ? Math.max(0, Math.ceil((new Date(data.expires_at).getTime() - Date.now()) / 60000)) : minutes;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-surface border border-borderLine rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-5 text-center">
        <div className="flex items-start justify-between text-left">
          <div>
            <h3 className="text-sm font-black text-textPrimary flex items-center gap-2"><Radio className="w-4 h-4 text-red-500" />Live attendance code</h3>
            <p className="text-[11px] text-textMuted">{subjectLabel} · {sessionDate} · Period {periodStart}</p>
          </div>
          {liveId === null && <button onClick={onClose} className="p-1 text-textMuted"><X className="w-4 h-4" /></button>}
        </div>

        {liveId === null ? (
          <div className="space-y-3">
            <p className="text-xs text-textSecondary">Students on this class roll open <b>Attendance → Enter class code</b> and type the code shown here. The code changes every 30 seconds.</p>
            <label className="text-xs text-textSecondary">Keep open for
              <select value={minutes} onChange={e => setMinutes(Number(e.target.value))} className="mx-2 px-2 py-1 rounded-lg border border-borderLine bg-background">
                {[3, 5, 10, 15].map(m => <option key={m} value={m}>{m}</option>)}
              </select>minutes</label>
            <div><button onClick={start} className="px-5 py-2.5 rounded-xl bg-brand-primary text-white text-sm font-bold">Start</button></div>
          </div>
        ) : (
          <>
            <div className="font-mono font-black tracking-[0.3em] text-6xl sm:text-7xl text-textPrimary select-all">
              {data?.code ? `${data.code.slice(0, 3)} ${data.code.slice(3)}` : data && !data.active ? 'ENDED' : '······'}
            </div>
            {data?.active && (
              <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
                <div className="h-full bg-brand-primary transition-all duration-1000" style={{ width: `${(secs / 30) * 100}%` }} />
              </div>
            )}
            <div className="flex items-center justify-center gap-6 text-xs text-textSecondary">
              <span className="inline-flex items-center gap-1"><Users className="w-4 h-4" /><b className="text-lg text-textPrimary">{data?.checkins?.length ?? 0}</b> checked in</span>
              <span>{data?.active ? `${remainingMin} min left` : 'Window closed'}</span>
            </div>
            {data?.checkins?.length > 0 && (
              <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1 justify-center">
                {data.checkins.slice(-40).map((c: any) => <span key={c.roll_number} className="px-1.5 py-0.5 rounded bg-surface-2 text-[10px] font-mono text-textSecondary">{c.roll_number}</span>)}
              </div>
            )}
            <button onClick={stop} disabled={stopping} className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-2">
              {stopping && <Loader2 className="w-4 h-4 animate-spin" />}Stop and fill attendance
            </button>
            <p className="text-[10px] text-textMuted">Students who checked in are marked present, everyone else absent — you can still change anyone before submitting.</p>
          </>
        )}
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </div>
  );
};

export default LiveCodePanel;
