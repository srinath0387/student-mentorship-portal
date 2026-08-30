import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { BookOpen, Users, Clock, Trash2, Plus, Upload, Search, Edit2, Check, X } from 'lucide-react';
import { api } from '../../../lib/api';
import { VALID_DEPARTMENT_NAMES } from '../../../lib/validation/auth';

const DEPARTMENTS = VALID_DEPARTMENT_NAMES;
const SEMESTERS = ['1-1','1-2','2-1','2-2','3-1','3-2','4-1','4-2'];
const SECTIONS = ['A','B','C','D','E'];
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const PERIODS = [1,2,3,4,5,6,7];
const PERIOD_TIMES: Record<number,string> = {
  1:'09:00–09:50',2:'09:50–10:40',3:'10:55–11:45',
  4:'11:45–12:35',5:'01:50–02:40',6:'02:40–03:30',7:'03:30–04:20'
};

type TabId = 'subjects'|'allotment'|'roster'|'timetable';

const StatusMsg:React.FC<{msg:{type:string;message:string}|null}> = ({msg}) => {
  if(!msg) return null;
  return (
    <div className={`p-3 rounded-xl text-xs font-bold border ${msg.type==='success'?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-rose-50 text-rose-700 border-rose-200'}`}>
      {msg.message}
    </div>
  );
};

