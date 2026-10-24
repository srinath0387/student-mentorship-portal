/**
 * Mentor Report Generator
 * Generates a 4-sheet Excel workbook for HOD review meetings.
 * Sheet 1: All Mentees Summary (one row per student, color-coded)
 * Sheet 2: At-Risk Students only
 * Sheet 3: Meeting Logs
 * Sheet 4: Year-wise Breakdown
 */

import * as XLSX from 'xlsx';
import { api } from '../lib/api';

interface MenteeRow {
  roll_number: string;
  name: string;
  year: string;
  section: string;
  department: string;
  cgpa: number;
  leetcode_solved?: number;
  github_repos?: number;
  cert_count: number;
  meeting_count: number;
  attendance_pct: number | null;
  risk: 'High Risk' | 'Medium Risk' | 'Good';
  risk_reasons: string;
}

// XLSX cell color fill helpers
const RED_FILL = { patternType: 'solid', fgColor: { rgb: 'FFFFE0E0' } };
const YELLOW_FILL = { patternType: 'solid', fgColor: { rgb: 'FFFFFDE7' } };
const GREEN_FILL = { patternType: 'solid', fgColor: { rgb: 'FFF0FFF4' } };
const HEADER_FILL = { patternType: 'solid', fgColor: { rgb: 'FF1E40AF' } };
const HEADER_FONT = { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 11 };
const BOLD_FONT = { bold: true };

function styleCell(ws: XLSX.WorkSheet, cellRef: string, fill?: any, font?: any) {
  if (!ws[cellRef]) return;
  if (!ws[cellRef].s) ws[cellRef].s = {};
  if (fill) ws[cellRef].s.fill = fill;
  if (font) ws[cellRef].s.font = font;
}

function styleRow(ws: XLSX.WorkSheet, row: number, colCount: number, fill: any) {
  for (let c = 0; c < colCount; c++) {
    const ref = XLSX.utils.encode_cell({ r: row, c });
    styleCell(ws, ref, fill);
  }
}

function applyHeaderStyle(ws: XLSX.WorkSheet, colCount: number) {
  for (let c = 0; c < colCount; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    styleCell(ws, ref, HEADER_FILL, HEADER_FONT);
  }
}

