import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Users, Calendar, CheckCircle2, Clock, FileText, AlertTriangle, Printer, LayoutDashboard, Check } from 'lucide-react';
import { api } from '../../../lib/api';
import { SubjectAllotment, SubjectRosterEntry, TimetableEntry, SemesterLabel } from '../../../types';
import { useAuth } from '../../../context/AuthContext';

const ALL_SEMESTERS: SemesterLabel[] = ['1-1','1-2','2-1','2-2','3-1','3-2','4-1','4-2'];
const PERIOD_TIMES: Record<number,string> = {
  1:'09:00–09:50',2:'09:50–10:40',3:'10:55–11:45',
  4:'11:45–12:35',5:'01:50–02:40',6:'02:40–03:30',7:'03:30–04:20'
};
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

type NavId = 'dashboard'|'mark'|'not_posted'|'reports'|'timetable';

export const FacultyAttendancePage: React.FC = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [nav, setNav] = useState<NavId>('dashboard');

  // Mark Attendance State
  const [sem, setSem] = useState<SemesterLabel|''>('');
  const [section, setSection] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hour1, setHour1] = useState(true);
  const [hour2, setHour2] = useState(true);
  const [hour3, setHour3] = useState(true);
  const [records, setRecords] = useState<{roll_number:string;student_name?:string;h1:boolean;h2:boolean;h3:boolean}[]>([]);
  const [showAbsentModal, setShowAbsentModal] = useState(false);
  const [feedback, setFeedback] = useState<{type:'success'|'error';text:string}|null>(null);

  // Reports State
  const [reportSubId, setReportSubId] = useState('All');
  const [reportSection, setReportSection] = useState('All');

  // Fetch allotted subjects
  const {data:rawSubjects=[]} = useQuery({ queryKey:['mySubjectsAll'], queryFn:()=>api.getMyAttendanceSubjects().catch(()=>[]) });
  const mySubjects: SubjectAllotment[] = Array.isArray(rawSubjects)?rawSubjects:[];

  const todayDay = useMemo(()=>DAYS[new Date().getDay()]||'Monday',[]);

  // Sections for selected semester
  const sections = useMemo(()=>{
    const s = new Set<string>();
    mySubjects.filter(x=>!sem||x.semester_label===sem).forEach(x=>x.section&&s.add(x.section));
    return Array.from(s).sort();
  },[mySubjects,sem]);

  // Subjects for selected semester+section
  const filteredSubjects = useMemo(()=>mySubjects.filter(s=>(!sem||s.semester_label===sem)&&(!section||s.section===section)),[mySubjects,sem,section]);
  const activeSubject = useMemo(()=>mySubjects.find(s=>s.id===subjectId)||null,[mySubjects,subjectId]);

  // Roster
  const {data:rawRoster=[],isLoading:rosterLoading} = useQuery({
    queryKey:['roster',subjectId,date], queryFn:()=>subjectId?api.getRoster(subjectId,date).catch(()=>[]):Promise.resolve([]), enabled:Boolean(subjectId&&isLoaded)
  });
  const roster: SubjectRosterEntry[] = Array.isArray(rawRoster)?rawRoster:[];

  // Existing session
  const {data:rawSessions=[]} = useQuery({
    queryKey:['sessions',subjectId,date], queryFn:()=>subjectId&&date?api.getAttendanceSessions(subjectId,date,date).catch(()=>[]):Promise.resolve([]), enabled:Boolean(subjectId&&date&&isLoaded)
  });
  const sessions = Array.isArray(rawSessions)?rawSessions:[];
  const existingSession = sessions[0]||null;
  const isPosted = Boolean(existingSession);

  const {data:sessionDetails} = useQuery({
    queryKey:['sessionDetails',existingSession?.id], queryFn:()=>existingSession?.id?api.getSessionDetails(existingSession.id).catch(()=>null):Promise.resolve(null), enabled:Boolean(existingSession?.id)
  });

  // Today timetable
  const {data:rawTT=[]} = useQuery({ queryKey:['myTimetable',user?.email,todayDay], queryFn:()=>api.getTimetable({day:todayDay}).catch(()=>[]) });
  const todaySlots = useMemo(()=>{
    if(!Array.isArray(rawTT)) return [];
    return rawTT.filter((t:TimetableEntry)=>t.faculty_email?.toLowerCase()===user?.email?.toLowerCase());
  },[rawTT,user?.email]);

  // Not posted
  const {data:rawNotPosted=[]} = useQuery({ queryKey:['notPosted',user?.email], queryFn:()=>api.getNotPostedAttendance({faculty_email:user?.email}).catch(()=>[]) });
  const notPosted = Array.isArray(rawNotPosted)?rawNotPosted:[];

  useEffect(()=>{
    if(!isLoaded) return;
    if(roster.length===0) return;
    if(isPosted&&sessionDetails?.records?.length>0){
      const map = new Map<string,boolean>();
      sessionDetails.records.forEach((r:any)=>map.set(r.roll_number,r.is_present));
      setRecords(roster.map(s=>({roll_number:s.roll_number,student_name:s.student_name,h1:map.get(s.roll_number)??true,h2:map.get(s.roll_number)??true,h3:map.get(s.roll_number)??true})));
    } else {
      setRecords(roster.map(s=>({roll_number:s.roll_number,student_name:s.student_name,h1:true,h2:true,h3:true})));
    }
  },[roster,isPosted,sessionDetails,isLoaded]);

  const saveMutation = useMutation({
    mutationFn:async()=>{
      if(!subjectId) throw new Error('No subject selected');
      const payload = { allotment_id:subjectId, session_date:date, num_periods:(hour1?1:0)+(hour2?1:0)+(hour3?1:0)||1, period_start:1, records:records.map(r=>({roll_number:r.roll_number,is_present:r.h1})) };
      return isPosted&&existingSession?.id ? api.updateAttendanceSession(existingSession.id,payload.records) : api.saveAttendanceSession(payload);
    },
    onSuccess:()=>{ qc.invalidateQueries({queryKey:['sessions']}); qc.invalidateQueries({queryKey:['notPosted']}); setShowAbsentModal(false); setFeedback({type:'success',text:'Attendance saved successfully!'}); setTimeout(()=>setFeedback(null),4000); },
    onError:(err:any)=>setFeedback({type:'error',text:err.message||'Failed to save.'})
  });

  const absentList = records.filter(r=>!r.h1);
  const presentCount = records.filter(r=>r.h1).length;

  const NAV_ITEMS: {id:NavId;label:string;icon:React.ReactNode}[] = [
    {id:'dashboard',label:'Faculty Dashboard',icon:<LayoutDashboard className="w-4 h-4"/>},
    {id:'mark',label:'Mark Attendance',icon:<CheckCircle2 className="w-4 h-4 text-emerald-400"/>},
    {id:'not_posted',label:'Attendance Not Posted',icon:<Calendar className="w-4 h-4 text-amber-400"/>},
    {id:'reports',label:'My Reports',icon:<FileText className="w-4 h-4 text-cyan-400"/>},
    {id:'timetable',label:'View Timetable',icon:<Clock className="w-4 h-4 text-purple-400"/>},
  ];

  return (
    <div className="flex min-h-[80vh] rounded-2xl overflow-hidden border border-borderLine bg-surface shadow-sm">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-[#1e293b] flex flex-col hidden md:flex">
        <div className="p-3.5 bg-[#0f172a] border-b border-slate-700 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-400 shrink-0"/>
          <span className="text-xs font-black text-white">Attendance Portal</span>
        </div>
        <div className="p-3 space-y-1 flex-1">
          <p className="px-3 text-[9px] font-black uppercase tracking-wider text-slate-500 mb-2 mt-1">Main</p>
          {NAV_ITEMS.map(item=>(
            <button key={item.id} onClick={()=>setNav(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-left transition-all ${nav===item.id?'bg-[#6366f1] text-white shadow-sm':'text-slate-300 hover:bg-slate-800'}`}>
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.id==='not_posted'&&notPosted.length>0&&<span className="px-1.5 py-0.5 rounded-full text-[9px] bg-rose-500 text-white font-black">{notPosted.length}</span>}
            </button>
          ))}
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Nav */}
        <div className="flex md:hidden gap-1 overflow-x-auto p-2 border-b border-borderLine bg-surface-2">
          {NAV_ITEMS.map(item=>(
            <button key={item.id} onClick={()=>setNav(item.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold whitespace-nowrap ${nav===item.id?'bg-brand-primary text-white':'text-textSecondary hover:bg-surface'}`}>
              {item.icon}{item.label}
            </button>
          ))}
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          {/* Welcome Bar */}
          <div className="bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-200 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between">
            <span>Welcome, {user?.name||user?.email}</span>
            <span className="opacity-70">{new Date().toLocaleDateString('en-GB',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}</span>
          </div>

          {feedback&&<div className={`p-3 rounded-xl text-xs font-bold ${feedback.type==='success'?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-rose-50 text-rose-700 border border-rose-200'}`}>{feedback.text}</div>}

          {/* ── DASHBOARD ── */}
          {nav==='dashboard' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {label:'Allotted Subjects',value:mySubjects.length,color:'bg-[#007bff]',icon:<BookOpen className="w-8 h-8 opacity-80"/>},
                  {label:'Total Sections',value:[...new Set(mySubjects.map(s=>s.section))].length,color:'bg-[#28a745]',icon:<Users className="w-8 h-8 opacity-80"/>},
                  {label:'Today Classes',value:todaySlots.length,color:'bg-[#ffc107] text-slate-900',icon:<Calendar className="w-8 h-8 opacity-80"/>},
                  {label:'Not Posted',value:notPosted.length,color:'bg-[#dc3545]',icon:<AlertTriangle className="w-8 h-8 opacity-80"/>},
                ].map(c=>(
                  <div key={c.label} className={`${c.color} text-white p-4 rounded-2xl flex items-center justify-between shadow-sm`}>
                    <div><p className="text-[10px] font-bold uppercase opacity-90">{c.label}</p><h3 className="text-3xl font-black mt-0.5">{c.value}</h3></div>
                    {c.icon}
                  </div>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {/* Allotted Subjects List */}
                <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
                  <div className="bg-[#007bff] text-white p-3 text-xs font-bold flex items-center gap-2"><BookOpen className="w-4 h-4"/>Allotted Subjects</div>
                  <div className="divide-y divide-borderLine max-h-60 overflow-y-auto">
                    {mySubjects.length===0?<p className="p-6 text-center text-xs text-textMuted">No subjects allotted.</p>:mySubjects.map(s=>(
                      <div key={s.id} className="px-4 py-3 flex items-center justify-between hover:bg-surface-2">
                        <div><p className="text-[10px] font-bold text-textMuted">{s.semester_label} — Sec {s.section}</p><p className="text-xs font-bold text-textPrimary">{s.subject_name}</p></div>
                        <span className="px-2 py-0.5 bg-blue-500 text-white rounded text-[10px] font-black">Subject</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Today's Timetable */}
                <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
                  <div className="bg-[#212529] text-white p-3 text-xs font-bold flex items-center gap-2"><Calendar className="w-4 h-4 text-amber-400"/>Today's Timetable</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-2 text-textSecondary font-bold text-[10px] uppercase border-b border-borderLine">
                        <tr><th className="px-3 py-2">Period</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2 text-center">Action</th></tr>
                      </thead>
                      <tbody className="divide-y divide-borderLine">
                        {todaySlots.length===0?<tr><td colSpan={3} className="p-6 text-center text-textMuted">No classes today.</td></tr>:todaySlots.map((slot:TimetableEntry)=>(
                          <tr key={slot.id} className="hover:bg-surface-2">
                            <td className="px-3 py-2.5 font-bold">P{slot.period_start} <span className="text-[9px] text-textMuted font-normal">{PERIOD_TIMES[slot.period_start]}</span></td>
                            <td className="px-3 py-2.5 font-bold text-brand-primary">{slot.subject_name}</td>
                            <td className="px-3 py-2.5 text-center">
                              <button onClick={()=>{setSem(slot.semester_label as SemesterLabel);setSection(slot.section);const m=mySubjects.find(s=>s.subject_name===slot.subject_name&&s.section===slot.section);if(m)setSubjectId(m.id);setIsLoaded(true);setNav('mark');}} className="px-2.5 py-1 bg-[#007bff] text-white text-[10px] font-bold rounded-lg hover:bg-blue-600">Mark</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── MARK ATTENDANCE ── */}
          {nav==='mark' && (
            <div className="space-y-4">
              <h2 className="text-base font-black text-textPrimary">Mark Attendance</h2>
              {/* Filter Bar */}
              <div className="bg-surface border border-borderLine rounded-2xl p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <select value={sem} onChange={e=>{setSem(e.target.value as any);setIsLoaded(false);}} className="px-3 py-2 text-xs rounded-xl border border-blue-300 dark:border-slate-600 bg-background focus:outline-none font-semibold">
                    <option value="">Select Class</option>{ALL_SEMESTERS.map(s=><option key={s}>{s}</option>)}
                  </select>
                  <select value={section} onChange={e=>{setSection(e.target.value);setIsLoaded(false);}} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
                    <option value="">Select Section</option>{sections.map(s=><option key={s}>Section {s}</option>)}
                  </select>
                  <select value={subjectId} onChange={e=>{setSubjectId(e.target.value);setIsLoaded(false);}} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
                    <option value="">Select Subject</option>{filteredSubjects.map(s=><option key={s.id} value={s.id}>{s.subject_name}</option>)}
                  </select>
                  <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold"/>
                  <button onClick={()=>{if(!subjectId){setFeedback({type:'error',text:'Select class, section and subject first.'});return;}setIsLoaded(true);}} className="px-4 py-2 bg-[#007bff] hover:bg-blue-600 text-white font-bold text-xs rounded-xl">Load Students</button>
                </div>
              </div>

              {isLoaded&&activeSubject&&(
                <div className="space-y-3">
                  {/* Info Strip */}
                  <div className="bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-200 p-4 rounded-2xl space-y-2">
                    <div className="text-xs font-bold flex flex-wrap gap-x-4 gap-y-1">
                      <span><b>Class:</b> {activeSubject.semester_label}</span><span>|</span>
                      <span><b>Section:</b> {activeSubject.section}</span><span>|</span>
                      <span><b>Subject:</b> {activeSubject.subject_name}</span><span>|</span>
                      <span><b>Date:</b> {date}</span>
                    </div>
                    {isPosted&&<div className="text-[11px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-950/40 px-3 py-1.5 rounded-lg border border-amber-200 w-fit">Already Posted — You can update attendance</div>}
                    <div className="flex gap-2 pt-1">
                      <button onClick={()=>setRecords(p=>p.map(r=>({...r,h1:true,h2:true,h3:true})))} className="px-3 py-1.5 bg-[#28a745] text-white font-bold text-xs rounded-lg hover:bg-green-600">All Present</button>
                      <button onClick={()=>setRecords(p=>p.map(r=>({...r,h1:false,h2:false,h3:false})))} className="px-3 py-1.5 bg-[#dc3545] text-white font-bold text-xs rounded-lg hover:bg-red-600">All Absent</button>
                    </div>
                  </div>

                  {/* Student Table */}
                  <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-[#343a40] text-white font-bold">
                          <tr>
                            <th className="px-4 py-3 w-12 text-center">S.No</th>
                            <th className="px-4 py-3 w-36">Roll No</th>
                            <th className="px-4 py-3">Name of the Student</th>
                            <th className="px-4 py-3 text-center w-24">
                              <label className="flex items-center justify-center gap-1 cursor-pointer">
                                <input type="checkbox" checked={hour1} onChange={e=>setHour1(e.target.checked)} className="rounded"/>
                                Hour-1
                              </label>
                            </th>
                            <th className="px-4 py-3 text-center w-24">
                              <label className="flex items-center justify-center gap-1 cursor-pointer">
                                <input type="checkbox" checked={hour2} onChange={e=>setHour2(e.target.checked)} className="rounded"/>
                                Hour-2
                              </label>
                            </th>
                            <th className="px-4 py-3 text-center w-24">
                              <label className="flex items-center justify-center gap-1 cursor-pointer">
                                <input type="checkbox" checked={hour3} onChange={e=>setHour3(e.target.checked)} className="rounded"/>
                                Hour-3
                              </label>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-borderLine">
                          {rosterLoading?<tr><td colSpan={6} className="p-8 text-center text-textMuted">Loading students...</td></tr>:records.length===0?<tr><td colSpan={6} className="p-8 text-center text-textMuted">No students enrolled for this subject.</td></tr>:records.map((r,idx)=>(
                            <tr key={r.roll_number} className={`hover:bg-surface-2 transition-colors ${!r.h1?'bg-rose-50/60 dark:bg-rose-950/20':''}`}>
                              <td className="px-4 py-3 text-center text-textMuted font-bold">{idx+1}</td>
                              <td className="px-4 py-3 font-mono font-black text-textPrimary">{r.roll_number}</td>
                              <td className="px-4 py-3 font-bold uppercase">{r.student_name||'—'}</td>
                              <td className="px-4 py-3 text-center"><input type="checkbox" checked={r.h1} onChange={e=>setRecords(p=>p.map(s=>s.roll_number===r.roll_number?{...s,h1:e.target.checked}:s))} className="w-4 h-4 rounded cursor-pointer"/></td>
                              <td className="px-4 py-3 text-center"><input type="checkbox" checked={r.h2} onChange={e=>setRecords(p=>p.map(s=>s.roll_number===r.roll_number?{...s,h2:e.target.checked}:s))} className="w-4 h-4 rounded cursor-pointer"/></td>
                              <td className="px-4 py-3 text-center"><input type="checkbox" checked={r.h3} onChange={e=>setRecords(p=>p.map(s=>s.roll_number===r.roll_number?{...s,h3:e.target.checked}:s))} className="w-4 h-4 rounded cursor-pointer"/></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="p-4 bg-surface-2 border-t border-borderLine flex items-center justify-between">
                      <span className="text-xs font-bold text-textSecondary">Total: {records.length} | Present: {presentCount} | Absent: {absentList.length}</span>
                      <button onClick={()=>setShowAbsentModal(true)} className="px-5 py-2.5 bg-[#007bff] hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow-sm">Review & Submit Attendance</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── NOT POSTED ── */}
          {nav==='not_posted' && (
            <div className="space-y-4">
              <h2 className="text-base font-black text-textPrimary">Attendance Not Posted</h2>
              <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
                <div className="p-3 bg-[#343a40] text-white text-xs font-bold">Pending Sessions ({notPosted.length})</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-surface-2 text-textSecondary font-bold text-[10px] uppercase border-b border-borderLine">
                      <tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Class</th><th className="px-4 py-2.5">Section</th><th className="px-4 py-2.5">Period</th><th className="px-4 py-2.5">Subject</th><th className="px-4 py-2.5 text-center">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-borderLine">
                      {notPosted.length===0?<tr><td colSpan={6} className="p-8 text-center text-emerald-600 font-bold">🎉 All attendance is up to date!</td></tr>:notPosted.map((slot:any,i:number)=>(
                        <tr key={i} className="hover:bg-surface-2">
                          <td className="px-4 py-3 font-bold">{slot.date}</td>
                          <td className="px-4 py-3 font-bold">{slot.semester_label}</td>
                          <td className="px-4 py-3 font-bold">{slot.section}</td>
                          <td className="px-4 py-3">Period {slot.period_start}</td>
                          <td className="px-4 py-3 font-bold text-brand-primary">{slot.subject_name}</td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={()=>{setSem(slot.semester_label);setSection(slot.section);setDate(slot.date);const m=mySubjects.find(s=>s.subject_name===slot.subject_name&&s.section===slot.section);if(m)setSubjectId(m.id);setIsLoaded(true);setNav('mark');}} className="px-3 py-1.5 bg-[#007bff] text-white text-[10px] font-bold rounded-lg hover:bg-blue-600">Mark Now</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── REPORTS ── */}
          {nav==='reports' && (
            <div className="space-y-4">
              <h2 className="text-base font-black text-textPrimary">My Attendance Reports</h2>
              <div className="bg-surface border border-borderLine rounded-2xl p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <select value={reportSubId} onChange={e=>setReportSubId(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                    <option value="All">All My Allotted Subjects</option>
                    {mySubjects.map(s=><option key={s.id} value={s.id}>{s.subject_name}</option>)}
                  </select>
                  <select value={reportSection} onChange={e=>setReportSection(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                    <option value="All">All Sections</option>
                    {['A','B','C','D'].map(s=><option key={s}>Section {s}</option>)}
                  </select>
                  <select className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none">
                    <option>Total Attendance</option><option>Daywise Attendance</option>
                  </select>
                  <button className="px-4 py-2 bg-[#007bff] text-white font-bold text-xs rounded-xl hover:bg-blue-600">Search</button>
                  <button onClick={()=>window.print()} className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#6c757d] text-white font-bold text-xs rounded-xl hover:bg-slate-600">
                    <Printer className="w-3.5 h-3.5"/>Print
                  </button>
                </div>
              </div>
              <div className="bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-200 px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-between">
                <span><b>Class:</b> All Classes</span><span><b>Subject:</b> All My Allotted Subjects</span><span><b>Section:</b> All Sections</span>
              </div>
              <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
                <div className="p-3 border-b border-borderLine font-bold text-xs">Total Attendance Summary</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#343a40] text-white font-bold">
                      <tr><th className="px-4 py-3 text-center w-12">S.No</th><th className="px-4 py-3">Roll No</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Section</th><th className="px-4 py-3 text-center">Total Hrs</th><th className="px-4 py-3 text-center">Present Hrs</th><th className="px-4 py-3 text-center">Percentage</th></tr>
                    </thead>
                    <tbody><tr><td colSpan={7} className="p-8 text-center text-textMuted">Select subject and click Search to load report.</td></tr></tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── TIMETABLE ── */}
          {nav==='timetable' && (
            <div className="space-y-4">
              <h2 className="text-base font-black text-textPrimary">My Weekly Timetable</h2>
              <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-[#343a40] text-white font-bold text-[10px] uppercase">
                      <tr><th className="px-4 py-3 border-r border-slate-600 w-28">Day</th>{[1,2,3,4,5,6,7].map(p=><th key={p} className="px-3 py-3 text-center border-r border-slate-600 min-w-[110px]"><div>Period {p}</div><div className="text-[9px] font-normal opacity-70">{PERIOD_TIMES[p]}</div></th>)}</tr>
                    </thead>
                    <tbody>
                      {DAYS.map(day=>(
                        <tr key={day} className="border-b border-borderLine">
                          <td className="px-4 py-2.5 font-bold bg-surface-2 border-r border-borderLine">{day}</td>
                          {[1,2,3,4,5,6,7].map(p=>{
                            const slot = (Array.isArray(rawTT)?rawTT:[]).find((t:TimetableEntry)=>t.day_of_week===day&&t.period_start===p&&t.faculty_email?.toLowerCase()===user?.email?.toLowerCase());
                            return <td key={p} className="px-2 py-2 border-r border-borderLine text-center">{slot?<div className="bg-brand-soft border border-brand-primary/20 rounded-xl p-2 text-[10px] font-bold text-brand-primary">{slot.subject_name}<div className="text-[9px] text-textMuted font-normal">Sec {slot.section}</div></div>:<span className="text-textMuted opacity-30 text-[10px]">—</span>}</td>;
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
      </div>

      {/* ── Absent Review Modal ── */}
      {showAbsentModal&&(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-borderLine rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-borderLine pb-3">
              <h3 className="text-sm font-black text-textPrimary flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-rose-500"/>Review Absentees</h3>
              <button onClick={()=>setShowAbsentModal(false)} className="text-textMuted hover:text-textPrimary text-lg">✕</button>
            </div>
            <div className="bg-rose-500 text-white rounded-2xl p-5 text-center shadow-md">
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">Total Absent Students</p>
              <h2 className="text-5xl font-black mt-1">{absentList.length}</h2>
            </div>
            <div>
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-wider mb-2">Absent Roll Numbers:</p>
              <div className="p-3 bg-surface-2 rounded-xl border border-borderLine max-h-40 overflow-y-auto flex flex-wrap gap-1.5">
                {absentList.length===0?<p className="text-xs text-emerald-600 font-bold">✨ All present!</p>:absentList.map(s=><span key={s.roll_number} className="px-2.5 py-1 bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 font-mono font-black text-xs rounded-lg border border-rose-300">{s.roll_number}</span>)}
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-1">
              <button onClick={()=>setShowAbsentModal(false)} className="px-4 py-2 text-xs font-bold text-textSecondary hover:bg-surface-2 rounded-xl border border-borderLine">Go Back</button>
              <button onClick={()=>saveMutation.mutate()} disabled={saveMutation.isPending} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md disabled:opacity-60">
                {saveMutation.isPending?'Saving...':'Confirm & Save Attendance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