export const AttendanceSetupPage: React.FC = () => {
  const [tab, setTab] = useState<TabId>('subjects');
  const qc = useQueryClient();

  // ── TAB 1: SUBJECT MASTER ──────────────────────────────────────────────────
  const [subSearch, setSubSearch] = useState('');
  const [subSemFilter, setSubSemFilter] = useState('');
  const [subDeptFilter, setSubDeptFilter] = useState('');
  const [subForm, setSubForm] = useState({ semester_label:'', department:'CSE', subject_code:'', subject_name:'', short_name:'', subject_type:'Theory' as 'Theory'|'Lab', regulation:'R22' });
  const [subStatus, setSubStatus] = useState<{type:string;message:string}|null>(null);
  const [editingSubId, setEditingSubId] = useState<string|null>(null);

  const [masterFetchTs, setMasterFetchTs] = useState(0);

  const { data: rawMasterSubjects = [], refetch: refetchMaster, isLoading: isMasterLoading, error: masterError } = useQuery({
    queryKey: ['masterSubjects', masterFetchTs],
    queryFn: async () => {
      const result = await api.getMasterSubjects();
      console.log('[AttendanceSetup] getMasterSubjects raw result:', result, 'type:', typeof result, 'isArray:', Array.isArray(result));
      return result;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });
  console.log('[AttendanceSetup] rawMasterSubjects:', rawMasterSubjects, 'masterError:', masterError);
  const masterSubjects = Array.isArray(rawMasterSubjects) ? rawMasterSubjects : [];
  const filteredSubjects = masterSubjects.filter((s: any) =>
    (!subSemFilter || s.semester_label === subSemFilter) &&
    (!subDeptFilter || s.department === subDeptFilter) &&
    (!subSearch || s.subject_name?.toLowerCase().includes(subSearch.toLowerCase()) || s.subject_code?.toLowerCase().includes(subSearch.toLowerCase()))
  );

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubStatus(null);
    try {
      if (editingSubId) {
        await api.updateMasterSubject(editingSubId, subForm);
        setSubStatus({ type: 'success', message: 'Subject updated in master catalog.' });
        setEditingSubId(null);
      } else {
        await api.createMasterSubject(subForm);
        setSubStatus({ type: 'success', message: 'Subject added to master catalog.' });
      }
      // Fully wipe cache so React Query can't serve a stale empty list
      await qc.invalidateQueries({ queryKey: ['masterSubjects'] });
      qc.removeQueries({ queryKey: ['masterSubjects'] });
      // Bump timestamp → new queryKey → new network request with _t cache-buster
      setMasterFetchTs(Date.now());
      // Clear filters so newly added subject is visible
      setSubSemFilter('');
      setSubDeptFilter('');
      setSubSearch('');
      setSubForm({ semester_label: '', department: 'CSE', subject_code: '', subject_name: '', short_name: '', subject_type: 'Theory', regulation: 'R22' });
    } catch (err: any) {
      setSubStatus({ type: 'error', message: err.message || 'Failed to save subject.' });
    }
  };

  // ── TAB 2: FACULTY ALLOTMENT ───────────────────────────────────────────────
  const [allotSem, setAllotSem] = useState('');
  const [allotDept, setAllotDept] = useState('CSE');
  const [allotSection, setAllotSection] = useState('A');
  const [allotSubjectId, setAllotSubjectId] = useState('');
  const [allotFaculty, setAllotFaculty] = useState('');
  const [allotStatus, setAllotStatus] = useState<{type:string;message:string}|null>(null);

  const {data:rawAllotments=[]} = useQuery({ queryKey:['attendanceAllotments',allotSem,allotDept], queryFn:()=>api.getAllotments(allotSem||undefined,allotDept||undefined).catch(()=>[]) });
  const allotments = Array.isArray(rawAllotments)?rawAllotments:[];
  const {data:rawFacultyList=[]} = useQuery({ queryKey:['allFaculty'], queryFn:()=>api.getAllFaculty().catch(()=>[]) });
  const facultyList = Array.isArray(rawFacultyList)?rawFacultyList:[];
  const subjectsForAllot = masterSubjects.filter((s:any)=>!allotSem||s.semester_label===allotSem);

  const handleAllot = async (e:React.FormEvent) => {
    e.preventDefault();
    const sub = masterSubjects.find((s:any)=>s.id===allotSubjectId);
    if(!sub||!allotFaculty) { setAllotStatus({type:'error',message:'Select a subject and faculty.'}); return; }
    const faculty = facultyList.find((f:any)=>f.email===allotFaculty);
    try {
      await api.createSingleAllotment({ semester:allotSem||sub.semester_label, department:allotDept, section:allotSection, subject_name:sub.subject_name, subject_type:sub.subject_type, faculty_name:faculty?.name||allotFaculty, faculty_email:allotFaculty });
      qc.invalidateQueries({queryKey:['attendanceAllotments']});
      setAllotStatus({type:'success',message:'Allotment created.'});
      setAllotSubjectId(''); setAllotFaculty('');
    } catch(err:any) { setAllotStatus({type:'error',message:err.message||'Failed.'}); }
  };

  const handleDeleteAllotment = async (id:string) => {
    if(!window.confirm('Remove this allotment?')) return;
    await api.deleteAllotment(id);
    qc.invalidateQueries({queryKey:['attendanceAllotments']});
  };

  const handleBulkAllotUpload = (e:React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target?.result,{type:'binary'});
      const rows:any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      await api.uploadAllotments(allotSem, rows.map(r=>({ subject_name:r['Subject Name']||r['subject_name']||'', subject_type:(r['Subject Type']||'Theory').toLowerCase().includes('lab')?'Lab':'Theory', faculty_email:r['Faculty Email']||r['faculty_email']||'', faculty_name:r['Faculty Name']||r['faculty_name']||'', section:r['Section']||allotSection, department:allotDept })));
      qc.invalidateQueries({queryKey:['attendanceAllotments']});
      setAllotStatus({type:'success',message:`${rows.length} allotments imported.`});
    };
    reader.readAsBinaryString(file);
  };

  // ── TAB 3: STUDENT ROSTER ──────────────────────────────────────────────────
  const [rosterAllotId, setRosterAllotId] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [studentName, setStudentName] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [rosterStatus, setRosterStatus] = useState<{type:string;message:string}|null>(null);

  const {data:rawRoster=[]} = useQuery({ queryKey:['attendanceRoster',rosterAllotId], queryFn:()=>rosterAllotId?api.getRoster(rosterAllotId).catch(()=>[]):Promise.resolve([]), enabled:Boolean(rosterAllotId) });
  const roster = Array.isArray(rawRoster)?rawRoster:[];

  const handleAddStudent = async (e:React.FormEvent) => {
    e.preventDefault();
    if(!rosterAllotId||!rollNo) { setRosterStatus({type:'error',message:'Select subject and enter roll number.'}); return; }
    try {
      await api.createSingleRosterStudent({ allotment_id:rosterAllotId, roll_number:rollNo.trim().toUpperCase(), student_name:studentName.trim(), joining_date:joiningDate||undefined });
      qc.invalidateQueries({queryKey:['attendanceRoster']});
      setRosterStatus({type:'success',message:`${rollNo.toUpperCase()} enrolled.`});
      setRollNo(''); setStudentName(''); setJoiningDate('');
    } catch(err:any) { setRosterStatus({type:'error',message:err.message||'Failed.'}); }
  };

  const handleBulkRosterUpload = (e:React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if(!file||!rosterAllotId) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target?.result,{type:'binary'});
      const rows:any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      await api.uploadRoster(rosterAllotId, rows.map(r=>({ roll_number:String(r['Roll Number']||r['roll_number']||r['Roll No']||'').trim().toUpperCase(), student_name:r['Student Name']||r['student_name']||'', joining_date:r['Joining Date']||undefined })));
      qc.invalidateQueries({queryKey:['attendanceRoster']});
      setRosterStatus({type:'success',message:`${rows.length} students enrolled.`});
    };
    reader.readAsBinaryString(file);
  };

  // ── TAB 4: TIMETABLE ──────────────────────────────────────────────────────
  const [ttSem, setTtSem] = useState('');
  const [ttDept, setTtDept] = useState('CSE');
  const [ttSection, setTtSection] = useState('A');
  const [ttDay, setTtDay] = useState('Monday');
  const [ttPeriod, setTtPeriod] = useState(1);
  const [ttSubject, setTtSubject] = useState('');
  const [ttFacEmail, setTtFacEmail] = useState('');
  const [ttNumPeriods, setTtNumPeriods] = useState(1);
  const [ttRoom, setTtRoom] = useState('');
  const [ttStatus, setTtStatus] = useState<{type:string;message:string}|null>(null);

  const {data:rawTT=[]} = useQuery({ queryKey:['attendanceTimetable',ttSem,ttDept,ttSection], queryFn:()=>api.getTimetable({semester:ttSem||undefined,department:ttDept||undefined,section:ttSection||undefined}).catch(()=>[]) });
  const timetable = Array.isArray(rawTT)?rawTT:[];

  const ttGrid = useMemo(()=>{
    const grid:Record<string,Record<number,any>> = {};
    DAYS.forEach(d=>{ grid[d]={}; PERIODS.forEach(p=>{ grid[d][p]=null; }); });
    timetable.filter((t:any)=>(!ttSem||t.semester_label===ttSem)&&(!ttSection||t.section===ttSection)).forEach((t:any)=>{ if(grid[t.day_of_week]) grid[t.day_of_week][t.period_start]=t; });
    return grid;
  },[timetable,ttSem,ttSection]);

  const handleSaveSlot = async (e:React.FormEvent) => {
    e.preventDefault();
    if(!ttSubject||!ttFacEmail) { setTtStatus({type:'error',message:'Subject and Faculty Email required.'}); return; }
    try {
      await api.uploadTimetable(ttSem,ttSection,ttDept,[{ day_of_week:ttDay, period_start:ttPeriod, num_periods:ttNumPeriods, subject_name:ttSubject, subject_type:'Theory', faculty_email:ttFacEmail, room_no:ttRoom }]);
      qc.invalidateQueries({queryKey:['attendanceTimetable']});
      setTtStatus({type:'success',message:`Slot saved: ${ttDay} P${ttPeriod}.`});
      setTtSubject(''); setTtFacEmail(''); setTtRoom('');
    } catch(err:any) { setTtStatus({type:'error',message:err.message||'Failed.'}); }
  };

  const TABS: {id:TabId;label:string;icon:React.ReactNode}[] = [
    {id:'subjects',label:'📚 Subject Master',icon:<BookOpen className="w-3.5 h-3.5"/>},
    {id:'allotment',label:'👨‍🏫 Faculty Allotment',icon:<Users className="w-3.5 h-3.5"/>},
    {id:'roster',label:'👥 Student Roster',icon:<Users className="w-3.5 h-3.5"/>},
    {id:'timetable',label:'🕒 Timetable',icon:<Clock className="w-3.5 h-3.5"/>},
  ];

  return (
    <div className="space-y-5">
      {/* Tab Nav */}
      <div className="flex gap-1 border-b border-borderLine overflow-x-auto pb-0">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all -mb-px ${tab===t.id?'border-brand-primary text-brand-primary bg-brand-soft':'border-transparent text-textSecondary hover:text-textPrimary hover:bg-surface-2'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: SUBJECT MASTER ── */}
      {tab==='subjects' && (
        <div className="space-y-4">
          <form onSubmit={handleAddSubject} className="bg-surface border border-borderLine rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-textPrimary">{editingSubId?'Edit Subject':'Add Subject to Master Catalog'}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <select value={subForm.semester_label} onChange={e=>setSubForm(f=>({...f,semester_label:e.target.value}))} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold" required>
                <option value="">Class *</option>{SEMESTERS.map(s=><option key={s}>{s}</option>)}
              </select>
              <select value={subForm.department} onChange={e=>setSubForm(f=>({...f,department:e.target.value}))} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold" required>
                <option value="">Department *</option>
                {DEPARTMENTS.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              <input value={subForm.subject_code} onChange={e=>setSubForm(f=>({...f,subject_code:e.target.value}))} placeholder="Subject Code *" className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none" required/>
              <input value={subForm.subject_name} onChange={e=>setSubForm(f=>({...f,subject_name:e.target.value}))} placeholder="Subject Title *" className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none" required/>
              <input value={subForm.short_name} onChange={e=>setSubForm(f=>({...f,short_name:e.target.value}))} placeholder="Short Name" className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none"/>
              <select value={subForm.subject_type} onChange={e=>setSubForm(f=>({...f,subject_type:e.target.value as any}))} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
                <option>Theory</option><option>Lab</option>
              </select>
              <input value={subForm.regulation} onChange={e=>setSubForm(f=>({...f,regulation:e.target.value}))} placeholder="Regulation (e.g. R22)" className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none"/>
              <div className="flex gap-2">
                <button type="submit" className="flex-1 px-4 py-2 bg-brand-primary hover:opacity-90 text-white font-bold text-xs rounded-xl">{editingSubId?'Update':'Add Subject'}</button>
                {editingSubId&&<button type="button" onClick={()=>{setEditingSubId(null);setSubForm({semester_label:'',department:'CSE',subject_code:'',subject_name:'',short_name:'',subject_type:'Theory',regulation:'R22'});}} className="px-3 py-2 text-xs font-bold text-textSecondary border border-borderLine rounded-xl hover:bg-surface-2">Cancel</button>}
              </div>
            </div>
            <StatusMsg msg={subStatus}/>
          </form>

          {/* Filter + Table */}
          <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
            <div className="p-3 border-b border-borderLine flex gap-2 flex-wrap items-center">
              <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted"/><input value={subSearch} onChange={e=>setSubSearch(e.target.value)} placeholder="Search subjects..." className="pl-8 pr-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none w-48"/></div>
              <select value={subSemFilter} onChange={e=>setSubSemFilter(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
                <option value="">All Classes</option>{SEMESTERS.map(s=><option key={s}>{s}</option>)}
              </select>
              <select value={subDeptFilter} onChange={e=>setSubDeptFilter(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
                <option value="">All Departments</option>{DEPARTMENTS.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              <div className="ml-auto flex items-center gap-3 text-xs">
                {isMasterLoading && <span className="text-blue-500 font-bold animate-pulse">Loading…</span>}
                {masterError && <span className="text-red-500 font-bold">Error: {String(masterError)}</span>}
                <span className="text-textMuted">DB: <strong>{masterSubjects.length}</strong> total · Shown: <strong>{filteredSubjects.length}</strong></span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-2 border-b border-borderLine font-bold text-textSecondary uppercase text-[10px]">
                  <tr><th className="px-4 py-2.5">Class</th><th className="px-4 py-2.5">Dept</th><th className="px-4 py-2.5">Code</th><th className="px-4 py-2.5">Title</th><th className="px-4 py-2.5">Short</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Reg</th><th className="px-4 py-2.5 text-center">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {filteredSubjects.length===0?<tr><td colSpan={8} className="p-8 text-center text-textMuted">No subjects found.</td></tr>:filteredSubjects.map((s:any)=>(
                    <tr key={s.id} className="hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-2.5 font-bold">{s.semester_label}</td>
                      <td className="px-4 py-2.5">{s.department}</td>
                      <td className="px-4 py-2.5 font-mono">{s.subject_code}</td>
                      <td className="px-4 py-2.5 font-bold">{s.subject_name}</td>
                      <td className="px-4 py-2.5 text-textSecondary">{s.short_name}</td>
                      <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.subject_type==='Lab'?'bg-purple-100 text-purple-700':'bg-blue-100 text-blue-700'}`}>{s.subject_type}</span></td>
                      <td className="px-4 py-2.5 text-textSecondary">{s.regulation}</td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={()=>{setEditingSubId(s.id);setSubForm({semester_label:s.semester_label,department:s.department,subject_code:s.subject_code,subject_name:s.subject_name,short_name:s.short_name||'',subject_type:s.subject_type,regulation:s.regulation||'R22'});setTab('subjects');}} className="text-brand-primary hover:opacity-70"><Edit2 className="w-3.5 h-3.5"/></button>
                          <button onClick={async()=>{if(!window.confirm('Delete this subject?'))return;await api.deleteMasterSubject(s.id);qc.invalidateQueries({queryKey:['masterSubjects']});}} className="text-rose-500 hover:opacity-70"><Trash2 className="w-3.5 h-3.5"/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: FACULTY ALLOTMENT ── */}
      {tab==='allotment' && (
        <div className="space-y-4">
          <form onSubmit={handleAllot} className="bg-surface border border-borderLine rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-textPrimary">Allot Subject to Faculty</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <select value={allotSem} onChange={e=>setAllotSem(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                <option value="">All Classes</option>{SEMESTERS.map(s=><option key={s}>{s}</option>)}
              </select>
              <select value={allotDept} onChange={e=>setAllotDept(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
                {DEPARTMENTS.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              <select value={allotSection} onChange={e=>setAllotSection(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                {SECTIONS.map(s=><option key={s}>{s}</option>)}
              </select>
              <select value={allotSubjectId} onChange={e=>setAllotSubjectId(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none" required>
                <option value="">Select Subject *</option>
                {subjectsForAllot.map((s:any)=><option key={s.id} value={s.id}>{s.semester_label} — {s.subject_name}</option>)}
              </select>
              <select value={allotFaculty} onChange={e=>setAllotFaculty(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none" required>
                <option value="">Select Faculty *</option>
                {facultyList.map((f:any)=><option key={f.email} value={f.email}>{f.name||f.email}</option>)}
              </select>
              <button type="submit" className="px-4 py-2 bg-brand-primary text-white font-bold text-xs rounded-xl hover:opacity-90">Allot</button>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-borderLine rounded-xl cursor-pointer hover:bg-surface-2 text-xs font-bold text-textSecondary">
                <Upload className="w-3.5 h-3.5"/>Bulk Excel Upload
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkAllotUpload}/>
              </label>
              <span className="text-[10px] text-textMuted">Columns: Subject Name, Subject Type, Faculty Email, Faculty Name, Section</span>
            </div>
            <StatusMsg msg={allotStatus}/>
          </form>

          <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
            <div className="p-3 border-b border-borderLine font-bold text-xs text-textPrimary">Active Allotments ({allotments.length})</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-2 border-b border-borderLine font-bold text-textSecondary uppercase text-[10px]">
                  <tr><th className="px-4 py-2.5">Class</th><th className="px-4 py-2.5">Dept</th><th className="px-4 py-2.5">Section</th><th className="px-4 py-2.5">Subject</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Faculty</th><th className="px-4 py-2.5 text-center">Remove</th></tr>
                </thead>
                <tbody className="divide-y divide-borderLine">
                  {allotments.length===0?<tr><td colSpan={7} className="p-8 text-center text-textMuted">No allotments yet.</td></tr>:allotments.map((a:any)=>(
                    <tr key={a.id} className="hover:bg-surface-2">
                      <td className="px-4 py-2.5 font-bold">{a.semester_label}</td>
                      <td className="px-4 py-2.5">{a.department}</td>
                      <td className="px-4 py-2.5 font-bold">{a.section}</td>
                      <td className="px-4 py-2.5 font-bold">{a.subject_name}</td>
                      <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${a.subject_type==='Lab'?'bg-purple-100 text-purple-700':'bg-blue-100 text-blue-700'}`}>{a.subject_type}</span></td>
                      <td className="px-4 py-2.5">{a.faculty_name}<br/><span className="text-textMuted text-[10px]">{a.faculty_email}</span></td>
                      <td className="px-4 py-2.5 text-center"><button onClick={()=>handleDeleteAllotment(a.id)} className="text-rose-500 hover:opacity-70"><Trash2 className="w-3.5 h-3.5"/></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: STUDENT ROSTER ── */}
      {tab==='roster' && (
        <div className="space-y-4">
          <div className="bg-surface border border-borderLine rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-textPrimary">Enroll Students into Subject Roster</h3>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">Select Allotted Subject</label>
              <select value={rosterAllotId} onChange={e=>setRosterAllotId(e.target.value)} className="w-full max-w-sm px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                <option value="">— Choose a subject allotment —</option>
                {allotments.map((a:any)=><option key={a.id} value={a.id}>{a.semester_label} | Sec {a.section} | {a.subject_name} — {a.faculty_name}</option>)}
              </select>
            </div>
            {rosterAllotId && (
              <>
                <form onSubmit={handleAddStudent} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <input value={rollNo} onChange={e=>setRollNo(e.target.value)} placeholder="Roll Number *" className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none" required/>
                  <input value={studentName} onChange={e=>setStudentName(e.target.value)} placeholder="Student Name" className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none"/>
                  <input type="date" value={joiningDate} onChange={e=>setJoiningDate(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none"/>
                  <button type="submit" className="flex items-center justify-center gap-1.5 px-4 py-2 bg-brand-primary text-white font-bold text-xs rounded-xl hover:opacity-90"><Plus className="w-3.5 h-3.5"/>Add Student</button>
                </form>
                <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-borderLine rounded-xl cursor-pointer hover:bg-surface-2 text-xs font-bold text-textSecondary w-fit">
                  <Upload className="w-3.5 h-3.5"/>Bulk Upload Excel
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkRosterUpload}/>
                </label>
                <StatusMsg msg={rosterStatus}/>
                <div className="overflow-x-auto border border-borderLine rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-surface-2 font-bold text-textSecondary uppercase text-[10px] border-b border-borderLine">
                      <tr><th className="px-4 py-2.5 w-10 text-center">#</th><th className="px-4 py-2.5">Roll No</th><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Joining Date</th><th className="px-4 py-2.5 text-center">Remove</th></tr>
                    </thead>
                    <tbody className="divide-y divide-borderLine">
                      {roster.length===0?<tr><td colSpan={5} className="p-6 text-center text-textMuted">No students enrolled yet.</td></tr>:roster.map((r:any,idx:number)=>(
                        <tr key={r.id} className="hover:bg-surface-2">
                          <td className="px-4 py-2.5 text-center text-textMuted">{idx+1}</td>
                          <td className="px-4 py-2.5 font-mono font-black">{r.roll_number}</td>
                          <td className="px-4 py-2.5 font-bold uppercase">{r.student_name||'—'}</td>
                          <td className="px-4 py-2.5 text-textSecondary">{r.joining_date||'—'}</td>
                          <td className="px-4 py-2.5 text-center"><button onClick={async()=>{if(!window.confirm('Remove student?'))return;await api.deleteRosterStudent(r.id);qc.invalidateQueries({queryKey:['attendanceRoster']});}} className="text-rose-500 hover:opacity-70"><Trash2 className="w-3.5 h-3.5"/></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4: TIMETABLE ── */}
      {tab==='timetable' && (
        <div className="space-y-4">
          <form onSubmit={handleSaveSlot} className="bg-surface border border-borderLine rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-textPrimary">Add Timetable Slot</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              <select value={ttSem} onChange={e=>setTtSem(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                <option value="">Class</option>{SEMESTERS.map(s=><option key={s}>{s}</option>)}
              </select>
              <select value={ttDept} onChange={e=>setTtDept(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
                {DEPARTMENTS.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              <select value={ttSection} onChange={e=>setTtSection(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                {SECTIONS.map(s=><option key={s}>{s}</option>)}
              </select>
              <select value={ttDay} onChange={e=>setTtDay(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                {DAYS.map(d=><option key={d}>{d}</option>)}
              </select>
              <select value={ttPeriod} onChange={e=>setTtPeriod(Number(e.target.value))} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                {PERIODS.map(p=><option key={p} value={p}>Period {p}</option>)}
              </select>
              <input value={ttSubject} onChange={e=>setTtSubject(e.target.value)} placeholder="Subject *" className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none" required/>
              <input value={ttFacEmail} onChange={e=>setTtFacEmail(e.target.value)} placeholder="Faculty Email *" className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none" required/>
              <button type="submit" className="px-4 py-2 bg-brand-primary text-white font-bold text-xs rounded-xl hover:opacity-90">Save Slot</button>
            </div>
            <StatusMsg msg={ttStatus}/>
          </form>

          {/* Timetable Grid */}
          <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
            <div className="p-3 border-b border-borderLine flex gap-3 flex-wrap">
              <select value={ttSem} onChange={e=>setTtSem(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
                <option value="">All Classes</option>{SEMESTERS.map(s=><option key={s}>{s}</option>)}
              </select>
              <select value={ttDept} onChange={e=>setTtDept(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
                {DEPARTMENTS.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              <select value={ttSection} onChange={e=>setTtSection(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
                {SECTIONS.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-surface-2 font-bold text-[10px] uppercase text-textSecondary">
                  <tr>
                    <th className="px-4 py-2.5 border-b border-r border-borderLine w-28">Day</th>
                    {PERIODS.map(p=>(
                      <th key={p} className="px-3 py-2.5 border-b border-r border-borderLine text-center min-w-[110px]">
                        <div>Period {p}</div>
                        <div className="text-[9px] font-normal text-textMuted">{PERIOD_TIMES[p]}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map(day=>(
                    <tr key={day} className="border-b border-borderLine">
                      <td className="px-4 py-2.5 font-bold bg-surface-2 border-r border-borderLine">{day}</td>
                      {PERIODS.map(period=>{
                        const slot = ttGrid[day]?.[period];
                        return (
                          <td key={period} className="px-2 py-2 border-r border-borderLine align-top">
                            {slot ? (
                              <div className="bg-brand-soft border border-brand-primary/20 rounded-xl p-2 space-y-1 relative group">
                                <div className="text-[10px] font-black text-brand-primary truncate">{slot.subject_name}</div>
                                <div className="text-[9px] text-textSecondary truncate">{slot.faculty_email}</div>
                                <button onClick={async()=>{if(!window.confirm('Delete slot?'))return;await api.deleteTimetableEntry(slot.id);qc.invalidateQueries({queryKey:['attendanceTimetable']});}} className="absolute top-1 right-1 text-rose-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <X className="w-3 h-3"/>
                                </button>
                              </div>
                            ) : <span className="text-[10px] text-textMuted opacity-30">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