export async function generateMentorReport(opts: {
  facultyName: string;
  facultyEmail: string;
  department: string;
  mentees: any[];
  yearFilter?: string; // '1st Year' | '2nd Year' | ... | 'All'
}) {
  const { facultyName, facultyEmail, department, mentees, yearFilter } = opts;

  // 1. Filter mentees by year if requested
  const filtered = yearFilter && yearFilter !== 'All'
    ? mentees.filter((m: any) => m.year === yearFilter)
    : mentees;

  if (filtered.length === 0) {
    alert('No mentees found for the selected year.');
    return;
  }

  // 2. Fetch supplementary data in parallel (batched 6 at a time)
  const batchSize = 6;
  const certCounts: Record<string, number> = {};
  const academicsMap: Record<string, number> = {}; // latest cgpa from academics

  for (let i = 0; i < filtered.length; i += batchSize) {
    const batch = filtered.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (m: any) => {
        try {
          const certs = await api.getCertifications(m.roll_number);
          certCounts[m.roll_number] = Array.isArray(certs) ? certs.length : 0;
        } catch {
          certCounts[m.roll_number] = 0;
        }
      })
    );
  }

  // 3. Fetch all meeting logs for this faculty (single call)
  let allMeetings: any[] = [];
  try {
    allMeetings = await api.getMentorMeetings({ faculty_email: facultyEmail });
    if (!Array.isArray(allMeetings)) allMeetings = [];
  } catch {
    allMeetings = [];
  }

  const meetingCountByStudent: Record<string, number> = {};
  const meetingsByStudent: Record<string, any[]> = {};
  for (const m of allMeetings) {
    meetingCountByStudent[m.roll_number] = (meetingCountByStudent[m.roll_number] || 0) + 1;
    if (!meetingsByStudent[m.roll_number]) meetingsByStudent[m.roll_number] = [];
    meetingsByStudent[m.roll_number].push(m);
  }

  // 4. Build MenteeRow array
  const rows: MenteeRow[] = filtered.map((m: any) => {
    const cgpa = Number(m.cgpa || 0);
    const attPct: number | null = null; // attendance not batch-fetchable cheaply
    const reasons: string[] = [];
    if (cgpa > 0 && cgpa < 5.0) reasons.push('CGPA < 5');
    else if (cgpa > 0 && cgpa < 6.0) reasons.push('CGPA < 6');
    const risk: MenteeRow['risk'] =
      cgpa > 0 && cgpa < 5.0 ? 'High Risk' :
      cgpa > 0 && cgpa < 6.0 ? 'Medium Risk' : 'Good';

    return {
      roll_number: m.roll_number,
      name: m.name,
      year: m.year || '—',
      section: m.section || '—',
      department: m.department || department,
      cgpa,
      leetcode_solved: m.leetcode_solved ?? m.leetcode ?? m.lc_solved ?? undefined,
      github_repos: m.github_repos ?? m.github ?? undefined,
      cert_count: certCounts[m.roll_number] ?? 0,
      meeting_count: meetingCountByStudent[m.roll_number] ?? 0,
      attendance_pct: attPct,
      risk,
      risk_reasons: reasons.join(', ') || 'None',
    };
  });

  // Sort: at-risk first, then by CGPA asc
  rows.sort((a, b) => {
    const riskOrder = { 'High Risk': 0, 'Medium Risk': 1, 'Good': 2 };
    if (riskOrder[a.risk] !== riskOrder[b.risk]) return riskOrder[a.risk] - riskOrder[b.risk];
    return a.cgpa - b.cgpa;
  });

  // ── Create Workbook ───────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  (wb as any).Workbook = { Views: [{ RTL: false }] };

  // ── SHEET 1: Full Summary ─────────────────────────────────────────────────
  const summaryHeaders = [
    'Roll Number', 'Name', 'Year', 'Section', 'CGPA',
    'LeetCode Solved', 'GitHub Repos', 'Certifications', 'Mentor Meetings',
    'Risk Status', 'Risk Reasons',
  ];

  const summaryData = [
    summaryHeaders,
    ...rows.map(r => [
      r.roll_number, r.name, r.year, r.section,
      r.cgpa > 0 ? r.cgpa : '—',
      r.leetcode_solved !== undefined ? r.leetcode_solved : '—',
      r.github_repos !== undefined ? r.github_repos : '—',
      r.cert_count,
      r.meeting_count,
      r.risk,
      r.risk_reasons,
    ]),
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  // Column widths
  ws1['!cols'] = [
    { wch: 16 }, { wch: 24 }, { wch: 10 }, { wch: 9 }, { wch: 8 },
    { wch: 16 }, { wch: 14 }, { wch: 15 }, { wch: 16 },
    { wch: 14 }, { wch: 28 },
  ];
  // Style header
  applyHeaderStyle(ws1, summaryHeaders.length);
  // Style rows by risk
  rows.forEach((r, i) => {
    const rowIdx = i + 1;
    const fill = r.risk === 'High Risk' ? RED_FILL : r.risk === 'Medium Risk' ? YELLOW_FILL : GREEN_FILL;
    styleRow(ws1, rowIdx, summaryHeaders.length, fill);
  });
  XLSX.utils.book_append_sheet(wb, ws1, '📋 All Mentees');

  // ── SHEET 2: At-Risk Only ─────────────────────────────────────────────────
  const atRisk = rows.filter(r => r.risk !== 'Good');
  const atRiskData = [
    summaryHeaders,
    ...atRisk.map(r => [
      r.roll_number, r.name, r.year, r.section,
      r.cgpa > 0 ? r.cgpa : '—',
      r.leetcode_solved !== undefined ? r.leetcode_solved : '—',
      r.github_repos !== undefined ? r.github_repos : '—',
      r.cert_count, r.meeting_count, r.risk, r.risk_reasons,
    ]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(atRiskData.length > 1 ? atRiskData : [summaryHeaders, ['No at-risk students found — Great!']]);
  ws2['!cols'] = ws1['!cols'];
  applyHeaderStyle(ws2, summaryHeaders.length);
  atRisk.forEach((r, i) => {
    const fill = r.risk === 'High Risk' ? RED_FILL : YELLOW_FILL;
    styleRow(ws2, i + 1, summaryHeaders.length, fill);
  });
  XLSX.utils.book_append_sheet(wb, ws2, '⚠️ At-Risk Students');

  // ── SHEET 3: Meeting Logs ─────────────────────────────────────────────────
  const meetingHeaders = ['Roll Number', 'Student Name', 'Meeting Date', 'Tag', 'Topics Discussed', 'Action Items', 'Next Meeting'];
  // Only include meetings for students in filtered list
  const filteredRolls = new Set(filtered.map((m: any) => m.roll_number));
  const relevantMeetings = allMeetings
    .filter(m => filteredRolls.has(m.roll_number))
    .sort((a, b) => new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime());

  const meetingData = [
    meetingHeaders,
    ...(relevantMeetings.length > 0
      ? relevantMeetings.map(m => [
          m.roll_number,
          m.student_name || '—',
          m.meeting_date ? new Date(m.meeting_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
          m.tag || 'General',
          m.topics || '—',
          m.action_items || '—',
          m.next_meeting ? new Date(m.next_meeting).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
        ])
      : [['No meeting logs recorded yet.', '', '', '', '', '', '']]
    ),
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(meetingData);
  ws3['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 40 }, { wch: 35 }, { wch: 14 }];
  applyHeaderStyle(ws3, meetingHeaders.length);
  XLSX.utils.book_append_sheet(wb, ws3, '📝 Meeting Logs');

  // ── SHEET 4: Year-wise Breakdown ──────────────────────────────────────────
  const years = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
  const breakdownHeaders = ['Year', 'Total Students', 'Avg CGPA', 'Students with Certifications', 'Total Certifications', 'At-Risk Count', 'Meeting Logs'];
  const breakdownData = [
    breakdownHeaders,
    ...years.map(yr => {
      const yRows = rows.filter(r => r.year === yr);
      const withCgpa = yRows.filter(r => r.cgpa > 0);
      const avgCgpa = withCgpa.length > 0
        ? (withCgpa.reduce((s, r) => s + r.cgpa, 0) / withCgpa.length).toFixed(2)
        : '—';
      const certsStudents = yRows.filter(r => r.cert_count > 0).length;
      const totalCerts = yRows.reduce((s, r) => s + r.cert_count, 0);
      const atRiskCnt = yRows.filter(r => r.risk !== 'Good').length;
      const meetingsCnt = yRows.reduce((s, r) => s + r.meeting_count, 0);
      return [yr, yRows.length, avgCgpa, certsStudents, totalCerts, atRiskCnt, meetingsCnt];
    }),
    // Totals row
    [
      'TOTAL',
      rows.length,
      rows.filter(r => r.cgpa > 0).length > 0
        ? (rows.filter(r => r.cgpa > 0).reduce((s, r) => s + r.cgpa, 0) / rows.filter(r => r.cgpa > 0).length).toFixed(2)
        : '—',
      rows.filter(r => r.cert_count > 0).length,
      rows.reduce((s, r) => s + r.cert_count, 0),
      rows.filter(r => r.risk !== 'Good').length,
      rows.reduce((s, r) => s + r.meeting_count, 0),
    ],
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(breakdownData);
  ws4['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 26 }, { wch: 22 }, { wch: 14 }, { wch: 14 }];
  applyHeaderStyle(ws4, breakdownHeaders.length);
  // Bold totals row
  const totalsRow = breakdownData.length - 1;
  for (let c = 0; c < breakdownHeaders.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: totalsRow, c });
    styleCell(ws4, ref, HEADER_FILL, HEADER_FONT);
  }
  XLSX.utils.book_append_sheet(wb, ws4, '📊 Year-wise Breakdown');

  // ── SHEET 0 (first): Cover / Meta ────────────────────────────────────────
  const now = new Date();
  const coverData = [
    ['MENTOR REVIEW REPORT'],
    [''],
    ['Mentor Name', facultyName],
    ['Email', facultyEmail],
    ['Department', department],
    ['Year Filter', yearFilter || 'All Years'],
    ['Total Mentees (in report)', filtered.length],
    ['At-Risk Students', rows.filter(r => r.risk !== 'Good').length],
    ['Total Meeting Logs', relevantMeetings.length],
    ['Report Generated', now.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) + '  ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })],
    [''],
    ['RGMCET — Student Mentorship Portal'],
  ];
  const ws0 = XLSX.utils.aoa_to_sheet(coverData);
  ws0['!cols'] = [{ wch: 24 }, { wch: 40 }];
  // Style title
  const titleRef = XLSX.utils.encode_cell({ r: 0, c: 0 });
  styleCell(ws0, titleRef, HEADER_FILL, { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 16 });
  // Bold label column
  [2, 3, 4, 5, 6, 7, 8, 9].forEach(row => {
    styleCell(ws0, XLSX.utils.encode_cell({ r: row, c: 0 }), undefined, BOLD_FONT);
  });

  // Insert cover as first sheet
  wb.SheetNames.unshift('📌 Cover');
  wb.Sheets['📌 Cover'] = ws0;

  // ── Save ─────────────────────────────────────────────────────────────────
  const safeName = facultyName.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
  const safeYear = (yearFilter || 'All').replace(/\s+/g, '_');
  const dateStr = now.toISOString().slice(0, 10);
  const fileName = `Mentor_Report_${safeName}_${safeYear}_${dateStr}.xlsx`;

  XLSX.writeFile(wb, fileName);
  return fileName;
}
