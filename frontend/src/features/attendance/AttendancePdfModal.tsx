import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Printer, 
  Download, 
  X, 
  Filter, 
  CheckCircle, 
  AlertTriangle, 
  AlertCircle,
  Building,
  GraduationCap
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../../lib/api';
import { YearAttendanceReportResponse } from '../../types';
import { VALID_DEPARTMENT_NAMES } from '../../lib/validation/auth';

interface AttendancePdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultYear?: string;
  defaultDepartment?: string;
  defaultSection?: string;
  allowedYear?: string;
}

export const AttendancePdfModal: React.FC<AttendancePdfModalProps> = ({
  isOpen,
  onClose,
  defaultYear = '2nd Year',
  defaultDepartment = '',
  defaultSection = 'All',
}) => {
  const [selectedYear, setSelectedYear] = useState<string>(defaultYear);
  const [selectedDept, setSelectedDept] = useState<string>(defaultDepartment);
  const [selectedSection, setSelectedSection] = useState<string>(defaultSection);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<YearAttendanceReportResponse | null>(null);

  const years = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
  const sections = ['All', 'A', 'B', 'C', 'D', 'DS', 'AIML'];

  useEffect(() => {
    if (isOpen) {
      fetchReport();
    }
  }, [isOpen, selectedYear, selectedDept, selectedSection]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const res = await api.getYearAttendanceReport({
        year: selectedYear,
        department: selectedDept === 'All' ? '' : selectedDept,
        section: selectedSection === 'All' ? '' : selectedSection,
      });
      setReportData(res);
    } catch (err: any) {
      console.error('Failed to load year attendance report:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    if (!reportData || reportData.students.length === 0) return;

    const subjects = reportData.subjects || [];

    const headers = [
      'S.No',
      'Roll Number',
      'Student Name',
      'Section',
      'Department',
      ...subjects.map(s => `${s.subject_name} (${s.semester_label}) - Held`),
      ...subjects.map(s => `${s.subject_name} (${s.semester_label}) - Attended`),
      ...subjects.map(s => `${s.subject_name} (${s.semester_label}) - %`),
      'Total Periods Held',
      'Total Periods Attended',
      'Overall Attendance %',
      'Eligibility Status',
    ];

    const rows = reportData.students.map((st, idx) => {
      const subjectHeld = subjects.map(s => st.subjects[s.id]?.periods_held ?? 0);
      const subjectAttended = subjects.map(s => st.subjects[s.id]?.periods_attended ?? 0);
      const subjectPct = subjects.map(s => {
        const sub = st.subjects[s.id];
        return sub ? `${sub.percentage}%` : 'N/A';
      });

      const status = st.overall_percentage >= 75 ? 'Eligible' : st.overall_percentage >= 65 ? 'Condonation Required' : 'Detained / Critical Shortage';

      return [
        idx + 1,
        st.roll_number,
        st.name,
        st.section,
        st.department,
        ...subjectHeld,
        ...subjectAttended,
        ...subjectPct,
        st.total_periods_held,
        st.total_periods_attended,
        `${st.overall_percentage}%`,
        status,
      ];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([
      [`RGM COLLEGE OF ENGINEERING & TECHNOLOGY (AUTONOMOUS)`],
      [`DEPARTMENT ATTENDANCE SHEET — ${selectedYear.toUpperCase()} — ${reportData.department}`],
      [`Generated On: ${new Date().toLocaleDateString('en-GB')}`],
      [],
      headers,
      ...rows,
    ]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Report');
    XLSX.writeFile(workbook, `RGMCET_Attendance_Report_${selectedYear.replace(' ', '_')}_${selectedSection}.xlsx`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex justify-center p-2 sm:p-4 print:p-0 print:bg-white print:static">
      <div className="relative w-full max-w-7xl bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] print:max-h-none print:border-none print:shadow-none print:rounded-none print:bg-white print:text-black">
        
        {/* Modal Header & Controls (Hidden in Print) */}
        <div className="p-4 sm:p-5 bg-slate-800/80 border-b border-slate-700/60 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-md">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Download Attendance Sheet (PDF & Excel)
              </h2>
              <p className="text-xs text-slate-400">
                Official institutional attendance sheets with subject breakdowns & late-joining adjustments
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={loading || !reportData || reportData.students.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </button>
            <button
              onClick={handleExportExcel}
              disabled={loading || !reportData || reportData.students.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export Excel
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Controls (Hidden in Print) */}
        <div className="p-3 sm:p-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center gap-3 print:hidden">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            <span>Select Year & Section:</span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/50">
            {years.map(y => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                  selectedYear === y
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Department:</span>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-cyan-500"
            >
              <option value="All">All Departments</option>
              {VALID_DEPARTMENT_NAMES.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Section:</span>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-cyan-500"
            >
              {sections.map(s => (
                <option key={s} value={s}>{s === 'All' ? 'All Sections' : `Section ${s}`}</option>
              ))}
            </select>
          </div>

          {reportData && (
            <div className="ml-auto text-xs text-slate-400 flex items-center gap-4">
              <span><strong>{reportData.students.length}</strong> Students</span>
              <span><strong>{reportData.subjects.length}</strong> Subjects</span>
            </div>
          )}
        </div>

        {/* Report Content Body (Scrollable modal view + Pixel-perfect Printable Sheet) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-950 print:p-0 print:bg-white print:overflow-visible">
          {loading ? (
            <div className="py-20 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-400 mb-3" />
              <p className="text-sm text-slate-400">Compiling official attendance records...</p>
            </div>
          ) : !reportData || reportData.students.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <FileText className="w-12 h-12 mx-auto text-slate-600 mb-3" />
              <p className="text-sm font-semibold">No attendance records found for {selectedYear} ({selectedSection}).</p>
              <p className="text-xs text-slate-500 mt-1">Please ensure subject allotments and attendance sessions are saved.</p>
            </div>
          ) : (
            <div className="bg-white text-slate-900 p-6 sm:p-8 rounded-xl shadow-lg print:shadow-none print:p-0 print:border-none print:rounded-none">
              
              {/* Institutional Header */}
              <div className="border-b-2 border-slate-900 pb-4 mb-5 text-center">
                <div className="flex items-center justify-between gap-4">
                  <img
                    src="/rgmcet-crest.png"
                    alt="RGM CET Crest"
                    className="w-16 h-16 object-contain"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                  <div className="flex-1">
                    <h1 className="text-lg sm:text-xl font-black tracking-wide text-slate-900 uppercase">
                      Rajeev Gandhi Memorial College of Engineering & Technology
                    </h1>
                    <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                      (Autonomous) • Approved by AICTE • Accredited by NAAC with 'A+' Grade & NBA
                    </p>
                    <p className="text-[10px] text-slate-500">
                      NH-40, Nandyal, Andhra Pradesh - 518501, India
                    </p>
                  </div>
                  <div className="w-16 text-right text-[10px] font-bold text-slate-500">
                    <div>RGM-ATT</div>
                    <div>AY 2025-26</div>
                  </div>
                </div>

                <div className="mt-3 py-1.5 px-3 bg-slate-100 rounded-lg flex flex-wrap items-center justify-between text-xs font-bold text-slate-800">
                  <span>REPORT: CONSOLIDATED ATTENDANCE RECORD</span>
                  <span>YEAR: {selectedYear.toUpperCase()} ({reportData.semesters.join(', ')})</span>
                  <span>DEPT: {reportData.department}</span>
                  <span>SECTION: {selectedSection}</span>
                  <span>DATE: {new Date().toLocaleDateString('en-GB')}</span>
                </div>
              </div>

              {/* Attendance Matrix Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 font-bold">
                      <th className="border border-slate-300 px-2 py-1.5 text-center w-8">#</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-left w-24">Roll No</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-left">Student Name</th>
                      <th className="border border-slate-300 px-1.5 py-1.5 text-center w-8">Sec</th>
                      {reportData.subjects.map(subj => (
                        <th key={subj.id} className="border border-slate-300 px-1.5 py-1.5 text-center min-w-[70px]">
                          <div className="truncate max-w-[90px] font-bold" title={subj.subject_name}>
                            {subj.subject_name}
                          </div>
                          <div className="text-[9px] font-normal text-slate-500">
                            {subj.subject_type}
                          </div>
                        </th>
                      ))}
                      <th className="border border-slate-300 px-2 py-1.5 text-center w-16 bg-slate-200">Held</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-center w-16 bg-slate-200">Attn</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-center w-16 bg-cyan-100 font-black">Overall %</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-center w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.students.map((st, idx) => {
                      const isEligible = st.overall_percentage >= 75;
                      const isCondonation = st.overall_percentage >= 65 && st.overall_percentage < 75;
                      const isShortage = st.overall_percentage < 65;

                      return (
                        <tr 
                          key={st.roll_number}
                          className={`hover:bg-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} ${
                            isShortage ? 'bg-rose-50/50 print:bg-transparent' : ''
                          }`}
                        >
                          <td className="border border-slate-300 px-2 py-1 text-center text-slate-500">{idx + 1}</td>
                          <td className="border border-slate-300 px-2 py-1 font-mono font-bold text-slate-800">{st.roll_number}</td>
                          <td className="border border-slate-300 px-2 py-1 font-medium text-slate-900">{st.name}</td>
                          <td className="border border-slate-300 px-1.5 py-1 text-center font-semibold text-slate-700">{st.section}</td>
                          
                          {reportData.subjects.map(subj => {
                            const sub = st.subjects[subj.id];
                            if (!sub) {
                              return <td key={subj.id} className="border border-slate-300 px-1.5 py-1 text-center text-slate-400">-</td>;
                            }
                            const pctColor = sub.percentage >= 75 ? 'text-emerald-700 font-bold' : sub.percentage >= 65 ? 'text-amber-700 font-bold' : 'text-rose-700 font-bold';
                            return (
                              <td key={subj.id} className="border border-slate-300 px-1 py-1 text-center">
                                <div className={pctColor}>{sub.percentage}%</div>
                                <div className="text-[9px] text-slate-400">
                                  {sub.periods_attended}/{sub.periods_held}
                                </div>
                                {sub.joining_date && (
                                  <div className="text-[8px] text-purple-700 print:text-black font-semibold" title={`Joined on ${sub.joining_date}`}>
                                    *J
                                  </div>
                                )}
                              </td>
                            );
                          })}

                          <td className="border border-slate-300 px-2 py-1 text-center font-bold text-slate-700 bg-slate-100/70">{st.total_periods_held}</td>
                          <td className="border border-slate-300 px-2 py-1 text-center font-bold text-slate-700 bg-slate-100/70">{st.total_periods_attended}</td>
                          <td className={`border border-slate-300 px-2 py-1 text-center font-black text-xs ${
                            isEligible ? 'text-emerald-700 bg-emerald-50' : isCondonation ? 'text-amber-700 bg-amber-50' : 'text-rose-700 bg-rose-100 font-black'
                          }`}>
                            {st.overall_percentage}%
                          </td>
                          <td className="border border-slate-300 px-1.5 py-1 text-center">
                            {isEligible ? (
                              <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 print:text-black">
                                Eligible
                              </span>
                            ) : isCondonation ? (
                              <span className="inline-flex items-center text-[10px] font-bold text-amber-700 print:text-black">
                                Condonation
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-[10px] font-bold text-rose-700 print:text-black">
                                Shortage
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footnote on Late Joining & Attendance Thresholds */}
              <div className="mt-4 pt-3 border-t border-slate-200 text-[10px] text-slate-500 flex flex-wrap justify-between items-center gap-2">
                <div>
                  <strong>Note:</strong> *J indicates late-joining student. Attendance % is calculated exclusively from sessions held on or after their verified join date.
                </div>
                <div className="flex items-center gap-3 font-semibold">
                  <span className="text-emerald-700">≥ 75%: Regular Eligible</span>
                  <span className="text-amber-700">65% – 74%: Condonation</span>
                  <span className="text-rose-700">&lt; 65%: Detained</span>
                </div>
              </div>

              {/* Signatures for Official Approval */}
              <div className="mt-12 pt-6 border-t border-slate-300 grid grid-cols-3 text-center text-xs font-bold text-slate-800">
                <div>
                  <div className="h-10"></div>
                  <p className="border-t border-slate-400 mx-6 pt-1">Class Teacher / Mentor</p>
                </div>
                <div>
                  <div className="h-10"></div>
                  <p className="border-t border-slate-400 mx-6 pt-1">Head of Department (HOD)</p>
                </div>
                <div>
                  <div className="h-10"></div>
                  <p className="border-t border-slate-400 mx-6 pt-1">Principal / Dean Academics</p>
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
};
