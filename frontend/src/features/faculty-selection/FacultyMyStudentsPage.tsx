/**
 * Faculty Selection — faculty: read-only list of students who chose them,
 * grouped by semester › subject › section with counts. Route: #/faculty-selection/my-students
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { fsApi, fmtTime } from './fsApi';
import { exportFacultyWisePdf } from './exportRound';
import { useAuth } from '../../context/AuthContext';
import { card, btnGhost, Empty, Notice, th, td, chipBrand } from './fsUi';

type Row = { round_id: string; round_title: string; semester_label: string; department: string; round_status: string; subject_name: string; subject_type: string;
  section: string; group_name: string | null; roll_number: string; student_name: string | null; created_at: string };

export default function FacultyMyStudentsPage() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['fs', 'my-students'], queryFn: fsApi.myStudents });
  const [open, setOpen] = useState<string | null>(null);
  const rows: Row[] = q.data || [];
  const tree = new Map<string, Map<string, Map<string, Row[]>>>();
  for (const r of rows) {
    const sem = tree.get(r.semester_label) || new Map();
    const sub = sem.get(r.subject_name) || new Map();
    sub.set(r.section, [...(sub.get(r.section) || []), r]);
    sem.set(r.subject_name, sub); tree.set(r.semester_label, sem);
  }
  const pdf = (roundRows: Row[]) => exportFacultyWisePdf(
    { id: roundRows[0].round_id, title: roundRows[0].round_title, semester_label: roundRows[0].semester_label, department: roundRows[0].department } as any,
    roundRows.map(r => ({ ...r, status: 'active', faculty_name: user?.name || '', faculty_email: user?.email || '' })) as any,
  );

  return (
    <div className="space-y-5 p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black text-textPrimary tracking-tight">My Selected Students</h1>
          <p className="text-xs text-textSecondary">Students who chose you in faculty selection. Take their attendance in <Link className="font-bold text-brand-primary hover:underline" to="/attendance">Attendance</Link>, where each section is its own class.</p>
        </div>
        <span className={chipBrand}>{rows.length} students</span>
      </div>
      {q.isLoading ? <p className="text-xs text-textMuted">Loading…</p> : q.error ? <Notice msg={{ ok: false, text: (q.error as any).message }} /> :
        !rows.length ? <Empty title="No students have chosen you yet" /> :
        Array.from(tree.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([sem, subjects]) => (
          <section key={sem} className="space-y-3">
            <p className="text-[11px] font-black uppercase tracking-wider text-textSecondary">Semester {sem}</p>
            {Array.from(subjects.entries()).map(([subject, sections]) => {
              const all = Array.from(sections.values()).flat();
              return (
                <div key={subject} className={`${card} p-4 space-y-2`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-black text-textPrimary">{subject}</h3>
                    <span className="text-[11px] font-bold text-textSecondary">{all[0].subject_type} · {all.length} students</span>
                    <button className={`${btnGhost} ml-auto`} onClick={() => pdf(all)}><FileText className="w-3.5 h-3.5 inline mr-1" />PDF</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className="border-b border-borderLine"><th className={th}>Section</th><th className={th}>Group</th><th className={`${th} text-right`}>Students</th><th className={th}>Attendance class</th><th className={th} /></tr></thead>
                      <tbody>
                        {Array.from(sections.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([sec, list]) => {
                          const key = `${sem}|${subject}|${sec}`;
                          return (
                            <React.Fragment key={key}>
                              <tr className="border-b border-borderLine">
                                <td className={td}>{sec}</td><td className={td}>{Array.from(new Set(list.map(x => x.group_name))).join(', ')}</td>
                                <td className={`${td} text-right tabular-nums font-bold`}>{list.length}</td><td className={td}>{subject} · Sec {sec}</td>
                                <td className={`${td} text-right`}>
                                  <button className="text-[11px] font-bold text-brand-primary hover:underline" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
                                    {open === key ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />} {open === key ? 'Hide' : 'Show'} list</button>
                                </td>
                              </tr>
                              {open === key && (
                                <tr><td colSpan={5} className="px-3 pb-3">
                                  <table className="w-full rounded-xl bg-surface-2/60"><tbody>
                                    {list.sort((a, b) => a.roll_number.localeCompare(b.roll_number)).map((x, i) => (
                                      <tr key={x.roll_number} className="border-b border-borderLine last:border-0">
                                        <td className={`${td} text-textMuted tabular-nums w-10`}>{i + 1}</td><td className={`${td} font-mono`}>{x.roll_number}</td>
                                        <td className={td}>{x.student_name}</td><td className={`${td} text-[11px] text-textMuted`}>{fmtTime(x.created_at)}</td>
                                      </tr>))}
                                  </tbody></table>
                                </td></tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
    </div>
  );
}
