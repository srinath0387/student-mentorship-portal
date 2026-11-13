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
  X,
  ArrowLeft
} from 'lucide-react';
import { useLandingTheme } from '../../lib/pageTheme';
import { Footer } from '../../components/layout/Footer';
import { UserRole } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { cognitoSignIn, cognitoForgotPassword, cognitoConfirmPassword } from '../../lib/cognitoAuth';
import { VALID_DEPARTMENT_NAMES, getDeptFromRollNumber, RGMCET_EMAIL_REGEX, isStudentEmail } from '../../lib/validation/auth';
import { RoleCarousel, IdCardHeader } from './RoleCarousel';
import { RegisterPanel } from './RegisterPanel';

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
    accentColor: 'text-blue-600 bg-blue-50 border-blue-200',
    description: 'Access academic records, attendance, mentorship & coding stats',
  },
  {
    id: 'parent',
    title: 'Parent',
    category: 'staff_student',
    icon: Users,
    accentColor: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    description: 'Track student academic progress, attendance & mentor reviews',
  },
  {
    id: 'faculty',
    title: 'Faculty',
    category: 'staff_student',
    icon: Briefcase,
    accentColor: 'text-purple-600 bg-purple-50 border-purple-200',
    description: 'Post attendance, manage mentees & update subject duties',
    defaultEmail: 'faculty@rgmcet.edu.in',
  },
  {
    id: 'hod',
    title: 'Head of Department (HOD)',
    category: 'staff_student',
    icon: Building2,
    accentColor: 'text-amber-600 bg-amber-50 border-amber-200',
    description: 'Departmental analytics, faculty management & approvals',
    defaultEmail: 'hcse@rgmcet.edu.in',
  },
  {
    id: 'coordinator',
    title: '1st Year Coordinator',
    category: 'staff_student',
    icon: Award,
    accentColor: 'text-pink-600 bg-pink-50 border-pink-200',
    description: 'First year induction, student sectioning & class incharges',
    defaultEmail: 'fycoordinator@rgmcet.edu.in',
  },
  {
    id: 'admin',
    title: 'Institutional Admin',
    category: 'staff_student',
    icon: ShieldCheck,
    accentColor: 'text-teal-600 bg-teal-50 border-teal-200',
    description: 'Full portal management, user permissions & system settings',
    defaultEmail: 'admin@rgmcet.edu.in',
  },

  // ── Institutional Oversight ──
  {
    id: 'management',
    title: 'Management Board',
    category: 'oversight',
    icon: Building2,
    accentColor: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    description: 'Executive institutional governance, performance & compliance',
    defaultEmail: 'management@rgmcet.edu.in',
  },
  {
    id: 'principal',
    title: 'Principal',
    category: 'oversight',
    icon: Award,
    accentColor: 'text-cyan-600 bg-cyan-50 border-cyan-200',
    description: 'Academic oversight, institute-wide metrics & faculty reports',
    defaultEmail: 'principal@rgmcet.edu.in',
  },
  {
    id: 'director',
    title: 'Director',
    category: 'oversight',
    icon: ShieldCheck,
    accentColor: 'text-sky-600 bg-sky-50 border-sky-200',
    description: 'Strategic direction, college-wide analytics & research index',
    defaultEmail: 'director@rgmcet.edu.in',
  },
  {
    id: 'program_chair',
    title: 'Program Chair (CSE & Allied)',
    category: 'oversight',
    icon: Sparkles,
    accentColor: 'text-violet-600 bg-violet-50 border-violet-200',
    description: 'Oversight across CSE, AI & ML, Data Science, CS & BS',
    defaultEmail: 'chaircse@rgmcet.edu.in',
  },
];

