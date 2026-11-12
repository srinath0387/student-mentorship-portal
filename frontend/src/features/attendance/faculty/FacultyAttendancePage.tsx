import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Users, Calendar, CheckCircle2, Clock, FileText, AlertTriangle, Printer, LayoutDashboard, Check, Lock } from 'lucide-react';
import { api } from '../../../lib/api';
import { SubjectAllotment, SubjectRosterEntry, TimetableEntry, SemesterLabel } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { LiveCodePanel } from './LiveCodePanel';

const ALL_SEMESTERS: SemesterLabel[] = ['1-1','1-2','2-1','2-2','3-1','3-2','4-1','4-2'];
const PERIOD_TIMES: Record<number,string> = {
  1:'09:00–09:50',2:'09:50–10:40',3:'10:55–11:45',
  4:'11:45–12:35',5:'01:50–02:40',6:'02:40–03:30',7:'03:30–04:20'
};
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

type NavId = 'dashboard'|'mark'|'not_posted'|'reports'|'timetable'|'students';

// Local (IST) calendar date — toISOString() is UTC and shows yesterday before 05:30 IST
const localToday = () => new Date().toLocaleDateString('en-CA');

export const FacultyAttendancePage: React.FC = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [nav, setNav] = useState<NavId>('dashboard');

  // Mark Attendance State
  const [sem, setSem] = useState<SemesterLabel|''>('');
  const [section, setSection] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState(localToday());
  const [isLoaded, setIsLoaded] = useState(false);
  // Period chosen from the Not Posted list (a subject can have two periods on one day)
  const [preferredPeriod, setPreferredPeriod] = useState<number | null>(null);
  const [showLiveCode, setShowLiveCode] = useState(false);
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

  // Fetch allotted subjects strictly for the logged-in faculty
  const { data: rawSubjects = [], refetch: refetchSubjects } = useQuery({
    queryKey: ['mySubjectsAll', user?.email, user?.department],
    queryFn: async () => {
      try {
        const res = await api.getMyAttendanceSubjects();
        return Array.isArray(res) ? res : [];
      } catch (e) {
        console.warn('my-subjects fetch error:', e);
        return [];
      }
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
  // ATT-BUG-03 fix: filter rawSubjectTT to only slots where faculty_email matches the logged-in user
  // (rawSubjectTT fetches by semester+section so it may include other faculty's slots)
  const myTimetable = useMemo(() => {
    const emailMatched = Array.isArray(rawTT) ? rawTT : [];
    const subjectMatched = Array.isArray(rawSubjectTT)
      ? rawSubjectTT.filter((t: any) =>
          !t.faculty_email ||
          t.faculty_email.toLowerCase().trim() === (user?.email || '').toLowerCase().trim()
        )
      : [];
    // Co-faculty lab slots are shown in the timetable but never used for taking attendance
    const combined = [...emailMatched.filter((t: any) => !t.is_co_faculty)];
    for (const t of subjectMatched) {
      if (!combined.find((m: any) => m.id === t.id)) combined.push(t);
    }
    return combined;
  }, [rawTT, rawSubjectTT, user?.email]);

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

  // Labs where I am the co-faculty (view only — the main faculty posts attendance)
  const coFacultySlots = useMemo(() => (Array.isArray(rawTT) ? rawTT : []).filter((t: any) => t.is_co_faculty), [rawTT]);

  const todaySlots = useMemo(() => {
    return myTimetable.filter((t: TimetableEntry) => t.day_of_week === todayDay);
  }, [myTimetable, todayDay]);

  // Timetable slots belonging to the active subject: same subject, section and semester.
  // (Matching on the faculty email alone picked ANY of the faculty's classes that day, so attendance
  // could be saved against another subject's period.)
  const isActiveSubjectSlot = (t: any) => Boolean(activeSubject) &&
    t.subject_name?.toLowerCase().trim() === activeSubject!.subject_name?.toLowerCase().trim() &&
    (!t.section || t.section.toUpperCase() === activeSubject!.section?.toUpperCase()) &&
    (!t.semester_label || t.semester_label === activeSubject!.semester_label);

  // Find matching scheduled timetable entry for the active subject on the selected date
  const matchedSlot = useMemo(() => {
    if (!activeSubject) return null;
    const candidates = myTimetable.filter((t: any) => t.day_of_week === selectedDay && isActiveSubjectSlot(t));
    const me = user?.email?.toLowerCase().trim();
    return (preferredPeriod !== null && candidates.find((t: any) => Number(t.period_start) === preferredPeriod))
      || candidates.find((t: any) => t.faculty_email?.toLowerCase().trim() === me) || candidates[0] || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTimetable, activeSubject, selectedDay, user?.email, preferredPeriod]);

  // Days when this subject is officially scheduled in the timetable
  const scheduledDays = useMemo(() => {
    if (!activeSubject) return [];
    return Array.from(new Set(myTimetable.filter((t: any) => isActiveSubjectSlot(t)).map((t: any) => t.day_of_week)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTimetable, activeSubject]);

  const isUnscheduledDay = scheduledDays.length > 0 && !scheduledDays.includes(selectedDay);

  // Sessions already posted for THIS class period. A multi-hour class is stored either as one
  // session covering every hour, or as one session per hour when students attended only some hours.
  const basePeriod = Number(matchedSlot?.period_start) || 1;
  const classSessions = useMemo(
    () => sessions.filter((s: any) => {
      const ps = Number(s.period_start);
      return ps >= basePeriod && ps < basePeriod + 3;
    }),
    [sessions, basePeriod]
  );
  const existingSession = classSessions.find((s: any) => Number(s.period_start) === basePeriod) || classSessions[0] || null;
  const isPosted = classSessions.length > 0;

  const { data: sessionDetailsList } = useQuery({
    queryKey: ['sessionDetails', classSessions.map((s: any) => s.id).join(',')],
    queryFn: () => Promise.all(classSessions.map((s: any) =>
      api.getSessionDetails(s.id).then((d: any) => ({ session: s, records: Array.isArray(d?.records) ? d.records : [] })).catch(() => ({ session: s, records: [] }))
    )),
    enabled: classSessions.length > 0,
  });
  // roll → [hour1, hour2, hour3] presence reconstructed from the saved session(s)
  const savedPresence = useMemo(() => {
    const map = new Map<string, (boolean | undefined)[]>();
    for (const d of sessionDetailsList || []) {
      const start = Number(d.session.period_start) - basePeriod;
      const span = Math.max(1, Number(d.session.num_periods) || 1);
      for (const r of d.records) {
        const roll = String(r.roll_number || '').toUpperCase().trim();
        const arr = map.get(roll) || [undefined, undefined, undefined];
        for (let k = start; k < start + span && k < 3; k++) if (k >= 0) arr[k] = Boolean(r.is_present);
        map.set(roll, arr);
      }
    }
    return map;
  }, [sessionDetailsList, basePeriod]);
  const sessionDetailsLoaded = !isPosted || Array.isArray(sessionDetailsList);

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

  // ATT-BUG-04 fix: reset hour toggles whenever subject changes so lab hours don't bleed into theory
  useEffect(() => {
    setHour1(true); setHour2(false); setHour3(false);
  }, [subjectId]);

  // Not posted
  // Last 14 days of my classes that still have no attendance
  const notPostedFrom = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 13); return d.toLocaleDateString('en-CA'); }, []);
  const {data:rawNotPosted={}} = useQuery({ queryKey:['notPosted',user?.email,notPostedFrom], queryFn:()=>api.getNotPostedAttendance({faculty_email:user?.email, from: notPostedFrom, to: localToday()}).catch(()=>({})) });
  // The API returns { byDate: [{ date, pendingSlots: [...] }] }
  const notPosted: any[] = useMemo(() => {
    const days: any[] = Array.isArray((rawNotPosted as any)?.byDate) ? (rawNotPosted as any).byDate : [];
    return days
      .flatMap((d: any) => (Array.isArray(d.pendingSlots) ? d.pendingSlots : []).map((slot: any) => ({ ...slot, date: d.date })))
      .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)) || Number(a.period_start) - Number(b.period_start));
  }, [rawNotPosted]);

  useEffect(()=>{
    if(!isLoaded) return;
    if(roster.length===0) return;
    if(isPosted&&sessionDetailsLoaded&&savedPresence.size>0){
      setRecords(roster.map(s=>{
        const roll = (s.roll_number||'').toUpperCase().trim();
        const saved = savedPresence.get(roll);
        // An hour with no saved value inherits the first saved hour; a student not in the session defaults to present
        const first = saved ? (saved.find(v => v !== undefined) ?? true) : true;
        const h = [0, 1, 2].map(k => (saved && saved[k] !== undefined ? saved[k]! : first));
        const od = Boolean((s as any).is_on_od);
        return {
          roll_number: s.roll_number,
          student_name: s.student_name,
          is_on_od: od,
          od_type: (s as any).od_type || '',
          od_reason: (s as any).od_reason || '',
          h1: od ? true : h[0],
          h2: od ? true : h[1],
          h3: od ? true : h[2]
        };
      }));
    } else if(!isPosted) {
      // Only reset to all-present when session does NOT exist yet (fresh mark)
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
    // Note: if isPosted but sessionDetails not loaded yet, don't reset — wait for it
  },[roster,isPosted,savedPresence,sessionDetailsLoaded,isLoaded]);

  const totalActiveHours = (hour1?1:0) + (hour2?1:0) + (hour3?1:0) || 1;

  // Academic-calendar lock: outside the semester, posting needs an admin-approved request
  const { data: postingWindow } = useQuery({
    queryKey: ['postingWindow', date],
    queryFn: () => api.getPostingWindow(date).catch(() => null),
    enabled: Boolean(date),
  });
  const { data: myLateRequests } = useQuery({
    queryKey: ['myLatePostRequests'],
    queryFn: () => api.getLatePostRequests('all').catch(() => ({ requests: [] })),
    enabled: Boolean(postingWindow?.locked),
  });
  const lateRequest = (Array.isArray(myLateRequests?.requests) ? myLateRequests.requests : [])
    .find((r: any) => String(r.allotment_id) === String(subjectId) && String(r.session_date).slice(0, 10) === date) || null;
  const postingLocked = Boolean(postingWindow?.locked) && lateRequest?.status !== 'Approved';
  const [lateReason, setLateReason] = useState('');
  const lateMutation = useMutation({
    mutationFn: () => api.requestLatePost({ allotment_id: subjectId, session_date: date, reason: lateReason }),
    onSuccess: () => {
      setLateReason('');
      qc.invalidateQueries({ queryKey: ['myLatePostRequests'] });
      setFeedback({ type: 'success', text: 'Request sent to the admin. You can post once it is approved.' });
      setTimeout(() => setFeedback(null), 5000);
    },
    onError: (err: any) => setFeedback({ type: 'error', text: err.message || 'Could not send the request.' }),
  });

  const saveMutation = useMutation({
    mutationFn:async()=>{
      if(!subjectId) throw new Error('No subject selected');
      if(isNonWorkingDay && !allowOverrideExtraClass) {
        throw new Error(`Cannot post attendance on ${isSunday ? 'Sunday' : currentHoliday?.title}: Non-working day. Enable 'Special / Extra Class' override if authorized.`);
      }
      if(postingLocked) {
        throw new Error(postingWindow?.message || 'This date is outside the academic calendar. Request admin approval first.');
      }
      if(isPosted && date !== localToday()) {
        throw new Error('Editing is permitted only on the same date attendance was posted. Please contact your HOD or Admin for past-date corrections.');
      }

      // Hours being marked (offsets from the class's first period)
      const offsets = [hour1 ? 0 : -1, hour2 ? 1 : -1, hour3 ? 2 : -1].filter(k => k >= 0);
      if (offsets.length === 0) offsets.push(0);
      const presence = (r: typeof records[number], k: number) => r.is_on_od ? true : (k === 0 ? r.h1 : k === 1 ? r.h2 : r.h3);
      // Same answer for every hour → one session covering all hours; otherwise one session per hour,
      // so a student who attended 1 of 2 lab hours is stored as 1/2 (not 2/2 or 0/2).
      const uniform = records.every(r => offsets.every(k => presence(r, k) === presence(r, offsets[0])));
      const targets = uniform
        ? [{ period: basePeriod + offsets[0], n: offsets.length, rows: records.map(r => ({ roll_number: r.roll_number, is_present: presence(r, offsets[0]) })) }]
        : offsets.map(k => ({ period: basePeriod + k, n: 1, rows: records.map(r => ({ roll_number: r.roll_number, is_present: presence(r, k) })) }));

      // Remove previously saved sessions for this class that the new layout replaces
      for (const old of classSessions) {
        const keep = targets.some(t => t.period === Number(old.period_start) && t.n === Math.max(1, Number(old.num_periods) || 1));
        if (!keep) await api.deleteAttendanceSession(old.id);
      }
      let last: any = null;
      for (const t of targets) {
        const same = classSessions.find((old: any) => Number(old.period_start) === t.period && Math.max(1, Number(old.num_periods) || 1) === t.n);
        last = same
          ? await api.updateAttendanceSession(same.id, t.rows)
          : await api.saveAttendanceSession({ allotment_id: subjectId, session_date: date, num_periods: t.n, period_start: t.period, records: t.rows });
      }
      return last;
    },
    onSuccess:()=>{
      qc.invalidateQueries({queryKey:['sessions']});
      qc.invalidateQueries({queryKey:['sessionDetails']});
      qc.invalidateQueries({queryKey:['notPosted']});
      qc.invalidateQueries({queryKey:['dailyPeriodGrid']});
      qc.invalidateQueries({queryKey:['attendanceAllotments']});
      qc.invalidateQueries({queryKey:['subjectSummary']});
      // ATT-BUG-01 fix: also invalidate roster so OD status updates are reflected
      qc.invalidateQueries({queryKey:['roster', subjectId, date]});
      setShowAbsentModal(false);
      setFeedback({type:'success',text:'Attendance saved successfully!'});
      setTimeout(()=>setFeedback(null),4000);
    },
    onError:(err:any)=>setFeedback({type:'error',text:err.message||'Failed to save.'})
  });

  // ATT-BUG-06 fix: absent = missing h1 for all; for lab (hour2/hour3 active) also check h2/h3
  // A student is absent if they miss at least one active period
  const absentList = records.filter(r => !r.is_on_od && (!r.h1 || (hour2 && !r.h2) || (hour3 && !r.h3)));
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
    {id:'students',label:'My Students',icon:<Users className="w-4 h-4 text-sky-400"/>},
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
              {nav==='students'&&'My Students'}
            </h1>
          </div>
          <span className="text-xs text-textSecondary font-bold">{user?.name} ({user?.department})</span>
        </header>

        {/* Mobile: the side menu is hidden below md, so show the sections as a scrollable tab bar */}
        <div className="md:hidden flex gap-1.5 overflow-x-auto px-3 py-2 border-b border-borderLine bg-surface">
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => setNav(item.id)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold ${nav === item.id ? 'bg-brand-primary text-white' : 'text-textSecondary bg-surface-2'}`}>
              {item.label}{item.id === 'not_posted' && notPosted.length > 0 ? ` (${notPosted.length})` : ''}
            </button>
          ))}
        </div>

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
                        let m = mySubjects.find(s =>
                          s.subject_name?.toLowerCase().trim() === slot.subject_name?.toLowerCase().trim() &&
                          (!slot.section || s.section === slot.section)
                        );
                        if (!m) {
                          m = mySubjects.find(s =>
                            s.subject_name?.toLowerCase().includes(slot.subject_name?.toLowerCase()) ||
                            slot.subject_name?.toLowerCase().includes(s.subject_name?.toLowerCase())
                          );
                        }
                        // BUG-12 fix: do NOT silently fall back to wrong subject — warn instead
                        if (!m) {
                          alert(`No matching subject found for "${slot.subject_name}". Please select your subject manually in the Mark Attendance tab.`);
                          setNav('mark');
                          return;
                        }
                        if (m) setSubjectId(m.id);
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
                      setPreferredPeriod(null);
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
                      {isPosted&&<div className="text-[11px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-950/40 px-3 py-1 rounded-lg border border-amber-300">✏️ Edit Mode — Attendance already posted. Changes will overwrite.</div>}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button onClick={()=>setRecords(p=>p.map(r=>({...r,h1:true,h2:true,h3:true})))} className="px-3 py-1.5 bg-[#28a745] text-white font-bold text-xs rounded-lg hover:bg-green-600">All Present</button>
                      <button onClick={()=>setRecords(p=>p.map(r=>r.is_on_od ? r : ({...r,h1:false,h2:false,h3:false})))} className="px-3 py-1.5 bg-[#dc3545] text-white font-bold text-xs rounded-lg hover:bg-red-600">All Absent</button>
                      <button onClick={()=>setShowLiveCode(true)} disabled={!subjectId || postingLocked} className="px-3 py-1.5 bg-brand-primary text-white font-bold text-xs rounded-lg disabled:opacity-40">📡 Live code</button>
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
                    {postingWindow?.locked && (
                      <div className="p-4 border-t border-borderLine bg-amber-500/10 space-y-2">
                        <p className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-start gap-2">
                          <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{postingWindow.message}</span>
                        </p>
                        {lateRequest?.status === 'Approved' ? (
                          <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">Admin approved posting for this class on {date}. You can submit now.</p>
                        ) : lateRequest?.status === 'Pending' ? (
                          <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">Your request is waiting for admin approval.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {lateRequest?.status === 'Rejected' && (
                              <p className="w-full text-[11px] font-bold text-rose-700">Previous request rejected{lateRequest.reject_reason ? `: ${lateRequest.reject_reason}` : ''}. You can ask again.</p>
                            )}
                            <input value={lateReason} onChange={e => setLateReason(e.target.value)} placeholder="Reason (e.g. extra class after semester end)"
                              className="flex-1 min-w-[200px] px-3 py-2 text-xs rounded-xl border border-borderLine bg-background" />
                            <button disabled={!subjectId || lateMutation.isPending} onClick={() => lateMutation.mutate()}
                              className="px-3 py-2 text-xs font-bold rounded-xl bg-amber-600 text-white disabled:opacity-50">
                              {lateMutation.isPending ? 'Sending…' : 'Request admin approval'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="p-4 bg-surface-2 border-t border-borderLine flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-bold text-textSecondary">Total: {records.length} | Present: {presentCount} {odCount>0&&`(${odCount} on OD)`} | Absentees: {absentList.length}</span>
                      <button
                        onClick={()=>setShowAbsentModal(true)}
                        disabled={(isNonWorkingDay && !allowOverrideExtraClass) || postingLocked}
                        className={`px-5 py-2.5 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm ${isPosted ? 'bg-amber-600 hover:bg-amber-500' : 'bg-[#007bff] hover:bg-blue-600'}`}
                      >
                        {isPosted ? `✏️ Review & Update Attendance (${totalActiveHours} Hr${totalActiveHours>1?'s':''})` : `Review & Submit Attendance (${totalActiveHours} Hr${totalActiveHours>1?'s':''})`}
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
                            <button onClick={()=>{setPreferredPeriod(Number(slot.period_start)||null);setSem(slot.semester_label);setSection(slot.section);setDate(slot.date);const m=mySubjects.find(s=>s.subject_name===slot.subject_name&&s.section===slot.section&&(!slot.semester_label||s.semester_label===slot.semester_label));if(m)setSubjectId(m.id);setIsLoaded(true);setNav('mark');}} className="px-3 py-1.5 bg-[#007bff] text-white text-[10px] font-bold rounded-lg hover:bg-blue-600">Mark Now</button>
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

          {/* ── MY STUDENTS ── */}
          {nav==='students' && <MyStudentsPanel subjects={mySubjects} />}

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
                            const slot = myTimetable.find((t: TimetableEntry) => 
                              t.day_of_week === day && 
                              t.period_start === p
                            );
                            const coSlot = !slot ? coFacultySlots.find((t: any) => t.day_of_week === day && t.period_start === p) : null;
                            return (
                              <td key={p} className="px-2 py-2 border-r border-borderLine text-center">
                                {coSlot ? (
                                  <div className="w-full text-left rounded-xl p-2 border border-dashed border-purple-400/50 bg-purple-500/5"
                                    title={`Co-faculty for ${coSlot.subject_name}. Attendance is posted by ${coSlot.main_faculty_name || 'the main faculty'}.`}>
                                    <div className="text-[10px] font-bold text-purple-700 dark:text-purple-300">{coSlot.subject_name}</div>
                                    <div className="text-[9px] text-textMuted mt-0.5">Sec {coSlot.section} • P{coSlot.period_start}{coSlot.num_periods > 1 ? `–${coSlot.period_start + coSlot.num_periods - 1}` : ''}</div>
                                    <div className="text-[9px] font-bold text-purple-600 dark:text-purple-400 mt-0.5">Co-faculty</div>
                                  </div>
                                ) : slot ? (
                                  <button
                                    onClick={() => {
                                      if (slot.semester_label) setSem(slot.semester_label as any);
                                      if (slot.section) setSection(slot.section);
                                      let m = mySubjects.find(s => 
                                        s.subject_name?.toLowerCase().trim() === slot.subject_name?.toLowerCase().trim() && 
                                        (!slot.section || s.section === slot.section)
                                      );
                                      if (!m) {
                                        m = mySubjects.find(s => 
                                          s.subject_name?.toLowerCase().includes(slot.subject_name?.toLowerCase()) || 
                                          slot.subject_name?.toLowerCase().includes(s.subject_name?.toLowerCase())
                                        );
                                      }
                                      // No fallback to an unrelated subject — that opened attendance for the wrong class
                                      if (m) setSubjectId(m.id);
                                      setIsLoaded(true);
                                      setNav('mark');
                                    }}
                                    className="w-full text-left bg-brand-soft hover:bg-brand-primary hover:text-white transition-all border border-brand-primary/20 rounded-xl p-2 group cursor-pointer shadow-xs"
                                    title={`Click to mark attendance for ${slot.subject_name}`}
                                  >
                                    <div className="text-[10px] font-bold text-brand-primary group-hover:text-white transition-colors">{slot.subject_name}</div>
                                    <div className="text-[9px] text-textMuted group-hover:text-white/80 font-normal mt-0.5">Sec {slot.section} • P{slot.period_start}</div>
                                  </button>
                                ) : (
                                  <span className="text-textMuted opacity-30 text-[10px]">—</span>
                                )}
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
      </div>

      {showLiveCode && subjectId && (
        <LiveCodePanel
          allotmentId={subjectId}
          sessionDate={date}
          periodStart={basePeriod}
          numPeriods={totalActiveHours}
          subjectLabel={`${activeSubject?.subject_name || ''} · ${activeSubject?.semester_label || ''} ${activeSubject?.section || ''}`}
          onClose={() => setShowLiveCode(false)}
          onResult={(rolls) => {
            const set = new Set(rolls.map(r => r.toUpperCase()));
            setRecords(p => p.map(r => r.is_on_od ? r : ({ ...r, h1: set.has(r.roll_number.toUpperCase()), h2: set.has(r.roll_number.toUpperCase()), h3: set.has(r.roll_number.toUpperCase()) })));
            setShowLiveCode(false);
            setFeedback({ type: 'success', text: `${set.size} students checked in. Review the list and submit.` });
            setTimeout(() => setFeedback(null), 6000);
          }}
        />
      )}

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
              <button onClick={()=>saveMutation.mutate()} disabled={saveMutation.isPending} className={`px-5 py-2.5 font-bold text-xs rounded-xl shadow-md disabled:opacity-60 text-white ${isPosted ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
                {saveMutation.isPending ? 'Saving...' : isPosted ? '✏️ Update Attendance' : 'Confirm & Save Attendance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Students on the rolls of each subject/section allotted to the faculty member
function MyStudentsPanel({ subjects }: { subjects: SubjectAllotment[] }) {
  const [selected, setSelected] = useState<string>('');
  const [q, setQ] = useState('');
  const active = subjects.find(s => s.id === selected) || subjects[0] || null;
  const { data: rawRoster = [], isLoading } = useQuery({
    queryKey: ['myStudentsRoster', active?.id],
    queryFn: () => (active ? api.getRoster(active.id).catch(() => []) : Promise.resolve([])),
    enabled: Boolean(active),
  });
  const roster: any[] = Array.isArray(rawRoster) ? rawRoster : [];
  const shown = roster.filter(r => !q || String(r.roll_number).toLowerCase().includes(q.toLowerCase()) || String(r.student_name || '').toLowerCase().includes(q.toLowerCase()));

  if (subjects.length === 0) {
    return <div className="p-8 text-center text-xs text-textMuted bg-surface border border-borderLine rounded-2xl">No subjects are allotted to you yet. Ask your HOD or admin to assign subjects.</div>;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {subjects.map(s => (
          <button key={s.id} onClick={() => setSelected(s.id)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border ${active?.id === s.id ? 'bg-brand-primary text-white border-brand-primary' : 'bg-surface border-borderLine text-textSecondary'}`}>
            {s.subject_name} · {s.semester_label} {s.section}
          </button>
        ))}
      </div>
      <div className="bg-surface border border-borderLine rounded-2xl overflow-hidden">
        <div className="p-3 flex flex-wrap items-center gap-2 border-b border-borderLine">
          <span className="text-xs font-black text-textPrimary mr-auto">{active?.subject_name} · {active?.semester_label} Section {active?.section} — {roster.length} students</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search roll no. or name" className="px-3 py-1.5 text-xs rounded-lg border border-borderLine bg-background" />
        </div>
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-surface-2 text-textSecondary font-bold text-[10px] uppercase border-b border-borderLine sticky top-0">
              <tr><th className="px-4 py-2.5">#</th><th className="px-4 py-2.5">Roll No.</th><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">On roll from</th></tr>
            </thead>
            <tbody className="divide-y divide-borderLine">
              {isLoading ? <tr><td colSpan={4} className="p-8 text-center text-textMuted">Loading students…</td></tr>
                : shown.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-textMuted">{roster.length === 0 ? 'No students on this roll yet. Ask the admin to assign students.' : 'No match.'}</td></tr>
                : shown.map((r, i) => (
                  <tr key={r.roll_number} className="hover:bg-surface-2">
                    <td className="px-4 py-2 text-textMuted">{i + 1}</td>
                    <td className="px-4 py-2 font-mono font-bold text-textPrimary">{r.roll_number}</td>
                    <td className="px-4 py-2 text-textSecondary">{r.student_name || '—'}</td>
                    <td className="px-4 py-2 text-textMuted">{r.joining_date ? String(r.joining_date).slice(0, 10) : 'Semester start'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
