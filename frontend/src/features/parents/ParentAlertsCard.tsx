import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellRing, CalendarCheck } from 'lucide-react';
import { api } from '../../lib/api';

interface Alert { level: 'high' | 'medium'; code: string; title: string; detail: string }

/** Attendance alerts about the ward, shown at the top of the parent view. */
export const ParentAlertsCard: React.FC = () => {
  const { data } = useQuery({ queryKey: ['parentAlerts'], queryFn: () => api.getParentAlerts(), staleTime: 60 * 1000 });
  if (!data) return null;
  const alerts: Alert[] = Array.isArray(data.alerts) ? data.alerts : [];
  return (
    <div className="bg-surface border border-borderLine rounded-2xl shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-textSecondary flex items-center gap-1.5"><BellRing className="w-4 h-4 text-brand-primary" />Alerts for your ward</h3>
        {data.monthly && (
          <span className="text-[11px] text-textMuted inline-flex items-center gap-1"><CalendarCheck className="w-3.5 h-3.5" />
            Last month: <b className={data.monthly.percentage < 75 ? 'text-red-600' : 'text-emerald-600'}>{data.monthly.percentage}%</b> ({data.monthly.attended}/{data.monthly.held} periods)
          </span>
        )}
      </div>
      {alerts.length === 0 ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">No attendance concerns this week. 👍</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map(a => (
            <li key={a.code} className={`rounded-xl px-3 py-2 border-l-4 ${a.level === 'high' ? 'border-l-red-500 bg-red-500/5' : 'border-l-amber-500 bg-amber-500/5'}`}>
              <p className="text-xs font-bold text-textPrimary">{a.title}</p>
              <p className="text-[11px] text-textSecondary">{a.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ParentAlertsCard;
