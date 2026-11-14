/**
 * Faculty Selection exports: Excel workbook and letterhead PDFs (faculty-wise and full list).
 */
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { ReportPdf } from '../../lib/pdfReport';
import { fmtTime, type FsRound } from './fsApi';

export interface SelRow {
  roll_number: string; student_name: string | null; section: string; status: string; created_at: string;
  subject_name: string; subject_type: string; faculty_name: string | null; faculty_email: string | null; group_name: string | null;
}

const fileBase = (r: FsRound) => `${r.department} ${r.semester_label} ${r.title}`.replace(/[^A-Za-z0-9 ()&.-]+/g, ' ').trim();
const active = (rows: SelRow[]) => rows.filter(r => r.status === 'active');

/** One sheet of all picks in confirmed order, one sheet per faculty, plus pending students. */
export function exportExcel(round: FsRound, rows: SelRow[], students: any[], subjectCount: number) {
  const wb = XLSX.utils.book_new();
  const all = rows.map((r, i) => ({
    '#': i + 1, 'Confirmed at': fmtTime(r.created_at, true, true), 'Reg No': r.roll_number, 'Student name': r.student_name || '',
    Section: r.section, Group: r.group_name || '', Subject: r.subject_name, Type: r.subject_type,
    Faculty: r.status === 'active' ? r.faculty_name || '' : '', Status: r.status === 'active' ? 'Allotted' : 'Released (admin to assign)',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(all), 'All selections');

  const byFac = new Map<string, SelRow[]>();
  for (const r of active(rows)) {
    const k = r.faculty_name || r.faculty_email || 'Unknown';
    byFac.set(k, [...(byFac.get(k) || []), r]);
  }
  const used = new Set<string>(['All selections', 'Pending students']);
  for (const [fac, list] of Array.from(byFac.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    let name = fac.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'Faculty';
    for (let n = 2; used.has(name); n++) name = `${name.slice(0, 25)} ${n}`;
    used.add(name);
    const sheet = list
      .sort((a, b) => `${a.subject_name}|${a.section}|${a.roll_number}`.localeCompare(`${b.subject_name}|${b.section}|${b.roll_number}`))
      .map((r, i) => ({ 'S.No': i + 1, Subject: r.subject_name, Section: r.section, 'Reg No': r.roll_number, 'Student name': r.student_name || '', Group: r.group_name || '' }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), name);
  }

  const pending = students.filter(s => s.picked < subjectCount).map(s => ({
    'Reg No': s.roll_number, 'Student name': s.name, Section: s.section, 'Subjects chosen': `${s.picked} of ${subjectCount}`,
    Released: s.released || 0,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pending.length ? pending : [{ Note: 'Every student has chosen all subjects' }]), 'Pending students');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([out], { type: 'application/octet-stream' }), `${fileBase(round)} - Faculty Selection.xlsx`);
}

/**
 * Faculty-wise PDF: one section per faculty (each starts on a new page so it can be handed over),
 * subject by subject, section by section: S.No, Reg No, Student name.
 * Pass `onlyFaculty` (email) for a single faculty's list.
 */
export async function exportFacultyWisePdf(round: FsRound, rows: SelRow[], onlyFaculty?: string) {
  const list = active(rows).filter(r => !onlyFaculty || (r.faculty_email || '').toLowerCase() === onlyFaculty.toLowerCase());
  const pdf = await ReportPdf.create(round.department);
  const byFac = new Map<string, SelRow[]>();
  for (const r of list) {
    const k = (r.faculty_email || r.faculty_name || '').toLowerCase();
    byFac.set(k, [...(byFac.get(k) || []), r]);
  }
  const facs = Array.from(byFac.values()).sort((a, b) => (a[0].faculty_name || '').localeCompare(b[0].faculty_name || ''));
  if (!facs.length) {
    pdf.title('Faculty Selection — Faculty-wise List', `${round.title} · Semester ${round.semester_label}`);
    pdf.para('No students have been allotted yet.');
  }
  facs.forEach((fr, fi) => {
    if (fi > 0) { pdf.doc.addPage(); pdf.letterhead(); }
    pdf.title('Faculty Selection — Students Allotted', `${round.title} · Semester ${round.semester_label}`);
    pdf.keyValues([
      ['Faculty', fr[0].faculty_name],
      ['Email', fr[0].faculty_email],
      ['Total students', fr.length],
    ]);
    const bySubject = new Map<string, SelRow[]>();
    for (const r of fr) bySubject.set(r.subject_name, [...(bySubject.get(r.subject_name) || []), r]);
    for (const [subject, srows] of Array.from(bySubject.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const bySection = new Map<string, SelRow[]>();
      for (const r of srows) bySection.set(r.section, [...(bySection.get(r.section) || []), r]);
      for (const [section, xs] of Array.from(bySection.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        pdf.heading(`${subject} (${xs[0].subject_type}) · Section ${section} · ${xs.length} student${xs.length === 1 ? '' : 's'}`);
        pdf.table(
          ['S.No', 'Reg No', 'Student name', 'Group', 'Confirmed at'],
          xs.sort((a, b) => a.roll_number.localeCompare(b.roll_number))
            .map((r, i) => [i + 1, r.roll_number, r.student_name || '', r.group_name || '', fmtTime(r.created_at, true)]),
          { 0: { cellWidth: 12 }, 1: { cellWidth: 28 }, 3: { cellWidth: 22 }, 4: { cellWidth: 34 } },
        );
      }
    }
    pdf.signatures([{ role: 'Faculty' , name: fr[0].faculty_name }, { role: 'Head of the Department' }]);
  });
  pdf.save(`${fileBase(round)} - Faculty-wise${onlyFaculty ? ` - ${facs[0]?.[0].faculty_name || ''}` : ''}.pdf`);
}

/** Full list in confirmed order (who got which faculty, first come first served). */
export async function exportAllPdf(round: FsRound, rows: SelRow[]) {
  const pdf = await ReportPdf.create(round.department, 'landscape');
  pdf.title('Faculty Selection — All Allotments', `${round.title} · Semester ${round.semester_label}`);
  pdf.keyValues([
    ['Window', `${fmtTime(round.starts_at)} to ${fmtTime(round.ends_at)}`],
    ['Allotted choices', active(rows).length],
  ]);
  pdf.table(
    ['#', 'Confirmed at', 'Reg No', 'Student name', 'Section', 'Group', 'Subject', 'Faculty'],
    active(rows).map((r, i) => [i + 1, fmtTime(r.created_at, true), r.roll_number, r.student_name || '', r.section, r.group_name || '', r.subject_name, r.faculty_name || '']),
    { 0: { cellWidth: 10 }, 1: { cellWidth: 30 }, 2: { cellWidth: 26 }, 4: { cellWidth: 16 }, 5: { cellWidth: 20 } },
  );
  pdf.signatures([{ role: 'Department Admin' }, { role: 'Head of the Department' }]);
  pdf.save(`${fileBase(round)} - All allotments.pdf`);
}