export const LandingPage: React.FC = () => {
  useLandingTheme();
  const navigate = useNavigate();
  const { login, registerSession } = useAuth();

  // Role carousel state — the centred ID card is the selected role; 'flipped' shows its login form
  const [roleIndex, setRoleIndex] = useState(0);
  const [selectedRole, setSelectedRole] = useState<RoleOption | null>(ALL_ROLES[0]); // Default to Student
  const [flipped, setFlipped] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  // Faculty department is read from the faculty record; asked only when no record exists yet
  const [needDept, setNeedDept] = useState(false);

  // Form Fields State
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedDept, setSelectedDept] = useState('');
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
  // "not in directory" soft-state — email exists in DB but not in faculty directory
  const [forgotNotInDirectory, setForgotNotInDirectory] = useState(false);

  // Handle role selection (carousel)
  const handleSelectIndex = (i: number) => {
    setRoleIndex(i);
    setSelectedRole(ALL_ROLES[i]);
    setErrorMessage(null);
    setNeedDept(false);
    setSelectedDept('');
    // Always start blank — don't pre-fill credentials
    setIdentifier('');
    setPassword('');
  };
  const openCard = () => { setRegisterMode(false); setFlipped(true); };
  const closeCard = () => { setFlipped(false); setRegisterMode(false); setErrorMessage(null); setNeedDept(false); };

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
    setForgotNotInDirectory(false);
    const isStudent = selectedRole?.id === 'student' || selectedRole?.id === 'parent';
    try {
      await cognitoForgotPassword(email);
      setForgotStep('otp');
      setForgotSuccess(`OTP sent to ${email}. Check your inbox & spam folder.`);
    } catch (err: any) {
      const msg = err?.message || '';
      // If user does not exist in Cognito User Pool, auto-provision from DB directory
      if (
        msg.includes('Username/client id combination not found') ||
        msg.includes('UserNotFoundException') ||
        msg.includes('does not exist')
      ) {
        try {
          // Route to student or faculty provision endpoint based on role
          const syncRes = isStudent
            ? await api.provisionCognitoStudent(email)
            : await api.provisionCognitoFaculty(email);
          if (syncRes.success) {
            // Account now provisioned — retry sending OTP
            await cognitoForgotPassword(email);
            setForgotStep('otp');
            setForgotSuccess(`OTP sent to ${email}. Check your inbox & spam folder.`);
            return;
          }
        } catch { /* fall through to soft-state */ }

        // Could not provision — show soft recovery UI (don't block; they may already be in Cognito)
        setForgotNotInDirectory(true);
        return;
      }
      setForgotError(msg || 'Failed to send OTP. Please check your email and try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  // "Try OTP anyway" — skips provision check, goes straight to OTP step
  const handleForceOtpStep = async () => {
    const email = forgotEmail.trim().toLowerCase();
    setForgotLoading(true);
    setForgotError(null);
    setForgotNotInDirectory(false);
    try {
      await cognitoForgotPassword(email);
      setForgotStep('otp');
      setForgotSuccess(`OTP sent to ${email}. Check your inbox & spam folder.`);
    } catch (err: any) {
      setForgotError(err?.message || 'Could not send OTP. Please contact your administrator.');
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
            login(res.student.email || `${res.student.roll_number.toLowerCase()}@rgmcet.edu.in`, 'student', res.student.roll_number, res.student.name, res.token, res.student.department);
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

          // Guard: Reject faculty/staff emails attempting student login
          if (!isStudentEmail(emailInput)) {
            throw new Error('This appears to be a faculty or staff email. Please choose your staff card (Faculty, HOD, Admin) to log in.');
          }

          let jwtIdToken: string | undefined = undefined;
          try {
            const tokens = await api.cognitoSignInViaBackend(emailInput, trimmedPass);
            jwtIdToken = tokens.idToken;
          } catch (cognitoErr: any) {
            // Fallback: verify against student_passwords table in DB
            const serverAuth = await api.verifyStudentPassword(emailInput, trimmedPass).catch(() => null);
            if (!serverAuth?.valid) {
              throw cognitoErr;
            }
          }
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
          const studentDept = student?.department || (dept !== 'Unknown' ? dept : 'CSE (Data Science)');

          login(emailInput, 'student', studentRoll, studentName, jwtIdToken, studentDept);
          await registerSession(emailInput, 'student');
          navigate('/dashboard');
          return;
        }
      }

      // ── 2. Parent Login ──
      if (selectedRole.id === 'parent') {
        if (!trimmedId) throw new Error('Please enter the Student Roll Number.');
        if (!trimmedPass) throw new Error('Please enter your Password.');

        const rollUpper = (trimmedId.includes('@') ? trimmedId.split('@')[0] : trimmedId).toUpperCase();

        if (!isStudentEmail(rollUpper)) {
          throw new Error('Please enter a valid student roll number (e.g. 23091A3252).');
        }

        // Verified server-side (password = ward's roll number); returns a signed session token
        const parentRes = await api.parentLogin(rollUpper, trimmedPass);
        if (!parentRes.valid || !parentRes.student || !parentRes.token) {
          throw new Error(parentRes.error === 'Incorrect password.' || !parentRes.error
            ? 'Incorrect password. For parent access, enter the student roll number.'
            : parentRes.error);
        }
        const student: any = parentRes.student;

        const wardName = student.name || `Student (${rollUpper})`;
        const wardDept = student.department || getDeptFromRollNumber(rollUpper) || 'CSE (Data Science)';
        const roll = student.roll_number || rollUpper;

        login(`parent_${roll.toLowerCase()}@rgmcet.edu.in`, 'parent', roll, `Parent of ${wardName}`, parentRes.token, wardDept);
        await registerSession(`parent_${roll.toLowerCase()}@rgmcet.edu.in`, 'parent');
        navigate('/dashboard');
        return;
      }

      // ── 3. Faculty Login — authenticate directly via Cognito (accounts & passwords stored in Cognito) ──
      if (selectedRole.id === 'faculty') {
        if (!trimmedId) throw new Error('Please enter your official email address.');
        if (!trimmedPass) throw new Error('Please enter your password.');

        // Prevent students from logging in as faculty
        if (isStudentEmail(trimmedId)) {
          throw new Error('This is a student email. Please choose the Student card to log in.');
        }

        const emailLower = trimmedId.toLowerCase();
        if (!emailLower.endsWith('@rgmcet.edu.in')) {
          throw new Error('Please enter a valid @rgmcet.edu.in official faculty email address.');
        }

        try {
          // Direct Cognito Authentication (try backend AdminInitiateAuth first, fallback to client-side cognitoSignIn)
          let tokens: { idToken?: string } | null = null;
          try {
            tokens = await api.cognitoSignInViaBackend(emailLower, trimmedPass);
          } catch (backendErr: any) {
            const bMsg = backendErr?.message || '';
            // If explicit bad credentials or user not found, also verify client SDK to ensure reliable auth
            try {
              tokens = await cognitoSignIn(emailLower, trimmedPass);
            } catch (clientErr: any) {
              const cMsg = clientErr?.message || bMsg;
              if (cMsg.includes('Incorrect username or password') || cMsg.includes('NotAuthorizedException') || cMsg.includes('Incorrect email or password')) {
                throw new Error('Incorrect email or password. Please check your credentials.');
              }
              if (cMsg.includes('User does not exist') || cMsg.includes('UserNotFoundException') || cMsg.includes('No account found')) {
                throw new Error('No faculty account found for this email. Please register first.');
              }
              throw new Error(cMsg || 'Authentication failed. Please verify your credentials.');
            }
          }

          // Check if this account is actually registered as a student in the DB
          let studentCheck: any = null;
          try { studentCheck = await api.getStudentByEmail(emailLower); } catch { /* silent */ }
          if (studentCheck) {
            throw new Error('This account belongs to a student. Please choose the Student card to log in.');
          }

          let faculty: any = null;
          try { faculty = await api.getFacultyByEmail(emailLower); } catch { /* silent */ }

          // Auto-resolve or create profile if not present in faculty DB table yet (never block a valid Cognito faculty)
          if (!faculty) {
            if (!selectedDept) {
              setNeedDept(true);
              throw new Error('First login on this portal — choose your department below, then press Login again.');
            }
            const facId = `FAC_${emailLower.split('@')[0].toUpperCase()}`;
            const facName = emailLower.split('@')[0]
              .replace(/[._]/g, ' ')
              .replace(/\b\w/g, (c: string) => c.toUpperCase());
            const facDeptNew = selectedDept;
            try {
              await api.createFaculty({
                faculty_id: facId,
                name: facName,
                email: emailLower,
                department: facDeptNew,
                role: 'mentor',
              });
              faculty = { faculty_id: facId, name: facName, email: emailLower, department: facDeptNew, role: 'mentor' };
            } catch {
              faculty = { faculty_id: facId, name: facName, email: emailLower, department: facDeptNew, role: 'mentor' };
            }
          }

          const facDept = faculty?.department || selectedDept;
          const facName = faculty?.name || emailLower.split('@')[0];
          login(emailLower, 'faculty', faculty?.faculty_id, facName, tokens?.idToken, facDept);
          await registerSession(emailLower, 'faculty');
          navigate('/faculty/dashboard');
          return;
        } catch (facErr: any) {
          const msg = facErr?.message || '';
          if (msg.includes('Incorrect username or password') || msg.includes('NotAuthorizedException') || msg.includes('Incorrect email or password')) {
            throw new Error('Incorrect email or password. Please check your credentials.');
          }
          if (msg.includes('User does not exist') || msg.includes('UserNotFoundException') || msg.includes('No account found')) {
            throw new Error('No faculty account found for this email. Please register first.');
          }
          throw new Error(msg || 'Authentication failed. Please verify your credentials.');
        }
      }

      // ── 4. HOD / Coordinator / Admin / Oversight Roles ──
      if (!trimmedId) throw new Error('Please enter your official email address.');
      if (!trimmedPass) throw new Error('Please enter your password.');

      // Prevent students from logging in as staff/faculty
      if (isStudentEmail(trimmedId)) {
        throw new Error('This is a student email. Please choose the Student card to log in.');
      }

      const adminRes = await api.adminLogin(trimmedId, trimmedPass, undefined);
      if (adminRes.valid) {
        const assignedRole = (adminRes.role as UserRole) || selectedRole.id;
        const isSuperAdmin = Boolean(adminRes.isSuperAdmin);
        const assignedDept = adminRes.department || '';

        // Role authorization check: ensure the account has permissions for the selected role
        if (selectedRole.id === 'hod' && assignedRole !== 'hod' && !isSuperAdmin) {
          throw new Error('Access denied. This account does not have Head of Department (HOD) privileges.');
        }
        if (selectedRole.id === 'admin' && assignedRole !== 'admin' && !isSuperAdmin) {
          throw new Error('Access denied. This account does not have Administrator privileges.');
        }
        if (selectedRole.id === 'coordinator' && assignedRole !== 'coordinator' && !isSuperAdmin) {
          throw new Error('Access denied. This account does not have Coordinator privileges.');
        }
        if (['director', 'principal', 'management', 'program_chair'].includes(selectedRole.id) &&
            !['director', 'principal', 'management', 'program_chair', 'admin'].includes(assignedRole) && !isSuperAdmin) {
          throw new Error(`Access denied. This account does not have ${selectedRole.title} privileges.`);
        }

        login(adminRes.email || trimmedId, assignedRole, adminRes.faculty_id, adminRes.name || assignedRole.toUpperCase(), adminRes.token, assignedDept, isSuperAdmin);
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
    <div className="neu-page min-h-screen h-screen flex flex-col justify-between overflow-x-hidden overflow-y-auto relative text-slate-700 selection:bg-brand-primary selection:text-white">
      {/* ── Top Header Brand ── */}
      <div className="z-10 relative pt-3 sm:pt-4 md:pt-5 pb-1 px-4 text-center max-w-3xl mx-auto shrink-0">
        <div className="inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl neu-raised-sm p-1.5 mb-2 overflow-hidden hover:scale-105 transition-transform duration-300">
          <img
            src="/rgmcet-crest.png"
            alt="RGM Official Institutional Crest"
            className="w-full h-full object-contain filter drop-shadow-sm"
          />
        </div>

        {/* Brand Title: RGM ManageBAC */}
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-wider flex items-center justify-center gap-1 sm:gap-1.5 flex-wrap leading-tight">
          <span className="text-slate-800 font-black">RGM</span>
          <span className="text-brand-primary font-black tracking-tight">Manage</span>
          <span className="text-slate-800 font-bold tracking-normal">BAC</span>
        </h1>

        <p className="mt-1 text-[11px] sm:text-xs text-slate-500 font-medium max-w-xl mx-auto leading-normal px-2 line-clamp-2 sm:line-clamp-none">
          A digital initiative by the institute facilitating Faculty, Staff, Students and Parents to access and process Academics, Research, Supporting services at one common platform.
        </p>
      </div>

      {/* ── Main Unified Login Container ── */}
      <main className={`z-10 relative flex-1 w-full mx-auto px-4 py-2 sm:py-3 flex flex-col justify-center items-center my-auto min-h-0 ${flipped ? 'max-w-md' : 'max-w-4xl'}`}>
        {!flipped ? (
          <RoleCarousel roles={ALL_ROLES} index={roleIndex} onIndexChange={handleSelectIndex} onOpen={openCard} />
        ) : selectedRole && (
        <div key={`${selectedRole.id}-${registerMode}`} className="w-full neu-raised rounded-[24px] overflow-hidden relative card-flip-in">
          <IdCardHeader role={selectedRole} right={
            <button type="button" onClick={closeCard} className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-[11px] font-bold">
              <ArrowLeft className="w-3.5 h-3.5" />Change role
            </button>} />
          <div className="p-5 sm:p-6">
          {registerMode && (selectedRole.id === 'student' || selectedRole.id === 'faculty') ? (
            <RegisterPanel kind={selectedRole.id} onBack={() => setRegisterMode(false)} />
          ) : (
          <>

          {/* ── Dynamic Form Fields for Selected Role ── */}
          {selectedRole && (
            <form onSubmit={handleLoginSubmit} className="space-y-3.5 sm:space-y-4">
              {/* Student Segment Toggle */}
              {selectedRole.id === 'student' && (
                <div className="flex rounded-xl neu-inset p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStudentYearMode('regular');
                      setErrorMessage(null);
                    }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      studentYearMode === 'regular'
                        ? 'bg-brand-primary text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
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
                        ? 'bg-brand-primary text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    1st Year / Freshers
                  </button>
                </div>
              )}

              {/* Identifier Input Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
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
                        ? (studentYearMode === 'fresher' ? 'Admission ID / Username / Mobile' : 'yourmail@rgmcet.edu.in')
                        : selectedRole.id === 'parent' 
                          ? 'Student Roll Number'
                          : (selectedRole.id === 'hod' || selectedRole.id === 'admin')
                            ? 'enter your mail'
                            : 'yourname@rgmcet.edu.in'
                    }
                    className="w-full pl-10 pr-4 py-3 rounded-xl neu-inset border border-transparent text-slate-800 placeholder-slate-400 text-xs sm:text-sm font-medium focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Department — only when this faculty email has no record yet (first login) */}
              {selectedRole.id === 'faculty' && needDept && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Your department</label>
                  <div className="flex flex-wrap gap-1.5">
                    {VALID_DEPARTMENT_NAMES.map(dept => (
                      <button key={dept} type="button" onClick={() => setSelectedDept(dept)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${selectedDept === dept ? 'bg-brand-primary text-white' : 'neu-raised-sm text-slate-600 hover:text-brand-primary'}`}>
                        {dept}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Password or DOB Field */}
              {selectedRole.id === 'student' && studentYearMode === 'fresher' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Date of Birth (DOB) or Password
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={fresherDob}
                      onChange={(e) => setFresherDob(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl neu-inset border border-transparent text-slate-800 text-xs font-medium focus:outline-none"
                    />
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password (if set)"
                        className="w-full px-3.5 py-2.5 rounded-xl neu-inset border border-transparent text-slate-800 placeholder-slate-400 text-xs font-medium focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Password
                    </label>
                    {selectedRole.id === 'student' && (
                      <button
                        type="button"
                        onClick={openForgotModal}
                        className="text-[11px] text-brand-primary hover:underline font-bold cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                    {selectedRole.id === 'faculty' && (
                      <button
                        type="button"
                        onClick={openForgotModal}
                        className="text-[11px] text-brand-primary hover:underline font-bold cursor-pointer"
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
                      className="w-full pl-10 pr-10 py-3 rounded-xl neu-inset border border-transparent text-slate-800 placeholder-slate-400 text-xs sm:text-sm font-medium focus:outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Error Alert */}
              {errorMessage && (
                <div className="p-2.5 sm:p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-700 font-medium">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 rounded-xl bg-brand-primary hover:bg-brand-primary/95 text-white font-black text-sm neu-accent hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                    onClick={() => setRegisterMode(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:underline transition-colors"
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
                    onClick={() => setRegisterMode(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:underline transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    New Faculty Member? Register Here
                  </button>
                </div>
              )}
            </form>
          )}
          </>
          )}
          </div>
        </div>
        )}
      </main>

      {/* ── Global Footer ── */}
      <div className="z-10 relative shrink-0 neu-footer">
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
          <div className="relative z-10 w-full max-w-sm neu-panel rounded-2xl p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-soft border border-brand-primary/20 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-brand-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Reset Password</h3>
                  <p className="text-[10px] text-slate-500">{selectedRole?.id === 'student' ? 'Student Account Recovery' : 'Faculty Account Recovery'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-1.5 mb-5">
              {(['email', 'otp', 'success'] as const).map((step, i) => (
                <div key={step} className="flex items-center gap-1.5 flex-1">
                  <div className={`h-1.5 flex-1 rounded-full transition-all ${
                    forgotStep === 'success' || (forgotStep === 'otp' && i < 2) || (forgotStep === 'email' && i < 1)
                      ? 'bg-brand-primary' : 'bg-slate-100'
                  }`} />
                </div>
              ))}
            </div>

            {/* Error / Success alerts */}
            {forgotError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 mb-4 text-xs text-red-700 font-medium">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-500" />
                <span>{forgotError}</span>
              </div>
            )}
            {forgotSuccess && forgotStep !== 'success' && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 mb-4 text-xs text-emerald-700 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" />
                <span>{forgotSuccess}</span>
              </div>
            )}

            {/* "Not in directory" soft-state — email exists in DB but not found in faculty directory */}
            {forgotNotInDirectory && forgotStep === 'email' && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800">
                      Account not found in {selectedRole?.id === 'student' || selectedRole?.id === 'parent' ? 'student' : 'faculty'} records
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      <span className="font-medium">{forgotEmail}</span> isn't registered in the{' '}
                      {selectedRole?.id === 'student' || selectedRole?.id === 'parent' ? 'student' : 'faculty'} directory yet — but your data is safe and won't be lost.
                    </p>
                  </div>
                </div>
                <div className="text-xs text-amber-700 bg-amber-100 rounded-lg p-3 space-y-1">
                  <p className="font-semibold">What you can do:</p>
                  <ul className="list-disc ml-4 space-y-0.5">
                    {selectedRole?.id === 'student' || selectedRole?.id === 'parent' ? (
                      <>
                        <li>Contact your class coordinator or admin to verify your account</li>
                        <li>If you've logged in before, tap <span className="font-medium">"Try OTP Anyway"</span> below</li>
                      </>
                    ) : (
                      <>
                        <li>Ask your HOD or Admin to add <span className="font-medium">{forgotEmail}</span> to the faculty directory</li>
                        <li>If you've already logged in before, tap <span className="font-medium">"Try OTP Anyway"</span> below</li>
                      </>
                    )}
                  </ul>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleForceOtpStep}
                    disabled={forgotLoading}
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    {forgotLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                    {forgotLoading ? 'Sending…' : 'Try OTP Anyway'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setForgotNotInDirectory(false); setForgotEmail(''); }}
                    className="flex-1 py-2.5 rounded-xl border border-amber-300 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors"
                  >
                    Change Email
                  </button>
                </div>
              </div>
            )}

            {/* Step 1 — Email */}
            {forgotStep === 'email' && (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <p className="text-xs text-slate-500">Enter your registered email. We'll send a 6-digit OTP to your inbox.</p>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">{selectedRole?.id === 'student' ? 'Student Email' : 'Faculty Email'}</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder={selectedRole?.id === 'student' ? 'yourmail@rgmcet.edu.in' : 'yourname@rgmcet.edu.in'}
                      className="w-full pl-10 pr-4 py-3 rounded-xl neu-inset border border-transparent text-slate-800 placeholder-slate-400 text-sm font-medium focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full py-3 rounded-xl bg-brand-primary hover:bg-brand-primary/95 disabled:opacity-60 text-white text-sm font-bold neu-accent transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {forgotLoading ? 'Sending OTP...' : 'Send OTP'}
                </button>
              </form>
            )}

            {/* Step 2 — OTP + New Password */}
            {forgotStep === 'otp' && (
              <form onSubmit={handleConfirmReset} className="space-y-4">
                <p className="text-xs text-slate-500">Enter the 6-digit code sent to <span className="text-brand-primary font-bold">{forgotEmail}</span> and choose a new password.</p>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">OTP Code</label>
                  <input
                    type="text"
                    value={forgotOtp}
                    onChange={e => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit code"
                    maxLength={6}
                    className="w-full px-4 py-3 rounded-xl neu-inset border border-transparent text-slate-800 placeholder-slate-400 text-sm font-mono tracking-[0.3em] text-center focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type={showForgotNewPw ? 'text' : 'password'}
                      value={forgotNewPassword}
                      onChange={e => setForgotNewPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full pl-10 pr-10 py-3 rounded-xl neu-inset border border-transparent text-slate-800 placeholder-slate-400 text-sm font-medium focus:outline-none"
                      required
                    />
                    <button type="button" onClick={() => setShowForgotNewPw(p => !p)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showForgotNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="password"
                      value={forgotConfirmPassword}
                      onChange={e => setForgotConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full pl-10 pr-4 py-3 rounded-xl neu-inset border border-transparent text-slate-800 placeholder-slate-400 text-sm font-medium focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setForgotStep('email'); setForgotError(null); setForgotSuccess(null); }}
                    className="flex-1 py-3 rounded-xl neu-raised-sm text-slate-700 text-sm font-bold cursor-pointer"
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex-1 py-3 rounded-xl bg-brand-primary hover:bg-brand-primary/95 disabled:opacity-60 text-white text-sm font-bold neu-accent transition-all flex items-center justify-center gap-2 cursor-pointer"
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
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 mb-1">Password Reset!</p>
                  <p className="text-xs text-slate-500">You can now log in with your new password.</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowForgotModal(false); setForgotStep('email'); }}
                  className="w-full py-3 rounded-xl bg-brand-primary hover:bg-brand-primary/95 text-white text-sm font-bold transition-all cursor-pointer neu-accent"
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
