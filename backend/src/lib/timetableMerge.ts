/**
 * Back-to-back timetable periods of the same subject, section and faculty become one class of 2 or 3 hours
 * (P3 + P4 → P3–4, 2 hours; P5 + P6 + P7 → P5–7, a 3-hour lab), so Take Attendance shows Hr1 / Hr2 / Hr3.
 *
 * Periods: P1–P2, short break, P3–P4, lunch, P5–P7. Classes may run across the short break (a lab in P1–P3)
 * but never across lunch, and a class is never longer than 3 periods.
 */

export const LAST_PERIOD_BEFORE_LUNCH = 4;
export const MAX_CLASS_PERIODS = 3;
export const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export interface TimetableRow {
  id: string;
  day_of_week: string;
  period_start: number;
  num_periods: number;
  subject_name: string;
  subject_type: string;
  faculty_email: string | null;
  room_no: string | null;
}

export interface MergePlan {
  updates: { id: string; num_periods: number; room_no: string | null; subject_type: string }[];
  deletes: string[];
  merged: string[];     // "DBMS Lab on Monday P5–7"
  warnings: string[];   // labs of only one hour
}

const key = (r: TimetableRow) => `${String(r.subject_name || '').trim().toLowerCase()}|${String(r.faculty_email || '').trim().toLowerCase()}`;
const span = (p: number, n: number) => (n > 1 ? `P${p}–${p + n - 1}` : `P${p}`);

/** What to change in one class's timetable (one semester + department + section) */
export function planTimetableMerge(rows: TimetableRow[]): MergePlan {
  const plan: MergePlan = { updates: [], deletes: [], merged: [], warnings: [] };
  const byDay = new Map<string, TimetableRow[]>();
  for (const r of rows) {
    const list = byDay.get(r.day_of_week) || [];
    list.push({ ...r, period_start: Number(r.period_start), num_periods: Math.max(1, Number(r.num_periods) || 1) });
    byDay.set(r.day_of_week, list);
  }
  const days = [...byDay.keys()].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  for (const day of days) {
    const list = byDay.get(day)!.sort((a, b) => a.period_start - b.period_start);
    const kept: TimetableRow[] = [];
    let cur: (TimetableRow & { changed?: boolean }) | null = null;
    for (const r of list) {
      const end = cur ? cur.period_start + cur.num_periods - 1 : 0;
      const joins = !!cur && key(cur) === key(r) && !!String(r.subject_name || '').trim()
        && r.period_start === end + 1                                                   // back-to-back
        && !(end <= LAST_PERIOD_BEFORE_LUNCH && r.period_start > LAST_PERIOD_BEFORE_LUNCH) // not across lunch
        && cur.num_periods + r.num_periods <= MAX_CLASS_PERIODS;
      if (joins && cur) {
        cur.num_periods += r.num_periods;
        if (!cur.room_no && r.room_no) cur.room_no = r.room_no;
        if (r.subject_type === 'Lab') cur.subject_type = 'Lab';
        cur.changed = true;
        plan.deletes.push(r.id);
      } else {
        cur = { ...r };
        kept.push(cur);
      }
    }
    for (const c of kept as (TimetableRow & { changed?: boolean })[]) {
      if (c.changed) {
        plan.updates.push({ id: c.id, num_periods: c.num_periods, room_no: c.room_no, subject_type: c.subject_type });
        plan.merged.push(`${c.subject_name} on ${day} ${span(c.period_start, c.num_periods)}`);
      }
      if (c.subject_type === 'Lab' && c.num_periods === 1) {
        plan.warnings.push(`${c.subject_name} (lab) on ${day} P${c.period_start} is only 1 hour. Labs are usually 3 hours: set Duration to 3, or add the next periods for the same lab.`);
      }
    }
  }
  return plan;
}
