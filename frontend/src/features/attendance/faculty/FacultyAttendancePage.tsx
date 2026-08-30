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
  const [records, setRecords] = useState<{
    roll_number: string;
    student_name?: string;
    is_on_od?: boolean;
    od_type?: string;
    od_reason?: string;
    h1: boolean;
    h2: boolean;
    h3: boolean;
  }[]>([]);
  const [showAbsentModal, setShowAbsentModal] = useState(false);
  const [feedback, setFeedback] = useState<{type:'success'|'error';text:string}|null>(null);

  // Reports State
  const [reportSubId, setReportSubId] = useState('All');
  const [reportSection, setReportSection] = useState('All');

  // Fetch allotted subjects (with automatic fallback to getAllotments if needed)
  const { data: rawSubjects = [], refetch: refetchSubjects } = useQuery({
    queryKey: ['mySubjectsAll', user?.email, user?.department],
    queryFn: async () => {
      try {
        const res = await api.getMyAttendanceSubjects();
        if (Array.isArray(res) && res.length > 0) return res;
      } catch (e) {
        console.warn('my-subjects fetch error:', e);
      }
      try {
        const all = await api.getAllotments();
        if (Array.isArray(all) && all.length > 0) {
          const userEmail = (user?.email || '').toLowerCase().trim();
          const userPrefix = userEmail.includes('@') ? userEmail.split('@')[0] : '';
          const userName = (user?.name || '').toLowerCase().trim();
          const userDept = (user?.department || '').toLowerCase().trim();

          const matched = all.filter((a: any) => {
            const fEmail = (a.faculty_email || '').toLowerCase().trim();
            const fName = (a.faculty_name || '').toLowerCase().trim();
            const fDept = (a.department || '').toLowerCase().trim();

            if (userEmail && fEmail === userEmail) return true;
            if (userPrefix && userPrefix.length >= 3 && (fEmail.includes(userPrefix) || fName.includes(userPrefix))) return true;
            if (userName && (fName.includes(userName) || userName.includes(fName))) return true;
            if (userDept && fDept === userDept) return true;
            return false;
          });

          return matched.length > 0 ? matched : all;
        }
      } catch (e) {
        console.error('getAllotments fallback error:', e);
      }
      return [];
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const mySubjects: SubjectAllotment[] = Array.isArray(rawSubjects) ? rawSubjects : [];

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

  // Timetable — by faculty email
  const { data: rawTT = [] } = useQuery({
    queryKey: ['myWeeklyTimetable', user?.email],
    queryFn: () => api.getTimetable({ faculty_email: user?.email }).catch(() => [])
  });

  // Timetable — by subject section/semester (fallback when faculty email differs in timetable)
  const { data: rawSubjectTT = [] } = useQuery({
    queryKey: ['subjectWeeklyTimetable', activeSubject?.semester_label, activeSubject?.section],
    queryFn: () => activeSubject
      ? api.getTimetable({ semester: activeSubject.semester_label, section: activeSubject.section }).catch(() => [])
      : Promise.resolve([]),
    enabled: Boolean(activeSubject),
  });

  // Combined timetable: email-matched + subject/section-matched (dedup by id)
  const myTimetable = useMemo(() => {
    const emailMatched = Array.isArray(rawTT) ? rawTT : [];
    const subjectMatched = Array.isArray(rawSubjectTT) ? rawSubjectTT : [];
    const combined = [...emailMatched];
    for (const t of subjectMatched) {
      if (!combined.find((m: any) => m.id === t.id)) combined.push(t);
    }
    return combined;
  }, [rawTT, rawSubjectTT]);

  // Academic Holidays
  const { data: rawHolidays = [] } = useQuery({
    queryKey: ['academicHolidaysList'],
    queryFn: () => api.getHolidays().catch(() => [])
  });
  const holidays = Array.isArray(rawHolidays) ? rawHolidays : [];

  const selectedDay = useMemo(() => {
    if (!date) return 'Monday';
    const d = new Date(date + 'T12:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[d.getDay()] || 'Monday';
  }, [date]);

  const isSunday = selectedDay === 'Sunday';
  const currentHoliday = useMemo(() => {
    if (!date || !Array.isArray(holidays)) return null;
    return holidays.find((h: any) => (h.date?.split('T')[0] || h.holiday_date?.split('T')[0]) === date);
  }, [holidays, date]);
  const isNonWorkingDay = isSunday || Boolean(currentHoliday);
  const [allowOverrideExtraClass, setAllowOverrideExtraClass] = useState(false);

  const todayDay = useMemo(() => {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[new Date().getDay()] || 'Monday';
  }, []);

  const todaySlots = useMemo(() => {
    return myTimetable.filter((t: TimetableEntry) => t.day_of_week === todayDay);
  }, [myTimetable, todayDay]);

  // Find matching scheduled timetable entry for the active subject on the selected date
  const matchedSlot = useMemo(() => {
    if (!activeSubject) return null;
    return myTimetable.find((t: any) =>
      t.day_of_week === selectedDay &&
      (
        // Match by faculty email
        (t.faculty_email && t.faculty_email.toLowerCase().trim() === user?.email?.toLowerCase().trim()) ||
        // Match by subject name + section + semester (handles email mismatch)
        (
          t.subject_name?.toLowerCase().trim() === activeSubject.subject_name?.toLowerCase().trim() &&
          (!t.section || t.section.toUpperCase() === activeSubject.section?.toUpperCase()) &&
          (!t.semester_label || t.semester_label === activeSubject.semester_label)
        )
      )
    );
  }, [myTimetable, activeSubject, selectedDay, user?.email]);

  // Days when this subject is officially scheduled in the timetable
  const scheduledDays = useMemo(() => {
    if (!activeSubject) return [];
    return Array.from(new Set(
      myTimetable
        .filter((t: any) =>
          (
            (t.faculty_email && t.faculty_email.toLowerCase().trim() === user?.email?.toLowerCase().trim()) ||
            (
              t.subject_name?.toLowerCase().trim() === activeSubject.subject_name?.toLowerCase().trim() &&
              (!t.section || t.section.toUpperCase() === activeSubject.section?.toUpperCase()) &&
              (!t.semester_label || t.semester_label === activeSubject.semester_label)
            )
          )
        )
        .map((t: any) => t.day_of_week)
    ));
  }, [myTimetable, activeSubject, user?.email]);

  const isUnscheduledDay = scheduledDays.length > 0 && !scheduledDays.includes(selectedDay);

  // Dynamically set Hour checkboxes based on timetable scheduled duration (e.g. Mon: 1 hr, Wed: 2 hrs)
  useEffect(() => {
    if (matchedSlot) {
      const dur = matchedSlot.num_periods || 1;
      if (dur === 1) {
        setHour1(true); setHour2(false); setHour3(false);
      } else if (dur === 2) {
        setHour1(true); setHour2(true); setHour3(false);
      } else if (dur >= 3) {
        setHour1(true); setHour2(true); setHour3(true);
      }
    } else {
      setHour1(true); setHour2(false); setHour3(false);
    }
  }, [matchedSlot]);

  // Not posted
  const {data:rawNotPosted=[]} = useQuery({ queryKey:['notPosted',user?.email], queryFn:()=>api.getNotPostedAttendance({faculty_email:user?.email}).catch(()=>[]) });
  const notPosted = Array.isArray(rawNotPosted)?rawNotPosted:[];

  useEffect(()=>{
    if(!isLoaded) return;
    if(roster.length===0) return;
    if(isPosted&&sessionDetails?.records?.length>0){
      const map = new Map<string,boolean>();
      sessionDetails.records.forEach((r:any)=>map.set(r.roll_number,r.is_present));
      setRecords(roster.map(s=>({
        roll_number: s.roll_number,
        student_name: s.student_name,
        is_on_od: Boolean((s as any).is_on_od),
        od_type: (s as any).od_type || '',
        od_reason: (s as any).od_reason || '',
        h1: (s as any).is_on_od ? true : (map.get(s.roll_number)??true),
        h2: (s as any).is_on_od ? true : (map.get(s.roll_number)??true),
        h3: (s as any).is_on_od ? true : (map.get(s.roll_number)??true)
      })));
    } else {
      setRecords(roster.map(s=>({
        roll_number: s.roll_number,
        student_name: s.student_name,
        is_on_od: Boolean((s as any).is_on_od),
        od_type: (s as any).od_type || '',
        od_reason: (s as any).od_reason || '',
        h1: true,
        h2: true,
        h3: true
      })));
    }
  },[roster,isPosted,sessionDetails,isLoaded]);

  const totalActiveHours = (hour1?1:0) + (hour2?1:0) + (hour3?1:0) || 1;

  const saveMutation = useMutation({
    mutationFn:async()=>{
      if(!subjectId) throw new Error('No subject selected');
      if(isNonWorkingDay && !allowOverrideExtraClass) {
        throw new Error(`Cannot post attendance on ${isSunday ? 'Sunday' : currentHoliday?.title}: Non-working day. Enable 'Special / Extra Class' override if authorized.`);
      }
      const payload = {
        allotment_id: subjectId,
        session_date: date,
        num_periods: totalActiveHours,
        period_start: matchedSlot?.period_start || 1,
        records: records.map(r => ({
          roll_number: r.roll_number,
          is_present: r.is_on_od ? true : (hour1 ? (hour2 ? (hour3 ? (r.h1 && r.h2 && r.h3) : (r.h1 && r.h2)) : r.h1) : r.h1)
        }))
      };
      return isPosted&&existingSession?.id ? api.updateAttendanceSession(existingSession.id,payload.records) : api.saveAttendanceSession(payload);
    },
    onSuccess:()=>{ qc.invalidateQueries({queryKey:['sessions']}); qc.invalidateQueries({queryKey:['notPosted']}); setShowAbsentModal(false); setFeedback({type:'success',text:'Attendance saved successfully!'}); setTimeout(()=>setFeedback(null),4000); },
    onError:(err:any)=>setFeedback({type:'error',text:err.message||'Failed to save.'})
  });

  const absentList = records.filter(r=>!r.is_on_od && (!r.h1 || (hour2 && !r.h2) || (hour3 && !r.h3)));
  const odCount = records.filter(r=>r.is_on_od).length;
  const presentCount = records.length - absentList.length;

  // Reports state & handler
  const [reportData, setReportData] = useState<any>(null);
  const [reportDaywiseData, setReportDaywiseData] = useState<any>(null);
  const [reportMode, setReportMode] = useState<'total'|'daywise'>('total');
  const [matrixFormat, setMatrixFormat] = useState<'progressive'|'symbols'|'pa'>('progressive');
  const [isReportSearching, setIsReportSearching] = useState(false);
  const [reportSearchError, setReportSearchError] = useState<string|null>(null);

  const handleSearchReport = async () => {
    let subjectsToFetch = mySubjects;
    if (reportSubId && reportSubId !== 'All') {
      subjectsToFetch = mySubjects.filter(s => s.id === reportSubId);
    }
    if (reportSection && reportSection !== 'All') {
      const sectionFiltered = subjectsToFetch.filter(s => s.section === reportSection);
      if (sectionFiltered.length > 0) subjectsToFetch = sectionFiltered;
    }
    if (subjectsToFetch.length === 0 && mySubjects.length > 0) {
      subjectsToFetch = mySubjects;
    }
    if (subjectsToFetch.length === 0) {
      setReportSearchError('No subjects available. Please check allotments.');
      return;
    }
    const targetId = subjectsToFetch[0].id;
    setReportSubId(targetId);
    setIsReportSearching(true);
    setReportSearchError(null);
    try {
      const [summary, daywise] = await Promise.all([
        api.getSubjectSummary(targetId),
        api.getSubjectDaywiseAttendance(targetId).catch(() => null)
      ]);
      setReportData(summary);
      setReportDaywiseData(daywise);
    } catch (err: any) {
      setReportSearchError(err.message || 'Failed to fetch report.');
    } finally {
      setIsReportSearching(false);
    }
  };

  // Auto-load report when entering reports tab
  useEffect(() => {
    if (nav === 'reports' && mySubjects.length > 0 && !reportData && !isReportSearching) {
      handleSearchReport();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, mySubjects.length]);

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
        {/* Top Header */}
        <header className="p-4 border-b border-borderLine bg-surface flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-black text-textPrimary">
              {nav==='dashboard'&&'Faculty Attendance Dashboard'}
              {nav==='mark'&&'Take / Update Class Attendance'}
              {nav==='not_posted'&&'Attendance Not Posted'}
              {nav==='reports'&&'Attendance Reports & Daywise Register'}
              {nav==='timetable'&&'Weekly Timetable Schedule'}
            </h1>
          </div>
          <span className="text-xs text-textSecondary font-bold">{user?.name} ({user?.department})</span>
        </header>

        {feedback&&(
          <div className={`m-4 p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${feedback.type==='success'?'bg-emerald-100 text-emerald-800 border border-emerald-300':'bg-rose-100 text-rose-800 border border-rose-300'}`}>
            {feedback.type==='success'?<Check className="w-4 h-4"/>:<AlertTriangle className="w-4 h-4"/>}
            {feedback.text}
          </div>
        )}

        {/* Content */}
        <div className="p-4 md:p-6 space-y-6 flex-1 overflow-y-auto">

          {/* ── DASHBOARD ── */}
          {nav==='dashboard' && (
            <div className="space-y-5">
              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-sm">
                  <p className="text-[11px] font-bold text-textMuted uppercase">Allotted Subjects</p>
                  <h3 className="text-3xl font-black text-brand-primary mt-1">{mySubjects.length}</h3>
                  <p className="text-[10px] text-textMuted mt-1">{sections.length} Sections</p>
                </div>
                <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-sm">
                  <p className="text-[11px] font-bold text-textMuted uppercase">Today's Slots</p>
                  <h3 className="text-3xl font-black text-emerald-600 mt-1">{todaySlots.length}</h3>
                  <p className="text-[10px] text-textMuted mt-1">{todayDay}</p>
                </div>
                <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-sm">
                  <p className="text-[11px] font-bold text-textMuted uppercase">Pending Sessions</p>
                  <h3 className="text-3xl font-black text-amber-500 mt-1">{notPosted.length}</h3>
                  <p className="text-[10px] text-textMuted mt-1">To be posted</p>
                </div>
                <div className="bg-surface border border-borderLine rounded-2xl p-4 shadow-sm">
                  <p className="text-[11px] font-bold text-textMuted uppercase">Academic Term</p>
                  <h3 className="text-sm font-black text-textPrimary mt-2">Active Semester</h3>
                  <p className="text-[10px] text-textMuted mt-1">{user?.department || 'Department'}</p>
                </div>
              </div>

              {/* Quick Action Banner */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
                <div>
                  <h3 className="text-base font-black">Ready to take class attendance?</h3>
                  <p className="text-xs opacity-90 mt-0.5">Pick a subject from your schedule or select class and section below.</p>
                </div>
                <button onClick={()=>setNav('mark')} className="px-5 py-2.5 bg-white text-blue-700 font-black text-xs rounded-xl hover:bg-slate-50 transition-colors shrink-0 shadow-sm">
                  Take Attendance Now →
                </button>
              </div>

              {/* Today's Schedule */}
              <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-borderLine font-bold text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-brand-primary"/>Today's Schedule ({todayDay})</span>
                  <span className="text-[11px] text-textMuted font-normal">{todaySlots.length} classes scheduled</span>
                </div>
                <div className="divide-y divide-borderLine">
                  {todaySlots.length===0?(
                    <div className="p-8 text-center text-textMuted text-xs">No classes scheduled in timetable for today ({todayDay}).</div>
                  ):todaySlots.map((slot:TimetableEntry,i:number)=>(
                    <div key={i} className="p-4 flex items-center justify-between hover:bg-surface-2 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand-primary font-black text-xs flex items-center justify-center">
                          P{slot.period_start}
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-textPrimary">{slot.subject_name}</h4>
                          <p className="text-[10px] text-textMuted">{slot.semester_label} | Sec {slot.section} | {PERIOD_TIMES[slot.period_start]} ({slot.num_periods || 1} Hr{slot.num_periods && slot.num_periods > 1 ? 's' : ''})</p>
                        </div>
                      </div>
                      <button onClick={()=>{
                        if (slot.semester_label) setSem(slot.semester_label as any);
                        if (slot.section) setSection(slot.section);
                        const m=mySubjects.find(s=>s.subject_name===slot.subject_name&&s.section===slot.section);
                        if(m) setSubjectId(m.id);
                        setIsLoaded(true);
                        setNav('mark');
                      }} className="px-4 py-2 bg-brand-primary text-white font-bold text-xs rounded-xl hover:opacity-90 transition-opacity">
                        Mark Attendance
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── MARK ATTENDANCE ── */}
          {nav==='mark' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="bg-surface border border-borderLine rounded-2xl p-4 space-y-3">
                <h3 className="text-xs font-black text-textPrimary uppercase tracking-wider">Select Class & Subject</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <select 
                    value={sem} 
                    onChange={e => {
                      const newSem = e.target.value as any;
                      setSem(newSem);
                      setIsLoaded(false);
                      if (subjectId) {
                        const cur = mySubjects.find(s => s.id === subjectId);
                        if (cur && newSem && cur.semester_label !== newSem) setSubjectId('');
                      }
                    }} 
                    className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold"
                  >
                    <option value="">Select Class (All)</option>
                    {ALL_SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>

                  <select 
                    value={section} 
                    onChange={e => {
                      const newSec = e.target.value;
                      setSection(newSec);
                      setIsLoaded(false);
                      if (subjectId) {
                        const cur = mySubjects.find(s => s.id === subjectId);
                        if (cur && newSec && cur.section !== newSec) setSubjectId('');
                      }
                    }} 
                    className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold"
                  >
                    <option value="">Select Section (All)</option>
                    {sections.map(s => <option key={s} value={s}>Section {s}</option>)}
                  </select>

                  <select 
                    value={subjectId} 
                    onChange={e => {
                      const chosenId = e.target.value;
                      setSubjectId(chosenId);
                      setIsLoaded(false);
                      const chosen = mySubjects.find(s => s.id === chosenId);
                      if (chosen) {
                        if (chosen.semester_label) setSem(chosen.semester_label as any);
                        if (chosen.section) setSection(chosen.section);
                      }
                    }} 
                    className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold"
                  >
                    <option value="">Select Subject</option>
                    {filteredSubjects.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.subject_name} ({s.semester_label} - Sec {s.section})
                      </option>
                    ))}
                  </select>

                  <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold"/>
                  <button onClick={()=>{if(!subjectId){setFeedback({type:'error',text:'Select a subject first.'});return;}setIsLoaded(true);}} className="px-4 py-2 bg-[#007bff] hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow-sm">Load Students</button>
                </div>
              </div>

              {/* Sunday / Holiday Non-Working Day Warning Banner */}
              {isNonWorkingDay && (
                <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 p-4 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 font-black text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-600"/>
                    <span>Non-Working Day: {isSunday ? 'Today is Sunday (Institutional Holiday)' : `${currentHoliday.title} (${currentHoliday.type || 'Official Holiday'})`}</span>
                  </div>
                  <p className="text-[11px] opacity-90">Regular classes are not conducted on non-working days.</p>
                  <label className="flex items-center gap-2 text-xs font-bold text-rose-900 dark:text-rose-100 cursor-pointer pt-1">
                    <input type="checkbox" checked={allowOverrideExtraClass} onChange={e=>setAllowOverrideExtraClass(e.target.checked)} className="rounded"/>
                    Mark as Authorized Special / Compensatory Extra Class
                  </label>
                </div>
              )}

              {/* Timetable Schedule Mismatch Notice */}
              {isUnscheduledDay && !isNonWorkingDay && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0"/>
                  <span>Timetable Notice: '{activeSubject?.subject_name}' is scheduled on [<strong>{scheduledDays.join(', ')}</strong>]. No slot on {selectedDay}. This session will be recorded as an Extra / Compensatory Class.</span>
                </div>
              )}

              {isLoaded&&activeSubject&&(
                <div className="space-y-3">
                  {/* Info Strip */}
                  <div className="bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-200 p-4 rounded-2xl space-y-2">
                    <div className="text-xs font-bold flex flex-wrap gap-x-4 gap-y-1 items-center">
                      <span><b>Class:</b> {activeSubject.semester_label}</span><span>|</span>
                      <span><b>Section:</b> {activeSubject.section}</span><span>|</span>
                      <span><b>Subject:</b> {activeSubject.subject_name}</span><span>|</span>
                      <span><b>Date:</b> {date} ({selectedDay})</span>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center pt-1">
                      {matchedSlot ? (
                        <div className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/60 px-3 py-1 rounded-lg border border-indigo-300 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5"/> Timetable Slot: {matchedSlot.num_periods} Hour(s) on {selectedDay} (Period {matchedSlot.period_start})
                        </div>
                      ) : (
                        <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-300 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5"/> Custom Extra Session ({totalActiveHours} Hour(s))
                        </div>
                      )}
                      {odCount > 0 && (
                        <div className="text-[11px] font-bold text-purple-700 bg-purple-100 dark:bg-purple-950/60 px-3 py-1 rounded-lg border border-purple-300 flex items-center gap-1">
                          🔵 {odCount} Student{odCount>1?'s':''} on Approved On-Duty (OD)
                        </div>
                      )}
                      {isPosted&&<div className="text-[11px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-950/40 px-3 py-1 rounded-lg border border-amber-300">Already Posted — You can edit attendance</div>}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button onClick={()=>setRecords(p=>p.map(r=>({...r,h1:true,h2:true,h3:true})))} className="px-3 py-1.5 bg-[#28a745] text-white font-bold text-xs rounded-lg hover:bg-green-600">All Present</button>
                      <button onClick={()=>setRecords(p=>p.map(r=>r.is_on_od ? r : ({...r,h1:false,h2:false,h3:false})))} className="px-3 py-1.5 bg-[#dc3545] text-white font-bold text-xs rounded-lg hover:bg-red-600">All Absent</button>
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
                              <label className="flex items-center justify-center gap-1 cursor-pointer select-none">
                                <input type="checkbox" checked={hour1} onChange={e=>setHour1(e.target.checked)} className="rounded cursor-pointer"/>
                                Hour-1
                              </label>
                            </th>
                            {(hour2 || (matchedSlot?.num_periods || 0) >= 2) && (
                              <th className="px-4 py-3 text-center w-24">
                                <label className="flex items-center justify-center gap-1 cursor-pointer select-none">
                                  <input type="checkbox" checked={hour2} onChange={e=>setHour2(e.target.checked)} className="rounded cursor-pointer"/>
                                  Hour-2
                                </label>
                              </th>
                            )}
                            {(hour3 || (matchedSlot?.num_periods || 0) >= 3) && (
                              <th className="px-4 py-3 text-center w-24">
                                <label className="flex items-center justify-center gap-1 cursor-pointer select-none">
                                  <input type="checkbox" checked={hour3} onChange={e=>setHour3(e.target.checked)} className="rounded cursor-pointer"/>
                                  Hour-3
                                </label>
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-borderLine">
                          {rosterLoading?<tr><td colSpan={6} className="p-8 text-center text-textMuted">Loading students...</td></tr>:records.length===0?<tr><td colSpan={6} className="p-8 text-center text-textMuted">No students enrolled for this subject.</td></tr>:records.map((r,idx)=>(
                            <tr key={r.roll_number} className={`hover:bg-surface-2 transition-colors ${r.is_on_od ? 'bg-indigo-50/50 dark:bg-indigo-950/30' : (!r.h1 || (hour2 && !r.h2) || (hour3 && !r.h3))?'bg-rose-50/60 dark:bg-rose-950/20':''}`}>
                              <td className="px-4 py-3 text-center text-textMuted font-bold">{idx+1}</td>
                              <td className="px-4 py-3 font-mono font-black text-textPrimary">{r.roll_number}</td>
                              <td className="px-4 py-3 font-bold uppercase">
                                <div className="flex items-center gap-2">
                                  <span>{r.student_name||'—'}</span>
                                  {r.is_on_od && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-100 text-indigo-700 border border-indigo-300" title={r.od_reason || 'Approved OD'}>
                                      🔵 OD ({r.od_reason || 'On-Duty Approved'})
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <input type="checkbox" checked={r.is_on_od ? true : r.h1} disabled={r.is_on_od} onChange={e=>setRecords(p=>p.map(s=>s.roll_number===r.roll_number?{...s,h1:e.target.checked}:s))} className={`w-4 h-4 rounded ${r.is_on_od?'cursor-not-allowed opacity-80 accent-indigo-600':'cursor-pointer'}`}/>
                              </td>
                              {(hour2 || (matchedSlot?.num_periods || 0) >= 2) && (
                                <td className="px-4 py-3 text-center">
                                  <input type="checkbox" checked={r.is_on_od ? true : r.h2} disabled={r.is_on_od} onChange={e=>setRecords(p=>p.map(s=>s.roll_number===r.roll_number?{...s,h2:e.target.checked}:s))} className={`w-4 h-4 rounded ${r.is_on_od?'cursor-not-allowed opacity-80 accent-indigo-600':'cursor-pointer'}`}/>
                                </td>
                              )}
                              {(hour3 || (matchedSlot?.num_periods || 0) >= 3) && (
                                <td className="px-4 py-3 text-center">
                                  <input type="checkbox" checked={r.is_on_od ? true : r.h3} disabled={r.is_on_od} onChange={e=>setRecords(p=>p.map(s=>s.roll_number===r.roll_number?{...s,h3:e.target.checked}:s))} className={`w-4 h-4 rounded ${r.is_on_od?'cursor-not-allowed opacity-80 accent-indigo-600':'cursor-pointer'}`}/>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="p-4 bg-surface-2 border-t border-borderLine flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-bold text-textSecondary">Total: {records.length} | Present: {presentCount} {odCount>0&&`(${odCount} on OD)`} | Absentees: {absentList.length}</span>
                      <button 
                        onClick={()=>setShowAbsentModal(true)} 
                        disabled={isNonWorkingDay && !allowOverrideExtraClass}
                        className="px-5 py-2.5 bg-[#007bff] hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm"
                      >
                        Review & Submit Attendance ({totalActiveHours} Hr{totalActiveHours>1?'s':''})
                      </button>
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
              <div className="bg-surface border border-borderLine rounded-2xl p-4 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <select value={reportSubId} onChange={e=>setReportSubId(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
                    <option value="All">All My Allotted Subjects</option>
                    {mySubjects.map(s=><option key={s.id} value={s.id}>{s.subject_name} ({s.semester_label} - Sec {s.section})</option>)}
                  </select>
                  <select value={reportSection} onChange={e=>setReportSection(e.target.value)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
                    <option value="All">All Sections</option>
                    {['A','B','C','D'].map(s=><option key={s} value={s}>Section {s}</option>)}
                  </select>
                  <select value={reportMode} onChange={e=>setReportMode(e.target.value as any)} className="px-3 py-2 text-xs rounded-xl border border-borderLine bg-background focus:outline-none font-semibold">
                    <option value="total">📊 Total Summary Report</option>
                    <option value="daywise">📅 Daywise Attendance Matrix</option>
                  </select>
                  <button onClick={handleSearchReport} disabled={isReportSearching} className="px-4 py-2 bg-[#007bff] text-white font-bold text-xs rounded-xl hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {isReportSearching ? 'Loading…' : 'Search Records'}
                  </button>
                  <button onClick={()=>window.print()} className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#6c757d] text-white font-bold text-xs rounded-xl hover:bg-slate-600">
                    <Printer className="w-3.5 h-3.5"/>Print Report
                  </button>
                </div>
                {reportSearchError && <p className="text-xs font-bold text-rose-500">{reportSearchError}</p>}
              </div>

              {/* MODE 1: TOTAL ATTENDANCE SUMMARY */}
              {reportData && reportMode === 'total' && (
                <div className="space-y-4">
                  {/* Subject Overview Bar */}
                  <div className="bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-200 p-4 rounded-2xl flex flex-wrap gap-4 text-xs font-bold items-center justify-between">
                    <div>
                      <span><b>Subject:</b> {reportData.allotment?.subject_name}</span> · <span><b>Class:</b> {reportData.allotment?.semester_label}</span> · <span><b>Section:</b> {reportData.allotment?.section}</span>
                    </div>
                    <div className="flex gap-4">
                      <span>Total Sessions: <strong>{reportData.sessions_count || 0}</strong></span>
                      <span>Total Periods Held: <strong>{reportData.total_periods_held || 0}</strong></span>
                      <span>Enrolled Students: <strong>{reportData.total_students || 0}</strong></span>
                    </div>
                  </div>

                  {/* Students Attendance Table */}
                  <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-3 border-b border-borderLine font-bold text-xs flex items-center justify-between">
                      <span>Complete Student Attendance Register</span>
                      <span className="text-[11px] text-textMuted font-normal">{(reportData.students || []).length} students enrolled</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-[#343a40] text-white font-bold">
                          <tr>
                            <th className="px-4 py-3 text-center w-12">S.No</th>
                            <th className="px-4 py-3">Roll No</th>
                            <th className="px-4 py-3">Student Name</th>
                            <th className="px-4 py-3 text-center">Section</th>
                            <th className="px-4 py-3 text-center">Total Periods</th>
                            <th className="px-4 py-3 text-center">Present</th>
                            <th className="px-4 py-3 text-center">Percentage</th>
                            <th className="px-4 py-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-borderLine">
                          {(reportData.students || []).map((s:any, idx:number)=>(
                            <tr key={s.roll_number} className="hover:bg-surface-2 transition-colors">
                              <td className="px-4 py-3 text-center text-textMuted font-bold">{idx+1}</td>
                              <td className="px-4 py-3 font-mono font-black">{s.roll_number}</td>
                              <td className="px-4 py-3 font-bold uppercase">{s.student_name}</td>
                              <td className="px-4 py-3 text-center">{s.section || reportData.allotment?.section}</td>
                              <td className="px-4 py-3 text-center font-semibold">{s.periods_held}</td>
                              <td className="px-4 py-3 text-center font-bold text-emerald-600">{s.periods_attended}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`font-black ${s.percentage >= 75 ? 'text-emerald-600' : s.percentage >= 65 ? 'text-amber-500' : 'text-rose-600'}`}>
                                  {s.percentage}%
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.percentage >= 75 ? 'bg-emerald-100 text-emerald-700' : s.percentage >= 65 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                                  {s.percentage >= 75 ? 'Eligible' : s.percentage >= 65 ? 'Condonation' : 'Shortage'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* MODE 2: DAYWISE ATTENDANCE MATRIX */}
              {reportDaywiseData && reportMode === 'daywise' && (
                <div className="space-y-4">
                  <div className="bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-200 p-4 rounded-2xl flex flex-wrap gap-4 text-xs font-bold items-center justify-between">
                    <div>
                      <span><b>Subject:</b> {reportDaywiseData.allotment?.subject_name}</span> · <span><b>Class:</b> {reportDaywiseData.allotment?.semester_label}</span> · <span><b>Section:</b> {reportDaywiseData.allotment?.section}</span>
                    </div>
                    <div className="flex gap-4">
                      <span>Total Sessions Taken: <strong>{(reportDaywiseData.sessions || []).length}</strong></span>
                    </div>
                  </div>

                  <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-3 border-b border-borderLine font-bold text-xs flex flex-wrap items-center justify-between gap-3 bg-surface-2">
                      <span className="text-textPrimary font-black">Daywise Session Attendance Matrix</span>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 bg-surface border border-borderLine rounded-lg p-0.5 text-[11px]">
                          <button
                            onClick={() => setMatrixFormat('progressive')}
                            className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                              matrixFormat === 'progressive'
                                ? 'bg-brand-primary text-white shadow-xs'
                                : 'text-textSecondary hover:text-textPrimary'
                            }`}
                          >
                            1, 2, 3... (Progressive)
                          </button>
                          <button
                            onClick={() => setMatrixFormat('symbols')}
                            className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                              matrixFormat === 'symbols'
                                ? 'bg-brand-primary text-white shadow-xs'
                                : 'text-textSecondary hover:text-textPrimary'
                            }`}
                          >
                            ✓ / ✗ / OD (Symbols)
                          </button>
                          <button
                            onClick={() => setMatrixFormat('pa')}
                            className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                              matrixFormat === 'pa'
                                ? 'bg-brand-primary text-white shadow-xs'
                                : 'text-textSecondary hover:text-textPrimary'
                            }`}
                          >
                            P / A / OD
                          </button>
                        </div>
                        <div className="flex gap-2 text-[10px] items-center">
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">1, 2, 3 / P: Present</span>
                          <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">A / ✗: Absent</span>
                          <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">OD: On Duty</span>
                        </div>
                      </div>
                    </div>
                    <div className="overflow-x-auto max-h-[70vh]">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-[#343a40] text-white font-bold sticky top-0 z-10 text-[10px] uppercase">
                          <tr>
                            <th className="px-3 py-3 w-10 text-center border-r border-slate-600">#</th>
                            <th className="px-3 py-3 w-32 border-r border-slate-600">Roll No</th>
                            <th className="px-3 py-3 min-w-[140px] border-r border-slate-600">Name</th>
                            {(reportDaywiseData.sessions || []).map((sess: any, sIdx: number) => (
                              <th key={sess.id} className="px-2.5 py-3 text-center border-r border-slate-600 min-w-[75px]">
                                <div className="text-[10px] font-black text-amber-300">Class #{sIdx + 1}</div>
                                <div className="text-[10px]">{sess.session_date}</div>
                                <div className="text-[9px] font-normal opacity-80">P{sess.period_start} ({sess.num_periods || 1}h)</div>
                              </th>
                            ))}
                            <th className="px-3 py-3 text-center border-r border-slate-600">Held</th>
                            <th className="px-3 py-3 text-center border-r border-slate-600">Present</th>
                            <th className="px-3 py-3 text-center">Percentage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-borderLine font-mono">
                          {(reportDaywiseData.students || []).map((st: any, idx: number) => {
                            let runningAttended = 0;
                            return (
                              <tr key={st.roll_number} className="hover:bg-surface-2 transition-colors">
                                <td className="px-3 py-2.5 text-center text-textMuted font-bold border-r border-borderLine">{idx + 1}</td>
                                <td className="px-3 py-2.5 font-mono font-black border-r border-borderLine text-textPrimary">{st.roll_number}</td>
                                <td className="px-3 py-2.5 font-sans font-bold uppercase truncate max-w-[150px] border-r border-borderLine">{st.student_name}</td>
                                {(reportDaywiseData.sessions || []).map((sess: any) => {
                                  const rec = st.session_records ? st.session_records[sess.id] : null;
                                  const pCount = sess.num_periods || 1;
                                  let cell = null;

                                  if (rec) {
                                    if (rec.is_on_od) {
                                      runningAttended += pCount;
                                      cell = (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-300">
                                          OD
                                        </span>
                                      );
                                    } else if (rec.is_present) {
                                      runningAttended += pCount;
                                      if (matrixFormat === 'progressive') {
                                        cell = (
                                          <span className="px-2 py-0.5 rounded font-black text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60">
                                            {runningAttended}
                                          </span>
                                        );
                                      } else if (matrixFormat === 'symbols') {
                                        cell = <span className="text-emerald-600 font-black text-sm">✓</span>;
                                      } else {
                                        cell = <span className="text-emerald-600 font-black text-sm">P</span>;
                                      }
                                    } else {
                                      if (matrixFormat === 'symbols') {
                                        cell = <span className="text-rose-500 font-black text-sm">✗</span>;
                                      } else {
                                        cell = (
                                          <span className="px-2 py-0.5 rounded font-black text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/60">
                                            A
                                          </span>
                                        );
                                      }
                                    }
                                  } else {
                                    cell = <span className="text-textMuted opacity-30">—</span>;
                                  }

                                  return (
                                    <td key={sess.id} className="px-2 py-2.5 text-center border-r border-borderLine">
                                      {cell}
                                    </td>
                                  );
                                })}
                                <td className="px-3 py-2.5 text-center font-semibold border-r border-borderLine">{st.total_held}</td>
                                <td className="px-3 py-2.5 text-center font-bold text-emerald-600 border-r border-borderLine">{st.total_attended}</td>
                                <td className="px-3 py-2.5 text-center font-black font-sans">
                                  <span className={st.percentage >= 75 ? 'text-emerald-600' : st.percentage >= 65 ? 'text-amber-500' : 'text-rose-600'}>
                                    {st.percentage}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {!reportData && !isReportSearching && (
                <div className="p-12 text-center text-textMuted bg-surface border border-borderLine rounded-2xl">
                  Select a subject and click <strong>"Search Records"</strong> to view the detailed attendance report.
                </div>
              )}
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
