/** tests/smoke/timetableMerge.test.ts — back-to-back periods of the same class become one 2- or 3-hour class */
import { planTimetableMerge, TimetableRow } from '../../src/lib/timetableMerge';

let n = 0;
const row = (day: string, p: number, subject: string, extra: Partial<TimetableRow> = {}): TimetableRow =>
  ({ id: `r${++n}`, day_of_week: day, period_start: p, num_periods: 1, subject_name: subject, subject_type: 'Theory', faculty_email: 'ramesh@rgmcet.edu.in', room_no: null, ...extra });

describe('Timetable merging', () => {
  it('joins P3 + P4 into one 2-hour class and P5–P7 into one 3-hour lab', () => {
    const a = row('Monday', 3, 'DBMS', { room_no: 'C-201' }); const b = row('Monday', 4, 'DBMS');
    const l1 = row('Monday', 5, 'DBMS Lab', { subject_type: 'Lab' }); const l2 = row('Monday', 6, 'DBMS Lab', { subject_type: 'Lab' }); const l3 = row('Monday', 7, 'DBMS Lab', { subject_type: 'Lab' });
    const plan = planTimetableMerge([l3, b, a, l1, l2]);
    expect(plan.updates).toEqual([
      { id: a.id, num_periods: 2, room_no: 'C-201', subject_type: 'Theory' },
      { id: l1.id, num_periods: 3, room_no: null, subject_type: 'Lab' },
    ]);
    expect(plan.deletes.sort()).toEqual([b.id, l2.id, l3.id].sort());
    expect(plan.merged).toEqual(['DBMS on Monday P3–4', 'DBMS Lab on Monday P5–7']);
    expect(plan.warnings).toEqual([]);
  });

  it('never joins across lunch, other faculty or other subjects, and never beyond 3 hours', () => {
    const plan = planTimetableMerge([
      row('Tuesday', 4, 'OS'), row('Tuesday', 5, 'OS'),                                   // lunch between P4 and P5
      row('Tuesday', 1, 'CN'), row('Tuesday', 2, 'CN', { faculty_email: 'other@rgmcet.edu.in' }),
      row('Wednesday', 1, 'ML'), row('Wednesday', 2, 'AI'),
      row('Thursday', 1, 'Lab X', { subject_type: 'Lab' }), row('Thursday', 2, 'Lab X', { subject_type: 'Lab' }),
      row('Thursday', 3, 'Lab X', { subject_type: 'Lab' }), row('Thursday', 4, 'Lab X', { subject_type: 'Lab' }),
    ]);
    // only Thursday's lab joins (P1–3 across the short break); P4 stays a separate 1-hour lab and is flagged
    expect(plan.merged).toEqual(['Lab X on Thursday P1–3']);
    expect(plan.deletes).toHaveLength(2);
    expect(plan.warnings).toEqual([expect.stringMatching(/^Lab X \(lab\) on Thursday P4 is only 1 hour/)]);
  });

  it('extends an existing 2-hour entry with the next period, and flags a lone 1-hour lab', () => {
    const a = row('Friday', 5, 'Python Lab', { num_periods: 2, subject_type: 'Lab' }); const b = row('Friday', 7, 'Python Lab', { subject_type: 'Lab' });
    const lone = row('Saturday', 2, 'IoT Lab', { subject_type: 'Lab' });
    const plan = planTimetableMerge([a, b, lone]);
    expect(plan.updates).toEqual([{ id: a.id, num_periods: 3, room_no: null, subject_type: 'Lab' }]);
    expect(plan.warnings).toEqual([expect.stringContaining('IoT Lab (lab) on Saturday P2 is only 1 hour')]);
  });
});
