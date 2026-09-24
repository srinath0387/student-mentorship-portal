import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LogIn, 
  Search, 
  ChevronDown, 
  Lock, 
  User, 
  Mail, 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  Sparkles, 
  CheckCircle2, 
  Building2, 
  GraduationCap, 
  Users, 
  Briefcase, 
  Award, 
  AlertCircle,
  Loader2,
  UserPlus,
  X
} from 'lucide-react';
import { AuthAnimated3DBackground } from './AuthAnimated3DBackground';
import { Footer } from '../../components/layout/Footer';
import { UserRole } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { cognitoForgotPassword, cognitoConfirmPassword } from '../../lib/cognitoAuth';
import { VALID_DEPARTMENT_NAMES, getDeptFromRollNumber, RGMCET_EMAIL_REGEX } from '../../lib/validation/auth';

interface RoleOption {
  id: UserRole;
  title: string;
  category: 'staff_student' | 'oversight';
  icon: React.FC<{ className?: string }>;
  accentColor: string;
  badge?: string;
  description: string;
  defaultEmail?: string;
}

const ALL_ROLES: RoleOption[] = [
  // ── Staff & Student Logins ──
  {
    id: 'student',
    title: 'Student',
    category: 'staff_student',
    icon: GraduationCap,
    accentColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    description: 'Access academic records, attendance, mentorship & coding stats',
  },
  {
    id: 'parent',
    title: 'Parent',
    category: 'staff_student',
    icon: Users,
    accentColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    description: 'Track student academic progress, attendance & mentor reviews',
  },
  {
    id: 'faculty',
    title: 'Faculty',
    category: 'staff_student',
    icon: Briefcase,
    accentColor: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    description: 'Post attendance, manage mentees & update subject duties',
    defaultEmail: 'faculty@rgmcet.edu.in',
  },
  {
    id: 'hod',
    title: 'Head of Department (HOD)',
    category: 'staff_student',
    icon: Building2,
    accentColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    description: 'Departmental analytics, faculty management & approvals',
    defaultEmail: 'hcse@rgmcet.edu.in',
  },
  {
    id: 'coordinator',
    title: '1st Year Coordinator',
    category: 'staff_student',
    icon: Award,
    accentColor: 'text-pink-400 bg-pink-500/10 border-pink-500/30',
    description: 'First year induction, student sectioning & class incharges',
    defaultEmail: 'fycoordinator@rgmcet.edu.in',
  },
  {
    id: 'admin',
    title: 'Institutional Admin',
    category: 'staff_student',
    icon: ShieldCheck,
    accentColor: 'text-teal-400 bg-teal-500/10 border-teal-500/30',
    description: 'Full portal management, user permissions & system settings',
    defaultEmail: 'admin@rgmcet.edu.in',
  },

  // ── Institutional Oversight (View Only) ──
  {
    id: 'management',
    title: 'Management Board',
    category: 'oversight',
    icon: Building2,
    accentColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
    badge: 'View Only',
    description: 'Executive institutional governance, performance & compliance',
    defaultEmail: 'management@rgmcet.edu.in',
  },
  {
    id: 'principal',
    title: 'Principal',
    category: 'oversight',
    icon: Award,
    accentColor: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
    badge: 'View Only',
    description: 'Academic oversight, institute-wide metrics & faculty reports',
    defaultEmail: 'principal@rgmcet.edu.in',
  },
  {
    id: 'director',
    title: 'Director',
    category: 'oversight',
    icon: ShieldCheck,
    accentColor: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
    badge: 'View Only',
    description: 'Strategic direction, college-wide analytics & research index',
    defaultEmail: 'director@rgmcet.edu.in',
  },
  {
    id: 'program_chair',
    title: 'Program Chair (CSE & Allied)',
    category: 'oversight',
    icon: Sparkles,
    accentColor: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
    badge: 'View Only',
    description: 'Oversight across CSE, AI & ML, Data Science, CS & BS',
    defaultEmail: 'chaircse@rgmcet.edu.in',
  },
];

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, registerSession } = useAuth();

  // Dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [roleSearch, setRoleSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleOption | null>(ALL_ROLES[0]); // Default to Student

  // Form Fields State
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedDept, setSelectedDept] = useState('CSE (Data Science)');
  const [studentYearMode, setStudentYearMode] = useState<'regular' | 'fresher'>('regular');
  const [fresherDob, setFresherDob] = useState('');

  // UI status
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Forgot Password Modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<'email' | 'otp' | 'success'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [showForgotNewPw, setShowForgotNewPw] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter roles based on search
  const filteredRoles = useMemo(() => {
    if (!roleSearch.trim()) return ALL_ROLES;
    const q = roleSearch.toLowerCase();
    return ALL_ROLES.filter(r => 
      r.title.toLowerCase().includes(q) || 
      r.description.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q)
    );
  }, [roleSearch]);

  const staffStudentRoles = useMemo(() => 
    filteredRoles.filter(r => r.category === 'staff_student'), 
  [filteredRoles]);

  const oversightRoles = useMemo(() => 
    filteredRoles.filter(r => r.category === 'oversight'), 
  [filteredRoles]);

  // Handle role selection
  const handleSelectRole = (role: RoleOption) => {
    setSelectedRole(role);
    setIsDropdownOpen(false);
    setRoleSearch('');
    setErrorMessage(null);

    // Set default hints or reset fields
    if (role.id === 'hod') {
      setIdentifier('hcse@rgmcet.edu.in');
    } else if (role.defaultEmail) {
      setIdentifier(role.defaultEmail);
    } else {
      setIdentifier('');
    }
    setPassword('');
  };

  // ── Forgot Password Handlers ──
  const openForgotModal = () => {
    setForgotEmail(identifier.trim() || '');
    setForgotStep('email');
    setForgotOtp('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setForgotError(null);
    setForgotSuccess(null);
    setShowForgotModal(true);
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = forgotEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setForgotError('Please enter a valid email address.');
      return;
    }
    setForgotLoading(true);
    setForgotError(null);
    try {
      await cognitoForgotPassword(email);
      setForgotStep('otp');
      setForgotSuccess(`OTP sent to ${email}. Check your inbox & spam folder.`);
    } catch (err: any) {
      setForgotError(err?.message || 'Failed to send OTP. Please check your email and try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotOtp.trim()) { setForgotError('Please enter the OTP sent to your email.'); return; }
    if (!forgotNewPassword || forgotNewPassword.length < 8) { setForgotError('New password must be at least 8 characters.'); return; }
    if (forgotNewPassword !== forgotConfirmPassword) { setForgotError('Passwords do not match.'); return; }
    setForgotLoading(true);
    setForgotError(null);
    try {
      await cognitoConfirmPassword(forgotEmail.trim().toLowerCase(), forgotOtp.trim(), forgotNewPassword);
      setForgotStep('success');
      setForgotSuccess('Password reset successfully! You can now log in with your new password.');
    } catch (err: any) {
      setForgotError(err?.message || 'Failed to reset password. Verify the OTP and try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  // Submit Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    setIsLoading(true);
    setErrorMessage(null);

    const trimmedId = identifier.trim();
    const trimmedPass = password.trim();

    try {
      // ── 1. Student Login ──
      if (selectedRole.id === 'student') {
        if (studentYearMode === 'fresher') {
          // 1st Year Fresher Login
          if (!trimmedId) throw new Error('Please enter your Admission Number or Username.');
          if (!fresherDob && !trimmedPass) throw new Error('Please enter your Date of Birth or Password.');

          const payload = {
            admission_id: trimmedId,
            dob: fresherDob || undefined,
            password: trimmedPass || undefined,
          };

          const res = await api.fresherLogin(payload);
          if (res.valid && res.student) {
            login(res.student.email || `${res.student.roll_number.toLowerCase()}@rgmcet.edu.in`, 'student', res.student.roll_number, res.student.name, undefined, res.student.department);
            await registerSession(res.student.email || res.student.roll_number, 'student');
            navigate('/dashboard');
            return;
          }
          throw new Error(res.error || 'Invalid fresher credentials.');
        } else {
          // Regular 2nd-4th Year Student — email-based login via backend AdminInitiateAuth
          if (!trimmedId) throw new Error('Please enter your college email (e.g. 23091a3227@rgmcet.edu.in).');
          if (!trimmedPass) throw new Error('Please enter your Password.');

          // Accept either email or raw roll number — auto-convert roll to email
          const emailInput = trimmedId.includes('@')
            ? trimmedId.toLowerCase()
            : `${trimmedId.toLowerCase()}@rgmcet.edu.in`;

          if (!RGMCET_EMAIL_REGEX.test(emailInput)) {
            throw new Error('Please enter a valid @rgmcet.edu.in email address.');
          }

          // Use backend AdminInitiateAuth — works for ALL users regardless of Cognito username format
          const tokens = await api.cognitoSignInViaBackend(emailInput, trimmedPass);
          const rollFromEmail = emailInput.split('@')[0].toUpperCase();
          const dept = getDeptFromRollNumber(rollFromEmail);

          // Fetch DB profile for name
          let student: any = null;
          try { student = await api.getStudentByEmail(emailInput); } catch { /* silent */ }
          if (!student) {
            try { student = await api.getStudentProfile(rollFromEmail); } catch { /* silent */ }
          }

          const studentName = student?.name || rollFromEmail;
          const studentRoll = student?.roll_number || rollFromEmail;
          const studentDept = student?.department || dept || 'CSE (Data Science)';

          login(emailInput, 'student', studentRoll, studentName, tokens.idToken, studentDept);
          await registerSession(emailInput, 'student');
          navigate('/dashboard');
          return;
        }
      }

      // ── 2. Parent Login ──
      if (selectedRole.id === 'parent') {
        if (!trimmedId) throw new Error('Please enter the Student Roll Number.');
        if (!trimmedPass) throw new Error('Please enter your Password.');

        const rollUpper = trimmedId.toUpperCase();
        const dept = getDeptFromRollNumber(rollUpper);
        login(`parent_${rollUpper.toLowerCase()}@rgmcet.edu.in`, 'parent', rollUpper, `Parent of ${rollUpper}`, undefined, dept);
        await registerSession(`parent_${rollUpper.toLowerCase()}`, 'parent');
        navigate('/dashboard');
        return;
      }

      // ── 3. Faculty Login — backend AdminInitiateAuth (resolves UUID usernames) ──
      if (selectedRole.id === 'faculty') {
        if (!trimmedId) throw new Error('Please enter your official email address.');
        if (!trimmedPass) throw new Error('Please enter your password.');

        try {
          const tokens = await api.cognitoSignInViaBackend(trimmedId, trimmedPass);
          let faculty: any = null;
          try { faculty = await api.getFacultyByEmail(trimmedId); } catch { /* silent */ }
          const facDept = faculty?.department || selectedDept;
          const facName = faculty?.name || trimmedId.split('@')[0];
          login(trimmedId, 'faculty', faculty?.faculty_id, facName, tokens.idToken, facDept);
          await registerSession(trimmedId, 'faculty');
          navigate('/faculty/dashboard');
          return;
        } catch (facErr: any) {
          const msg = facErr?.message || '';
          if (msg.includes('Incorrect username or password') || msg.includes('NotAuthorizedException')) {
            throw new Error('Incorrect email or password. Please check your credentials.');
          }
          throw new Error(msg || 'Authentication failed. Please verify your credentials.');
        }
      }

      // ── 4. HOD / Coordinator / Admin / Oversight Roles ──
      if (!trimmedId) throw new Error('Please enter your official email address.');
      if (!trimmedPass) throw new Error('Please enter your password.');

      const adminRes = await api.adminLogin(trimmedId, trimmedPass, selectedDept);
      if (adminRes.valid) {
        const assignedRole = (adminRes.role as UserRole) || selectedRole.id;
        const isSuperAdmin = Boolean(adminRes.isSuperAdmin);
        const assignedDept = adminRes.department || selectedDept;

        login(adminRes.email || trimmedId, assignedRole, undefined, adminRes.name || assignedRole.toUpperCase(), undefined, assignedDept, isSuperAdmin);
        await registerSession(adminRes.email || trimmedId, assignedRole);

        if (['director', 'principal', 'management', 'program_chair'].includes(assignedRole)) {
          navigate('/oversight/dashboard');
        } else if (assignedRole === 'coordinator') {
          navigate('/coordinator/dashboard');
        } else if (assignedRole === 'admin') {
          navigate('/admin/dashboard');
        } else if (assignedRole === 'hod') {
          navigate('/hod/dashboard');
        } else if (assignedRole === 'faculty') {
          navigate('/faculty/dashboard');
        } else {
          navigate('/dashboard');
        }
        return;
      }

      throw new Error(adminRes.error || 'Invalid credentials. Please check your email and password.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between overflow-y-auto relative text-slate-100 selection:bg-brand-primary selection:text-white">
      {/* ── Fixed Animated 3D Background Layer ── */}
      <AuthAnimated3DBackground />

      {/* ── Top Header Brand ── */}
      <div className="z-10 relative pt-6 sm:pt-8 pb-3 px-4 text-center max-w-4xl mx-auto shrink-0">
        <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/95 p-1.5 shadow-2xl shadow-cyan-500/20 mb-3 ring-2 ring-white/20 backdrop-blur-md overflow-hidden hover:scale-105 transition-transform duration-300">
          <img
            src="/rgmcet-crest.png"
            alt="RGM Official Institutional Crest"
            className="w-full h-full object-contain filter drop-shadow-md"
          />
        </div>

        {/* Brand Title: RGM ManageBAC */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-wider flex items-center justify-center gap-1.5 flex-wrap">
          <span className="text-white font-black drop-shadow-sm">RGM</span>
          <span className="text-cyan-400 font-black drop-shadow-[0_0_16px_rgba(56,217,232,0.9)] tracking-tight">Manage</span>
          <span className="text-white font-bold tracking-normal">BAC</span>
        </h1>

        <p className="mt-2.5 text-xs sm:text-[13px] text-slate-200/90 font-medium max-w-2xl mx-auto leading-relaxed px-2">
          A digital initiative by the institute facilitating Faculty, Staff, Students and Parents to access and process Academics, Research, Supporting services at one common platform.
        </p>
      </div>

      {/* ── Main Unified Login Container ── */}
      <main className="z-10 relative flex-1 max-w-xl w-full mx-auto px-4 py-4 flex flex-col justify-center items-center">
        <div className="w-full bg-slate-900/80 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/60 relative overflow-hidden">
          {/* Subtle Top Accent Line */}
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-cyan-500 via-indigo-500 to-brand-primary" />

          {/* ── Searchable / Typeahead Role Selector Dropdown ── */}
          <div className="relative mb-6" ref={dropdownRef}>
            <label className="block text-[11px] font-black uppercase tracking-widest text-slate-300 mb-2">
              Select Your Role to Login
            </label>

            <button
              type="button"
              onClick={() => {
                setIsDropdownOpen(!isDropdownOpen);
                setTimeout(() => searchInputRef.current?.focus(), 50);
              }}
              className="w-full flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-left transition-all group focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
            >
              <div className="flex items-center gap-3 min-w-0">
                {selectedRole ? (
                  <>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${selectedRole.accentColor}`}>
                      <selectedRole.icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-white truncate">{selectedRole.title}</span>
                        {selectedRole.badge && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold shrink-0">
                            {selectedRole.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 truncate">{selectedRole.description}</p>
                    </div>
                  </>
                ) : (
                  <span className="text-sm text-slate-400 font-semibold">Choose your role...</span>
                )}
              </div>
              <ChevronDown className={`w-5 h-5 text-slate-300 shrink-0 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180 text-cyan-400' : ''}`} />
            </button>

            {/* Dropdown Menu Modal */}
            {isDropdownOpen && (
              <div className="absolute top-full inset-x-0 mt-2 bg-slate-950/95 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-[400px] flex flex-col animate-in fade-in zoom-in-95 duration-150">
                {/* Typeahead Search Input */}
                <div className="p-3 border-b border-white/10 bg-slate-900/90 shrink-0 z-10 flex items-center gap-2">
                  <Search className="w-4 h-4 text-cyan-400 shrink-0 ml-1" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={roleSearch}
                    onChange={(e) => setRoleSearch(e.target.value)}
                    placeholder="Search roles (e.g. Program Chair, Faculty, Student)..."
                    className="w-full bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none font-medium"
                  />
                  {roleSearch && (
                    <button type="button" onClick={() => setRoleSearch('')} className="text-slate-400 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Role List with Categories */}
                <div className="overflow-y-auto flex-1 min-h-0 p-2 space-y-3">
                  {/* Category 1: Staff & Student Logins */}
                  {staffStudentRoles.length > 0 && (
                    <div>
                      <div className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Staff &amp; Student Logins
                      </div>
                      <div className="space-y-1 mt-1">
                        {staffStudentRoles.map((role) => (
                          <button
                            key={role.id}
                            type="button"
                            onClick={() => handleSelectRole(role)}
                            className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all ${
                              selectedRole?.id === role.id 
                                ? 'bg-cyan-500/20 text-white border border-cyan-500/40' 
                                : 'hover:bg-white/10 text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${role.accentColor}`}>
                                <role.icon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">{role.title}</p>
                                <p className="text-[10px] text-slate-400 truncate">{role.description}</p>
                              </div>
                            </div>
                            {selectedRole?.id === role.id && (
                              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 ml-2" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Category 2: Institutional Oversight (View Only) */}
                  {oversightRoles.length > 0 && (
                    <div className="pt-2 border-t border-white/10">
                      <div className="px-3 py-1 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-indigo-400">
                        <span>Institutional Oversight</span>
                        <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold">View Only</span>
                      </div>
                      <div className="space-y-1 mt-1">
                        {oversightRoles.map((role) => (
                          <button
                            key={role.id}
                            type="button"
                            onClick={() => handleSelectRole(role)}
                            className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all ${
                              selectedRole?.id === role.id 
                                ? 'bg-indigo-500/20 text-white border border-indigo-500/40' 
                                : 'hover:bg-white/10 text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${role.accentColor}`}>
                                <role.icon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-bold text-white truncate">{role.title}</p>
                                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                    View Only
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-400 truncate">{role.description}</p>
                              </div>
                            </div>
                            {selectedRole?.id === role.id && (
                              <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0 ml-2" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredRoles.length === 0 && (
                    <div className="p-6 text-center text-xs text-slate-400">
                      No matching roles found for "{roleSearch}"
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Dynamic Form Fields for Selected Role ── */}
          {selectedRole && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {/* Student Segment Toggle */}
              {selectedRole.id === 'student' && (
                <div className="flex rounded-xl bg-white/10 p-1 border border-white/15">
                  <button
                    type="button"
                    onClick={() => {
                      setStudentYearMode('regular');
                      setErrorMessage(null);
                    }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      studentYearMode === 'regular'
                        ? 'bg-brand-primary text-white shadow-md'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Regular (2nd – 4th Year)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentYearMode('fresher');
                      setErrorMessage(null);
                    }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      studentYearMode === 'fresher'
                        ? 'bg-brand-primary text-white shadow-md'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    1st Year / Freshers
                  </button>
                </div>
              )}

              {/* Oversight Notice Banner */}
              {selectedRole.category === 'oversight' && (
                <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-500/30 flex items-center gap-2 text-xs text-indigo-200">
                  <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Executive Oversight Access &bull; Full data visibility with view-only protection</span>
                </div>
              )}

              {/* Identifier Input Field */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  {selectedRole.id === 'student' 
                    ? (studentYearMode === 'fresher' ? 'Admission ID / Username / Mobile' : 'College Email (@rgmcet.edu.in)')
                    : selectedRole.id === 'parent' 
                      ? 'Student Roll Number / Registered Mobile'
                      : 'Official Email Address'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    {selectedRole.id === 'parent' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                  </div>
                  <input
                    type={selectedRole.id === 'student' && studentYearMode === 'regular' ? 'email' : 'text'}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={
                      selectedRole.id === 'student' 
                        ? (studentYearMode === 'fresher' ? 'e.g. 24091A0501 or 9876543210' : 'e.g. 23091a3227@rgmcet.edu.in')
                        : selectedRole.id === 'parent'
                          ? 'e.g. 21091A3201'
                          : selectedRole.defaultEmail || 'name@rgmcet.edu.in'
                    }
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                  />
                </div>
                {selectedRole.id === 'student' && studentYearMode === 'regular' && (
                  <p className="text-[10px] text-slate-400 mt-1 ml-1">
                    Enter your college email — same as your roll number (e.g. <span className="text-cyan-400 font-mono">23091a3227@rgmcet.edu.in</span>)
                  </p>
                )}
              </div>

              {/* Department Selector (for HOD, Admin, or Faculty) */}
              {(selectedRole.id === 'hod' || selectedRole.id === 'admin' || selectedRole.id === 'faculty') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                    Department
                  </label>
                  <select
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    aria-label="Department Selection"
                    className="w-full px-3.5 py-3 rounded-xl bg-slate-900 border border-white/20 text-white text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                  >
                    {VALID_DEPARTMENT_NAMES.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Password or DOB Field */}
              {selectedRole.id === 'student' && studentYearMode === 'fresher' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-200">
                      Date of Birth (DOB) or Password
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={fresherDob}
                      onChange={(e) => setFresherDob(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                    />
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password (if set)"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-200">
                      Password
                    </label>
                    {selectedRole.id === 'student' && (
                      <button
                        type="button"
                        onClick={openForgotModal}
                        className="text-[11px] text-cyan-400 hover:underline font-semibold"
                      >
                        Forgot password?
                      </button>
                    )}
                    {selectedRole.id === 'faculty' && (
                      <button
                        type="button"
                        onClick={openForgotModal}
                        className="text-[11px] text-purple-400 hover:underline font-semibold"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Error Alert */}
              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 flex items-start gap-2 text-xs text-red-200">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-brand-primary text-white font-black text-sm shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Login as {selectedRole.title}</span>
                  </>
                )}
              </button>

              {/* Registration Links */}
              {selectedRole.id === 'student' && studentYearMode === 'regular' && (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => navigate('/login?role=student&signup=true')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 hover:underline transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    New here? Create a Student Account
                  </button>
                </div>
              )}
              {selectedRole.id === 'faculty' && (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => navigate('/login?role=faculty&signup=true')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-400 hover:text-purple-300 hover:underline transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    New Faculty Member? Register Here
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </main>

      {/* ── Glassmorphism Tagline Banner ── */}
      <div className="w-full shrink-0 flex items-center justify-center py-2 z-10 relative">
        <div className="auth-glass-tag px-6 py-1.5 rounded-xl backdrop-blur-xl bg-white/10 border border-white/15 shadow-sm">
          <div className="auth-tag-crossfade">
            <span className="auth-tag-item text-xs font-extrabold tracking-wide bg-gradient-to-r from-cyan-400 via-indigo-300 to-sky-400 bg-clip-text text-transparent">
              RGM ManageBAC &bull; Next-Generation Academic Platform ✨
            </span>
          </div>
        </div>
      </div>

      {/* ── Global Footer ── */}
      <div className="z-10 relative">
        <Footer />
      </div>

      {/* ── Faculty Forgot Password Modal ── */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowForgotModal(false)}
          />

          {/* Modal Card */}
          <div className="relative z-10 w-full max-w-sm bg-slate-900/95 border border-white/15 rounded-2xl shadow-2xl p-6 backdrop-blur-xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Reset Password</h3>
                  <p className="text-[10px] text-slate-400">{selectedRole?.id === 'student' ? 'Student Account Recovery' : 'Faculty Account Recovery'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-1.5 mb-5">
              {(['email', 'otp', 'success'] as const).map((step, i) => (
                <div key={step} className="flex items-center gap-1.5 flex-1">
                  <div className={`h-1 flex-1 rounded-full transition-all ${
                    forgotStep === 'success' || (forgotStep === 'otp' && i < 2) || (forgotStep === 'email' && i < 1)
                      ? 'bg-purple-500' : 'bg-white/15'
                  }`} />
                </div>
              ))}
            </div>

            {/* Error / Success alerts */}
            {forgotError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 mb-4 text-xs text-red-300">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{forgotError}</span>
              </div>
            )}
            {forgotSuccess && forgotStep !== 'success' && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 mb-4 text-xs text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{forgotSuccess}</span>
              </div>
            )}

            {/* Step 1 — Email */}
            {forgotStep === 'email' && (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <p className="text-xs text-slate-400">Enter your registered email. We'll send a 6-digit OTP to your inbox.</p>
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">{selectedRole?.id === 'student' ? 'Student Email' : 'Faculty Email'}</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder={selectedRole?.id === 'student' ? 'e.g. 23091a3201@rgmcet.edu.in' : 'yourname@rgmcet.edu.in'}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
                >
                  {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {forgotLoading ? 'Sending OTP...' : 'Send OTP'}
                </button>
              </form>
            )}

            {/* Step 2 — OTP + New Password */}
            {forgotStep === 'otp' && (
              <form onSubmit={handleConfirmReset} className="space-y-4">
                <p className="text-xs text-slate-400">Enter the 6-digit code sent to <span className="text-purple-300 font-semibold">{forgotEmail}</span> and choose a new password.</p>
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">OTP Code</label>
                  <input
                    type="text"
                    value={forgotOtp}
                    onChange={e => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit code"
                    maxLength={6}
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 text-sm font-mono tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type={showForgotNewPw ? 'text' : 'password'}
                      value={forgotNewPassword}
                      onChange={e => setForgotNewPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                      required
                    />
                    <button type="button" onClick={() => setShowForgotNewPw(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                      {showForgotNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="password"
                      value={forgotConfirmPassword}
                      onChange={e => setForgotConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setForgotStep('email'); setForgotError(null); setForgotSuccess(null); }}
                    className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-sm font-bold transition-all"
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
                  >
                    {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {forgotLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 3 — Success */}
            {forgotStep === 'success' && (
              <div className="text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white mb-1">Password Reset!</p>
                  <p className="text-xs text-slate-400">You can now log in with your new password.</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowForgotModal(false); setForgotStep('email'); }}
                  className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold transition-all"
                >
                  Back to Login
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;
