import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearchParams, useLocation, useParams, Navigate } from 'react-router-dom';
import { ShieldCheck, UserCheck, Lock, CheckCircle2, XCircle, Loader2, Sparkles, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { studentSignUpSchema, facultySignUpSchema, loginSchema, adminLoginSchema, TIER1_SUPER_ADMIN_EMAILS, StudentSignUpInput, FacultySignUpInput, LoginInput, DEPARTMENT_CODE_MAP, VALID_DEPARTMENT_NAMES, getDeptCodeFromRollNumber, getDeptFromRollNumber } from '../../lib/validation/auth';
import { api } from '../../lib/api';
import { cognitoSignUp, cognitoSignIn, cognitoSignOut, isCognitoConfigError } from '../../lib/cognitoAuth';
import { useAuth } from '../../context/AuthContext';
import { PillButton } from '../../components/common/PillButton';
import { Footer } from '../../components/layout/Footer';
import { AuthAnimated3DBackground } from './AuthAnimated3DBackground';
import { UserRole } from '../../types';

// Admin/HOD login is handled server-side via POST /auth/admin-login.
// No admin email or password is stored in the frontend bundle.

export const AuthPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const params = useParams<{ role?: string }>();
  const navigate = useNavigate();

  // Determine active role strictly from search query (?role=faculty), route param (/login/:role), path, or window.location
  const getInitialRole = (): UserRole | null => {
    // 1. React Router searchParams (?role=...)
    const queryRole = searchParams.get('role')?.toLowerCase().trim();
    if (queryRole && ['student', 'parent', 'faculty', 'hod', 'coordinator', 'admin'].includes(queryRole)) {
      return queryRole as UserRole;
    }

    // 2. Route param (/login/:role)
    const paramRole = params.role?.toLowerCase().trim();
    if (paramRole && ['student', 'parent', 'faculty', 'hod', 'coordinator', 'admin'].includes(paramRole)) {
      return paramRole as UserRole;
    }

    // 3. Pathname checks (/faculty-login, /admin-login, /student-login, /hod-login, /parent-login, /coordinator-login)
    const path = location.pathname.toLowerCase();
    if (path.includes('faculty-login')) return 'faculty';
    if (path.includes('hod-login')) return 'hod';
    if (path.includes('coordinator-login')) return 'coordinator';
    if (path.includes('admin-login')) return 'admin';
    if (path.includes('parent-login')) return 'parent';
    if (path.includes('student-login')) return 'student';

    // 4. Fallback from window.location (handles both query strings and hash query strings)
    try {
      const urlObj = new URL(window.location.href);
      const winRole = urlObj.searchParams.get('role')?.toLowerCase().trim();
      if (winRole && ['student', 'parent', 'faculty', 'hod', 'coordinator', 'admin'].includes(winRole)) {
        return winRole as UserRole;
      }
      if (window.location.hash.includes('?')) {
        const hashQuery = window.location.hash.split('?')[1];
        const hashParams = new URLSearchParams(hashQuery);
        const hashRole = hashParams.get('role')?.toLowerCase().trim();
        if (hashRole && ['student', 'parent', 'faculty', 'hod', 'coordinator', 'admin'].includes(hashRole)) {
          return hashRole as UserRole;
        }
      }
    } catch (_) {}

    return null;
  };

  const activeTab = getInitialRole();

  // If accessed directly without an explicit role parameter, redirect back to the Landing Page
  if (!activeTab) {
    return <Navigate to="/" replace />;
  }
  const [isSignUp, setIsSignUp] = useState(false);
  const [loginDept, setLoginDept] = useState<string>('CSE (Data Science)');
  const [regNoStatus, setRegNoStatus] = useState<{ loading: boolean; available?: boolean; message?: string }>({ loading: false });
  const [emailStatus, setEmailStatus] = useState<{ loading: boolean; available?: boolean; message?: string }>({ loading: false });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ── Fresher (1st Year No College Email) Login & Setup State ──
  const [studentLoginMode, setStudentLoginMode] = useState<'standard' | 'fresher'>('standard');
  const [fresherLoginType, setFresherLoginType] = useState<'dob' | 'username'>('dob');
  const [fresherAdmissionId, setFresherAdmissionId] = useState('');
  const [fresherDob, setFresherDob] = useState('');
  const [fresherUsername, setFresherUsername] = useState('');
  const [fresherPassword, setFresherPassword] = useState('');
  const [isFresherSubmitting, setIsFresherSubmitting] = useState(false);

  // First-time setup modal for fresher
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupStudentInfo, setSetupStudentInfo] = useState<any>(null);
  const [setupUsername, setSetupUsername] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<{ loading: boolean; available?: boolean; message?: string }>({ loading: false });
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const { login, registerSession, sessionKickedOut } = useAuth();

  // Student Sign Up Form
  const {
    register: registerSignUp,
    handleSubmit: handleSignUpSubmit,
    watch: watchSignUp,
    setValue: setValueSignUp,
    reset: resetSignUp,
    clearErrors: clearSignUpErrors,
    formState: { errors: signUpErrors, isSubmitting: isSignUpSubmitting },
  } = useForm<StudentSignUpInput>({
    resolver: zodResolver(studentSignUpSchema),
    mode: 'onChange',
  });

  // Faculty Sign Up Form
  const {
    register: registerFacultySignUp,
    handleSubmit: handleFacultySignUpSubmit,
    watch: watchFacultySignUp,
    reset: resetFacultySignUp,
    clearErrors: clearFacultySignUpErrors,
    formState: { errors: facultySignUpErrors, isSubmitting: isFacultySignUpSubmitting },
  } = useForm<FacultySignUpInput>({
    resolver: zodResolver(facultySignUpSchema),
    mode: 'onChange',
    defaultValues: {
      department: 'Data Science',
    },
  });

  // Login Form — for student, faculty, hod tabs (@rgmcet.edu.in only)
  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    watch: watchLogin,
    reset: resetLogin,
    clearErrors: clearLoginErrors,
    formState: { errors: loginErrors, isSubmitting: isLoginSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
  });

  // Admin Login Form — accepts @rgmcet.edu.in OR the 3 tier-1 Gmail super-admin addresses
  const {
    register: registerAdminLogin,
    handleSubmit: handleAdminLoginSubmit,
    watch: watchAdminLogin,
    reset: resetAdminLogin,
    clearErrors: clearAdminLoginErrors,
    formState: { errors: adminLoginErrors, isSubmitting: isAdminLoginSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(adminLoginSchema),
    mode: 'onChange',
  });

  const handleGoBack = () => {
    navigate('/');
  };

  const handleToggleSignUp = (signUp: boolean) => {
    setIsSignUp(signUp);
    setErrorMessage(null);
    clearLoginErrors();
    clearAdminLoginErrors();
    resetLogin({ email: '', password: '' });
    resetAdminLogin({ email: '', password: '' });
    clearSignUpErrors();
    clearFacultySignUpErrors();
  };

  // Watch fields for live debounce availability check
  const watchedRegNo = watchSignUp('registrationNumber');
  const watchedEmail = watchSignUp('email');
  const watchedLoginEmail = watchLogin('email');
  const watchedAdminLoginEmail = watchAdminLogin('email');
  const watchedFacultyEmail = watchFacultySignUp('email');

  useEffect(() => {
    if (!watchedRegNo || watchedRegNo.length !== 10) {
      setRegNoStatus({ loading: false });
      return;
    }

    // Auto-sync college email with student registration number (e.g. 23091a3205@rgmcet.edu.in)
    const expectedEmail = `${watchedRegNo.toLowerCase()}@rgmcet.edu.in`;
    setValueSignUp('email', expectedEmail, { shouldValidate: true });

    // Auto-detect department from registration number code
    const deptCode = getDeptCodeFromRollNumber(watchedRegNo.toUpperCase());
    const matchedDept = DEPARTMENT_CODE_MAP[deptCode];
    if (matchedDept) {
      setValueSignUp('department', matchedDept, { shouldValidate: true });
    }

    const timer = setTimeout(async () => {
      setRegNoStatus({ loading: true });
      try {
        const res = await api.checkAvailability('regNo', watchedRegNo);
        setRegNoStatus({ loading: false, available: res.available, message: res.message });
      } catch (e) {
        setRegNoStatus({ loading: false, available: true, message: '✓ Format valid' });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [watchedRegNo, setValueSignUp]);

  useEffect(() => {
    if (!watchedEmail || !watchedEmail.includes('@')) {
      setEmailStatus({ loading: false });
      return;
    }

    if (!watchedEmail.toLowerCase().endsWith('@rgmcet.edu.in')) {
      setEmailStatus({
        loading: false,
        available: false,
        message: '✕ Only @rgmcet.edu.in domain is allowed (e.g. username@rgmcet.edu.in)',
      });
      return;
    }

    if (watchedRegNo && watchedRegNo.length === 10) {
      const expectedEmail = `${watchedRegNo.toLowerCase()}@rgmcet.edu.in`;
      if (watchedEmail.toLowerCase() !== expectedEmail) {
        setEmailStatus({
          loading: false,
          available: false,
          message: `✕ Email must match registration number (${expectedEmail})`,
        });
        return;
      }
    }

    const timer = setTimeout(async () => {
      setEmailStatus({ loading: true });
      try {
        const res = await api.checkAvailability('email', watchedEmail);
        setEmailStatus({ loading: false, available: res.available, message: res.available ? '✓ RGMCET Email available' : res.message });
      } catch (e) {
        setEmailStatus({ loading: false, available: true, message: '✓ RGMCET domain valid' });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [watchedEmail, watchedRegNo]);

  // Live username availability check for first-time fresher setup
  useEffect(() => {
    if (!setupUsername || setupUsername.length < 4) {
      setUsernameStatus({ loading: false });
      return;
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(setupUsername)) {
      setUsernameStatus({ loading: false, available: false, message: '✕ Only letters, numbers, _, and . allowed' });
      return;
    }
    const timer = setTimeout(async () => {
      setUsernameStatus({ loading: true });
      try {
        const res = await api.checkUsernameAvailability(setupUsername);
        setUsernameStatus({ loading: false, available: res.available, message: res.message });
      } catch {
        setUsernameStatus({ loading: false, available: true, message: '✓ Format valid' });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [setupUsername]);

  const onFresherLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsFresherSubmitting(true);
    try {
      let res: any;
      if (fresherLoginType === 'dob') {
        if (!fresherAdmissionId || !fresherDob) {
          throw new Error('Please enter both Admission ID and Date of Birth.');
        }
        res = await api.fresherLogin({
          admissionId: fresherAdmissionId.trim(),
          dob: fresherDob,
        });
      } else {
        if (!fresherUsername || !fresherPassword) {
          throw new Error('Please enter both Username and Password.');
        }
        res = await api.fresherLogin({
          username: fresherUsername.trim(),
          password: fresherPassword,
        });
      }

      if (res.requiresPasswordSetup) {
        setSetupStudentInfo(res.student);
        setSetupUsername(res.student?.username || '');
        setShowSetupModal(true);
        setIsFresherSubmitting(false);
        return;
      }

      if (res.valid && res.student) {
        const stu = res.student;
        const studentDept = stu.department || 'CSE';
        login(stu.email || stu.admission_id, 'student', stu.roll_number || stu.admission_id, stu.name, res.token, studentDept);
        registerSession(stu.email || stu.admission_id, 'student');
        navigate('/dashboard');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Fresher login failed. Please verify your credentials.');
    } finally {
      setIsFresherSubmitting(false);
    }
  };

  const onCompleteSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError(null);
    if (!setupUsername || setupUsername.length < 4) {
      setSetupError('Username must be at least 4 characters long.');
      return;
    }
    if (!setupPassword || setupPassword.length < 6) {
      setSetupError('Password must be at least 6 characters long.');
      return;
    }
    if (setupPassword !== setupConfirmPassword) {
      setSetupError('Passwords do not match.');
      return;
    }
    if (usernameStatus.available === false) {
      setSetupError('Please choose an available username.');
      return;
    }

    setIsSettingUp(true);
    try {
      const res = await api.fresherSetupPassword({
        admissionId: setupStudentInfo?.admission_id || fresherAdmissionId,
        dob: setupStudentInfo?.dob || fresherDob,
        username: setupUsername.trim(),
        password: setupPassword,
      });

      if (res.success && res.student) {
        const stu = res.student;
        const studentDept = stu.department || 'CSE';
        login(stu.email || stu.admission_id, 'student', stu.roll_number || stu.admission_id, stu.name, res.token, studentDept);
        registerSession(stu.email || stu.admission_id, 'student');
        setShowSetupModal(false);
        navigate('/dashboard');
      }
    } catch (err: any) {
      setSetupError(err.message || 'Setup failed. Please try again.');
    } finally {
      setIsSettingUp(false);
    }
  };

  const onSignUp = async (data: StudentSignUpInput) => {
    setErrorMessage(null);
    try {
      const regNo = data.registrationNumber.toUpperCase();
      let jwtToken: string | undefined;

      try {
        await cognitoSignUp({
          email: data.email,
          password: data.password,
          regNo,
          year: data.year,
          role: 'student',
        });
      } catch (cognitoErr: any) {
        const msg = cognitoErr.message || '';
        if (msg.includes('User already exists') || msg.includes('UsernameExistsException')) {
          // Cognito has this email but DB says it's available — previous admin deletion
          // did not fully remove the Cognito account. Try to login to verify, then let through.
          try {
            const authRes = await cognitoSignIn(data.email, data.password);
            jwtToken = authRes.idToken;
          } catch {
            throw new Error('This email is already registered in the system. If you were previously enrolled, please contact the administrator to reset your account.');
          }
        } else if (isCognitoConfigError(cognitoErr)) {
          console.warn('[Cognito Config Notice]:', cognitoErr.message || cognitoErr);
          // Cognito misconfigured or client ID mismatch — proceed with DB student creation and local session
        } else {
          throw cognitoErr;
        }
      }

      if (!jwtToken) {
        try {
          const authResult = await cognitoSignIn(data.email, data.password);
          jwtToken = authResult.idToken;
        } catch (cognitoSignInErr: any) {
          console.warn('[Cognito Sign In Notice]:', cognitoSignInErr.message || cognitoSignInErr);
        }
      }

      // 2. Create student record in database
      await api.createStudent({
        roll_number: regNo,
        name: data.fullName,
        email: data.email,
        year: data.year,
        department: data.department,
        batch: '2023-2027',
        section: 'A',
      }).catch((dbErr: any) => {
        console.warn('[DB Student Create Notice]:', dbErr.message);
      });

      // 3. Log in to app context and navigate immediately (session registration is non-blocking)
      login(data.email, 'student', regNo, data.fullName, jwtToken, data.department);
      registerSession(data.email, 'student');
      navigate('/dashboard');
    } catch (err: any) {
      setErrorMessage(err.message || 'Sign up failed. Please try again.');
    }
  };

  const onFacultySignUp = async (data: FacultySignUpInput) => {
    setErrorMessage(null);
    try {
      // Validate faculty secret key on the server (SEC-01 fix: key no longer in frontend bundle)
      const keyResult = await api.validateFacultyKey(data.securityKey);
      if (!keyResult.valid) {
        throw new Error(keyResult.error || 'Invalid security key.');
      }

      const generatedFacId = `FAC_${data.email.split('@')[0].toUpperCase()}`;
      let jwtToken: string | undefined;
      await cognitoSignUp({
        email: data.email,
        password: data.password,
        regNo: generatedFacId,
        year: 'Faculty',
        role: 'faculty',
      });
      const authResult = await cognitoSignIn(data.email, data.password);
      jwtToken = authResult.idToken;

      await api.createFaculty({
        faculty_id: generatedFacId,
        name: data.fullName,
        email: data.email,
        department: data.department,
        role: 'mentor',
      }).catch((dbErr: any) => {
        console.warn('[DB Faculty Create Notice]:', dbErr.message);
      });

      login(data.email, 'faculty', generatedFacId, data.fullName, jwtToken, data.department);
      registerSession(data.email, 'faculty');
      navigate('/faculty/dashboard');
    } catch (err: any) {
      setErrorMessage(err.message || 'Faculty sign up failed. Please try again.');
    }
  };

  const onHodSignUp = async (data: FacultySignUpInput) => {
    setErrorMessage(null);
    try {
      // Validate faculty secret key on the server (SEC-01 fix: key no longer in frontend bundle)
      const keyResult = await api.validateFacultyKey(data.securityKey);
      if (!keyResult.valid) {
        throw new Error(keyResult.error || 'Invalid security key.');
      }

      const generatedHodId = `HOD_${data.email.split('@')[0].toUpperCase()}`;
      let jwtToken: string | undefined;
      await cognitoSignUp({
        email: data.email,
        password: data.password,
        regNo: generatedHodId,
        year: 'HOD',
        role: 'hod',
      });
      const authResult = await cognitoSignIn(data.email, data.password);
      jwtToken = authResult.idToken;

      await api.createFaculty({
        faculty_id: generatedHodId,
        name: data.fullName,
        email: data.email,
        department: data.department,
        role: 'hod',
      }).catch((dbErr: any) => {
        console.warn('[DB HOD Create Notice]:', dbErr.message);
      });

      login(data.email, 'hod', generatedHodId, data.fullName, jwtToken, data.department);
      registerSession(data.email, 'hod');
      navigate('/hod/dashboard');
    } catch (err: any) {
      setErrorMessage(err.message || 'HOD sign up failed. Please try again.');
    }
  };

  // Helper to decode JWT payload (base64url) for role validation
  const decodeJwtPayload = (token: string): Record<string, any> => {
    try {
      const base64Url = token.split('.')[1];
      if (!base64Url) return {};
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      return {};
    }
  };

  const onLogin = async (data: LoginInput) => {
    setErrorMessage(null);
    try {
      let jwtToken: string | undefined;
      let rollNo = '';
      let displayName = '';

      // ── PARENT LOGIN (VIEW ONLY) ──────────────────────────────────────────
      if (activeTab === 'parent') {
        const cleanEmail = data.email.trim().toLowerCase();
        const enteredPass = data.password.trim();

        // The registration number is always the email prefix (before @)
        // e.g. 23091a3251@rgmcet.edu.in → 23091A3251
        const expectedRollNo = cleanEmail.includes('@')
          ? cleanEmail.split('@')[0].toUpperCase()
          : '';

        // Strict check: entered password must exactly match the registration number
        if (!expectedRollNo || enteredPass.toUpperCase() !== expectedRollNo) {
          throw new Error('Incorrect password.');
        }

        let wardStudent: any = null;
        try {
          wardStudent = await api.getStudentProfile(expectedRollNo);
        } catch {
          wardStudent = null;
        }
        if (!wardStudent) {
          try {
            wardStudent = await api.getStudentByEmail(cleanEmail);
          } catch {
            wardStudent = null;
          }
        }

        if (!wardStudent) {
          throw new Error('Incorrect password.');
        }

        const wardName = wardStudent.name || `Student (${expectedRollNo})`;
        const wardDept = wardStudent.department || getDeptFromRollNumber(expectedRollNo) || 'CSE (Data Science)';
        const roll = wardStudent.roll_number || expectedRollNo;

        login(cleanEmail, 'parent', roll, `Parent of ${wardName}`, undefined, wardDept);
        registerSession(cleanEmail, 'parent');
        navigate('/dashboard');
        return;
      }

      // ── MASTER COORDINATOR LOGIN HANDLER ──
      if (activeTab === 'coordinator') {
        const coordAuthResult = await api.adminLogin(data.email, data.password, 'All');
        if (!coordAuthResult.valid) {
          throw new Error(coordAuthResult.error || 'Incorrect password. Please enter valid Coordinator credentials.');
        }

        cognitoSignOut();
        login(data.email, 'coordinator', 'COORDINATOR_1ST_YEAR', '1st Year Coordinator', undefined, 'All');
        registerSession(data.email, 'coordinator');
        navigate('/coordinator/dashboard');
        return;
      }

      // ── MASTER ADMIN LOGIN HANDLER ──
      // Route all 'admin' tab logins to the backend for server-side credential validation
      if (activeTab === 'admin') {
        const authResult = await api.adminLogin(data.email, data.password, loginDept);
        if (!authResult.valid) {
          throw new Error(authResult.error || 'Incorrect password. Please enter valid admin credentials.');
        }

        // Sign out any lingering student Cognito session so it doesn't pollute the admin token
        cognitoSignOut();
        const effectiveDept = authResult.department || loginDept || 'CSE (Data Science)';
        login(data.email, 'admin', 'ADMIN_MASTER', 'System Administrator', undefined, effectiveDept, authResult.isSuperAdmin);
        registerSession(data.email, 'admin');
        navigate('/admin/dashboard');
        return;
      }

      // ── MASTER HOD LOGIN HANDLER ──
      // Route all 'hod' tab logins to the backend for server-side credential validation
      if (activeTab === 'hod') {
        const hodAuthResult = await api.adminLogin(data.email, data.password, loginDept);
        if (!hodAuthResult.valid || hodAuthResult.role !== 'hod') {
          throw new Error(hodAuthResult.error || 'Incorrect password. Please enter the valid HOD password.');
        }

        // Clear any lingering student Cognito session before attempting HOD Cognito sign-in
        cognitoSignOut();

        try {
          const cognitoResult = await cognitoSignIn(data.email, data.password);
          jwtToken = cognitoResult.idToken;
        } catch (cognitoErr: any) {
          console.warn('[HOD Cognito Notice]:', cognitoErr.message);
        }

        const hodLoginEmail = data.email;
        let hod = await api.getFacultyByEmail(hodLoginEmail).catch(() => null);
        const effectiveDept = hodAuthResult.department || loginDept || 'CSE (Data Science)';
        if (!hod) {
          await api.createFaculty({
            faculty_id: `HOD_${effectiveDept.replace(/[^A-Za-z]/g, '').toUpperCase()}`,
            name: 'Dr. HOD',
            email: hodLoginEmail,
            department: effectiveDept,
            role: 'hod',
          }).catch((dbErr: any) => console.warn('[DB HOD Create Notice]:', dbErr.message));
          hod = await api.getFacultyByEmail(hodLoginEmail).catch(() => null);
        }

        rollNo = `HOD_${effectiveDept.replace(/[^A-Za-z]/g, '').toUpperCase()}`;
        displayName = hod ? hod.name : 'Dr. HOD';
        login(hodLoginEmail, 'hod', rollNo, displayName, jwtToken, effectiveDept);
        registerSession(hodLoginEmail, 'hod'); // non-blocking
        navigate('/hod/dashboard');
        return;
      }

      // Step 1: Run Cognito authentication & DB profile lookup in parallel for fast response
      const [cognitoRes, dbRes] = await Promise.allSettled([
        cognitoSignIn(data.email, data.password),
        activeTab === 'student'
          ? api.getStudentByEmail(data.email)
          : api.getFacultyByEmail(data.email).catch(() => null),
      ]);

      let preFetchedDbUser = dbRes.status === 'fulfilled' ? dbRes.value : null;

      if (cognitoRes.status === 'fulfilled') {
        jwtToken = cognitoRes.value.idToken;
      } else {
        const cognitoErr: any = cognitoRes.reason;
        const msg = cognitoErr?.message || '';

        if (msg.includes('Incorrect username or password') || msg.includes('NotAuthorizedException')) {
          if (activeTab === 'student') {
            const serverAuth = await api.verifyStudentPassword(data.email, data.password).catch(() => null);
            if (serverAuth && serverAuth.valid && serverAuth.student) {
              const stu = serverAuth.student;
              rollNo = stu.roll_number;
              displayName = stu.name;
              const studentDept = stu.department || (rollNo ? getDeptFromRollNumber(rollNo) : 'CSE (Data Science)');
              login(data.email, 'student', rollNo, displayName, undefined, studentDept);
              registerSession(data.email, 'student');
              navigate('/dashboard');
              return;
            }
          }
          throw new Error('Incorrect password. Please check your credentials and try again.');
        }

        if (isCognitoConfigError(cognitoErr)) {
          console.warn('[Cognito Config Notice]:', msg);
          let dbUser: any = preFetchedDbUser;
          if (!dbUser) {
            if (activeTab === 'student') {
              dbUser = await api.getStudentByEmail(data.email).catch(() => null);
            } else if (activeTab === 'faculty') {
              dbUser = await api.getFacultyByEmail(data.email).catch(() => null);
            }
          }

          if (dbUser) {
            rollNo = dbUser.roll_number || dbUser.faculty_id || data.email.split('@')[0].toUpperCase();
            displayName = dbUser.name || 'User';
            login(data.email, activeTab, rollNo, displayName, undefined);
            registerSession(data.email, activeTab);
            navigate(activeTab === 'student' ? '/dashboard' : activeTab === 'faculty' ? '/faculty/dashboard' : '/hod/dashboard');
            return;
          }
        }

        if (msg.includes('User does not exist') || msg.includes('UserNotFoundException')) {
          let dbUser: any = preFetchedDbUser;

          if (!dbUser) {
            if (activeTab === 'student') {
              dbUser = await api.getStudentByEmail(data.email);
            } else if (activeTab === 'faculty') {
              dbUser = await api.getFacultyByEmail(data.email).catch(() => null);
            }
          }

          if (!dbUser) {
            throw new Error(`No ${activeTab} account found for this email. Please check your email or contact system admin.`);
          }

          try {
            const regNo = dbUser.roll_number || dbUser.faculty_id || data.email.split('@')[0].toUpperCase();
            await cognitoSignUp({
              email: data.email,
              password: data.password,
              regNo,
              year: dbUser.year || (activeTab === 'faculty' ? 'Faculty' : 'student'),
              role: activeTab,
            });
            const authResult = await cognitoSignIn(data.email, data.password);
            jwtToken = authResult.idToken;
          } catch (autoSignUpErr: any) {
            const signMsg = autoSignUpErr.message || '';
            if (signMsg.includes('UsernameExistsException') || signMsg.includes('already exists') || signMsg.includes('User already exists')) {
              throw new Error('Incorrect password. Please check your credentials and try again.');
            }
            if (signMsg.includes('Password') || signMsg.includes('policy')) {
              throw new Error(`Password requirement: ${signMsg}`);
            }
            if (isCognitoConfigError(autoSignUpErr)) {
              console.warn('[Cognito Config Notice]:', signMsg);
              rollNo = dbUser.roll_number || dbUser.faculty_id || data.email.split('@')[0].toUpperCase();
              displayName = dbUser.name || 'User';
              login(data.email, activeTab, rollNo, displayName, undefined);
              registerSession(data.email, activeTab);
              navigate(activeTab === 'student' ? '/dashboard' : activeTab === 'faculty' ? '/faculty/dashboard' : '/hod/dashboard');
              return;
            }
            throw new Error(signMsg || 'Invalid email or password. Please check your credentials and try again.');
          }
        } else {
          let dbUser: any = preFetchedDbUser;
          if (!dbUser && activeTab === 'student') {
            dbUser = await api.getStudentByEmail(data.email).catch(() => null);
          }
          if (dbUser) {
            rollNo = dbUser.roll_number || data.email.split('@')[0].toUpperCase();
            displayName = dbUser.name || 'Student';
            login(data.email, 'student', rollNo, displayName, undefined);
            registerSession(data.email, 'student');
            navigate('/dashboard');
            return;
          }
          throw new Error(msg || 'Authentication failed');
        }
      }

      // Step 2: Validate role from JWT token
      if (jwtToken) {
        const payload = decodeJwtPayload(jwtToken);
        const tokenRole = (payload['custom:role'] || '').toLowerCase();

        if (activeTab === 'student' && tokenRole && tokenRole !== 'student') {
          throw new Error(`This account is registered as "${tokenRole}". Please use the ${tokenRole.charAt(0).toUpperCase() + tokenRole.slice(1)} tab to log in.`);
        }
        if (activeTab === 'faculty' && tokenRole && tokenRole !== 'faculty' && tokenRole !== 'mentor') {
          throw new Error(`This account is registered as "${tokenRole}". Please use the correct tab to log in.`);
        }
      }

      // Step 3: Extract DB profile info (using pre-fetched DB user if available)
      if (activeTab === 'student') {
        let student = preFetchedDbUser;
        if (!student) {
          student = await api.getStudentByEmail(data.email);
        }
        // IMPORTANT: If student authenticated via Cognito but is NOT in the database,
        // it means an admin deleted them. We must block login and NOT recreate their profile.
        if (!student) {
          cognitoSignOut(); // invalidate Cognito session immediately
          throw new Error('Your account has been removed by an administrator. Please contact the system admin to be re-enrolled.');
        }

        rollNo = student.roll_number;
        displayName = student.name;
        const studentDept = student.department || (rollNo ? getDeptFromRollNumber(rollNo) : 'CSE (Data Science)');
        
        // Department is always taken from the student's DB record / roll number — no manual selection needed
        login(data.email, 'student', rollNo, displayName, jwtToken, studentDept);
      } else if (activeTab === 'faculty') {
        let faculty = await api.getFacultyByEmail(data.email).catch(() => null);
        if (!faculty) {
          const facId = `FAC_${data.email.split('@')[0].toUpperCase()}`;
          const facName = data.email.split('@')[0].replace(/\./g, ' ').toUpperCase();
          await api.createFaculty({
            faculty_id: facId,
            name: facName,
            email: data.email,
            department: loginDept || 'CSE (Data Science)',
            role: 'mentor',
          }).catch(() => {});
          faculty = await api.getFacultyByEmail(data.email).catch(() => null);
        }
        rollNo = faculty?.faculty_id || `FAC_${data.email.split('@')[0].toUpperCase()}`;
        displayName = faculty?.name || 'Faculty Member';
        const facDept = faculty?.department || loginDept || 'CSE (Data Science)';
        login(data.email, activeTab, rollNo, displayName, jwtToken, facDept);
      }

      registerSession(data.email, activeTab); // non-blocking — navigate immediately
      if ((activeTab as string) === 'admin') {
        navigate('/admin/dashboard');
      } else if (activeTab === 'faculty') {
        navigate('/faculty/dashboard');
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please check your credentials and try again.');
    }
  };

  return (
    <div className="h-screen bg-background flex flex-col justify-between overflow-y-auto sm:overflow-hidden relative">
      {/* ── Fixed Animated 3D Background Layer ── */}
      <AuthAnimated3DBackground />

      <div className="flex-1 flex flex-col justify-center py-2 sm:py-3 px-4 sm:px-6 lg:px-8 z-10 min-h-0 overflow-y-auto relative">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center shrink-0 mb-1 sm:mb-2">
        <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/95 p-1 shadow-lg shadow-cyan-500/20 mb-2 ring-1 ring-white/20 overflow-hidden">
          <img
            src="/rgmcet-crest.png"
            alt="RGM Official Institutional Crest"
            className="w-full h-full object-contain filter drop-shadow-sm"
          />
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white drop-shadow-sm">
          {activeTab === 'hod'
            ? 'HOD Login'
            : activeTab === 'coordinator'
            ? '1st Year Coordinator Login'
            : activeTab === 'admin'
            ? 'Admin Login'
            : activeTab === 'faculty'
            ? 'Faculty Login'
            : activeTab === 'parent'
            ? 'Parent Login'
            : 'Student Login'}
        </h1>
        <p className="mt-1 text-xs text-slate-300 font-medium">
          Sign in to access your institutional portal
        </p>
      </div>

      {/* ── Session Kicked-Out Banner ── */}
      {sessionKickedOut && (
        <div className="mt-2 sm:mx-auto sm:w-full sm:max-w-lg px-4 sm:px-0 shrink-0">
          <div className="bg-alert-soft border border-alert/30 rounded-xl p-3 flex items-start gap-2.5 shadow-sm">
            <span className="text-lg shrink-0">⚠️</span>
            <div>
              <p className="text-xs font-bold text-alert m-0">
                Session ended — another device signed in
              </p>
              <p className="text-[11px] text-textSecondary mt-0.5">
                Your account was accessed from a different browser or device. For security, only one active session is allowed. Please log in again.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-2 sm:mt-3 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-surface py-4 sm:py-5 px-5 sm:px-8 shadow-md border border-borderLine rounded-2xl">
          {/* Inline Error Banner */}
          {errorMessage && (
            <div className="mb-4 flex items-start gap-3 bg-red-950/60 border border-red-500/50 rounded-xl px-3.5 py-2.5 text-xs animate-pulse-once">
              <span className="text-red-400 text-sm mt-0.5 flex-shrink-0">✕</span>
              <div>
                <p className="font-semibold text-red-300 leading-snug">{errorMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="ml-auto text-red-400 hover:text-red-200 flex-shrink-0 transition-colors"
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}
          {/* Header with Role Title and "Not a [Role]? Go back" */}
          <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-borderLine">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-primary animate-pulse" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-brand-primary">
                {activeTab === 'hod'
                  ? 'HOD Portal Login'
                  : activeTab === 'coordinator'
                  ? '1st Year Coordinator Portal'
                  : activeTab === 'parent'
                  ? 'Parent Portal Login'
                  : activeTab === 'faculty'
                  ? 'Faculty Portal Login'
                  : activeTab === 'admin'
                  ? 'Admin Portal Login'
                  : 'Student Portal Login'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleGoBack}
              className="inline-flex items-center gap-1.5 text-xs text-textSecondary hover:text-brand-primary font-semibold transition-colors group cursor-pointer"
              title="Return to landing page to select a different role"
            >
              <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
              <span>
                {activeTab === 'hod'
                  ? 'Not HOD? Go back'
                  : activeTab === 'coordinator'
                  ? 'Not Coordinator? Go back'
                  : activeTab === 'admin'
                  ? 'Not an Admin? Go back'
                  : activeTab === 'faculty'
                  ? 'Not Faculty? Go back'
                  : activeTab === 'parent'
                  ? 'Not a Parent? Go back'
                  : 'Not a Student? Go back'}
              </span>
            </button>
          </div>

          {/* Parent Tab Form */}
          {activeTab === 'parent' ? (
            /* PARENT LOGIN FORM (VIEW ONLY) */
            <div className="space-y-4">

              <form onSubmit={handleLoginSubmit(onLogin)} className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-textPrimary">Student RGMCET Email *</label>
                    <span className="text-[10px] text-textSecondary">@rgmcet.edu.in only</span>
                  </div>
                  <div className="relative">
                    <input
                      {...registerLogin('email')}
                      type="email"
                      placeholder="e.g. 23091a3252@rgmcet.edu.in"
                      className={`w-full px-3.5 py-2 pr-10 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 font-medium ${
                        watchedLoginEmail && watchedLoginEmail.includes('@')
                          ? watchedLoginEmail.toLowerCase().endsWith('@rgmcet.edu.in')
                            ? 'border-emerald-500 focus:ring-emerald-500'
                            : 'border-red-500 focus:ring-red-500'
                          : 'border-borderLine focus:ring-brand-primary'
                      }`}
                    />
                    {watchedLoginEmail && watchedLoginEmail.includes('@') && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        {watchedLoginEmail.toLowerCase().endsWith('@rgmcet.edu.in') ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                    )}
                  </div>
                  {watchedLoginEmail && watchedLoginEmail.includes('@') && !watchedLoginEmail.toLowerCase().endsWith('@rgmcet.edu.in') && (
                    <p className="text-xs text-alert mt-1 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Only @rgmcet.edu.in domain is allowed (e.g. 23091a3252@rgmcet.edu.in)</span>
                    </p>
                  )}
                  {loginErrors.email && (!watchedLoginEmail || !watchedLoginEmail.includes('@') || watchedLoginEmail.toLowerCase().endsWith('@rgmcet.edu.in')) && (
                    <p className="text-xs text-alert mt-1">{loginErrors.email.message}</p>
                  )}
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-textPrimary">Student Registration Number *</label>
                    <span className="text-[10px] text-textSecondary">Password (e.g. 23091A3252)</span>
                  </div>
                  <div className="relative">
                    <input
                      {...registerLogin('password')}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="e.g. 23091A3252"
                      className="w-full px-3.5 py-2 pr-10 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary uppercase font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textSecondary hover:text-textPrimary p-1 rounded-md transition-colors"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4 text-brand-primary" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {loginErrors.password && (
                    <p className="text-xs text-alert mt-1">{loginErrors.password.message}</p>
                  )}
                </div>

                <div className="bg-surface-2 p-2.5 rounded-xl border border-borderLine text-[11px] text-textSecondary flex items-center justify-between">
                  <span>Demo Student: <strong className="text-textPrimary">23091A3252</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      const emailInput = document.querySelector('input[name="email"]') as HTMLInputElement;
                      const passInput = document.querySelector('input[name="password"]') as HTMLInputElement;
                      if (emailInput) {
                        emailInput.value = '23091a3252@rgmcet.edu.in';
                        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                      }
                      if (passInput) {
                        passInput.value = '23091A3252';
                        passInput.dispatchEvent(new Event('input', { bubbles: true }));
                      }
                    }}
                    className="text-xs font-bold text-brand-primary hover:underline"
                  >
                    Quick Fill
                  </button>
                </div>

                <div className="pt-2">
                  <PillButton
                    variant="primary"
                    size="lg"
                    type="submit"
                    disabled={isLoginSubmitting}
                    className="w-full"
                  >
                    Log In as Parent (View Only)
                  </PillButton>
                </div>

                <div className="text-center pt-2">
                  <p className="text-xs text-textSecondary">
                    Need assistance? Contact Department Mentor
                  </p>
                </div>
              </form>
            </div>
          ) : activeTab === 'student' ? (
            isSignUp ? (
              /* STUDENT SIGN UP FORM */
              <form onSubmit={handleSignUpSubmit(onSignUp)} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-textPrimary mb-1">Full Name *</label>
                  <input
                    {...registerSignUp('fullName')}
                    type="text"
                    placeholder="e.g. Jayanth Kumar"
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                  {signUpErrors.fullName && (
                    <p className="text-xs text-alert mt-1">{signUpErrors.fullName.message}</p>
                  )}
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-textPrimary">Registration Number *</label>
                    <span className="text-[10px] text-textSecondary">Format: 23091A0428 (or 23095A0428)</span>
                  </div>
                  <div className="relative">
                    <input
                      {...registerSignUp('registrationNumber')}
                      type="text"
                      maxLength={10}
                      placeholder="e.g. 23091A0428"
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background uppercase focus:outline-none focus:ring-2 focus:ring-brand-primary pr-10"
                    />
                    <div className="absolute right-3 top-2.5">
                      {regNoStatus.loading && <Loader2 className="w-4 h-4 text-brand-primary animate-spin" />}
                      {!regNoStatus.loading && regNoStatus.available === true && (
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      )}
                      {!regNoStatus.loading && regNoStatus.available === false && (
                        <XCircle className="w-4 h-4 text-alert" />
                      )}
                    </div>
                  </div>
                  {regNoStatus.message && (
                    <p className={`text-xs mt-1 ${regNoStatus.available ? 'text-success' : 'text-alert'}`}>
                      {regNoStatus.message}
                    </p>
                  )}
                  {signUpErrors.registrationNumber && (
                    <p className="text-xs text-alert mt-1">{signUpErrors.registrationNumber.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textPrimary mb-1">Department *</label>
                  <select
                    {...registerSignUp('department')}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  >
                    <option value="">Select Department</option>
                    {VALID_DEPARTMENT_NAMES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  {signUpErrors.department && (
                    <p className="text-xs text-alert mt-1">{signUpErrors.department.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textPrimary mb-1">Academic Year *</label>
                  <select
                    {...registerSignUp('year')}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  >
                    <option value="">Select Year</option>
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                  </select>
                  {signUpErrors.year && (
                    <p className="text-xs text-alert mt-1">{signUpErrors.year.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textPrimary mb-1">
                    College Email (@rgmcet.edu.in) *
                    {watchedRegNo && watchedRegNo.length === 10 && (
                      <span className="text-[10px] text-brand-primary ml-2 font-normal">(Auto-locked to Registration Number)</span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      {...registerSignUp('email')}
                      type="email"
                      readOnly={Boolean(watchedRegNo && watchedRegNo.length === 10)}
                      placeholder="e.g. 23091a0428@rgmcet.edu.in"
                      className={`w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine focus:outline-none focus:ring-2 focus:ring-brand-primary pr-10 ${
                        watchedRegNo && watchedRegNo.length === 10
                          ? 'bg-brand-soft/30 cursor-not-allowed font-bold text-brand-primary border-brand-primary/40'
                          : 'bg-background'
                      }`}
                    />
                    <div className="absolute right-3 top-2.5">
                      {emailStatus.loading && <Loader2 className="w-4 h-4 text-brand-primary animate-spin" />}
                      {!emailStatus.loading && emailStatus.available === true && (
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      )}
                      {!emailStatus.loading && emailStatus.available === false && (
                        <XCircle className="w-4 h-4 text-alert" />
                      )}
                    </div>
                  </div>
                  {emailStatus.message && (
                    <p className={`text-xs mt-1 ${emailStatus.available ? 'text-success' : 'text-alert'}`}>
                      {emailStatus.message}
                    </p>
                  )}
                  {signUpErrors.email && (
                    <p className="text-xs text-alert mt-1">{signUpErrors.email.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-textPrimary mb-1">Password *</label>
                    <div className="relative">
                      <input
                        {...registerSignUp('password')}
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Min 8 chars, 1 letter, 1 num"
                        className="w-full px-3.5 py-2 pr-10 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textSecondary hover:text-textPrimary p-1 rounded-md transition-colors"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4 text-brand-primary" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {signUpErrors.password && (
                      <p className="text-xs text-alert mt-1">{signUpErrors.password.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-textPrimary mb-1">Confirm Password *</label>
                    <div className="relative">
                      <input
                        {...registerSignUp('confirmPassword')}
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Re-enter password"
                        className="w-full px-3.5 py-2 pr-10 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textSecondary hover:text-textPrimary p-1 rounded-md transition-colors"
                        title={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4 text-brand-primary" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {signUpErrors.confirmPassword && (
                      <p className="text-xs text-alert mt-1">{signUpErrors.confirmPassword.message}</p>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <PillButton
                    variant="primary"
                    size="lg"
                    type="submit"
                    disabled={isSignUpSubmitting}
                    className="w-full"
                  >
                    {isSignUpSubmitting ? 'Creating Account...' : 'Create Student Account'}
                  </PillButton>
                </div>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => handleToggleSignUp(false)}
                    className="text-xs font-semibold text-brand-primary hover:underline"
                  >
                    Already registered? Log in here
                  </button>
                </div>
              </form>
            ) : (
              /* STUDENT LOGIN FORM */
              <div className="space-y-4">
                {/* Switcher between Standard Student and New 1st Year Fresher */}
                <div className="flex bg-surface-2 p-1 rounded-xl border border-borderLine">
                  <button
                    type="button"
                    onClick={() => {
                      setStudentLoginMode('standard');
                      setErrorMessage(null);
                    }}
                    className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition-all ${
                      studentLoginMode === 'standard'
                        ? 'bg-brand-primary text-white shadow-sm'
                        : 'text-textSecondary hover:text-textPrimary'
                    }`}
                  >
                    Standard Student (Email)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentLoginMode('fresher');
                      setErrorMessage(null);
                    }}
                    className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition-all ${
                      studentLoginMode === 'fresher'
                        ? 'bg-brand-primary text-white shadow-sm'
                        : 'text-textSecondary hover:text-textPrimary'
                    }`}
                  >
                    New Student (1st Year – No Email Yet)
                  </button>
                </div>

                {studentLoginMode === 'standard' ? (
                  <form onSubmit={handleLoginSubmit(onLogin)} className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-semibold text-textPrimary">Student Email *</label>
                        <span className="text-[10px] text-textSecondary">@rgmcet.edu.in only</span>
                      </div>
                      <div className="relative">
                        <input
                          {...registerLogin('email')}
                          type="email"
                          placeholder="username@rgmcet.edu.in"
                          className={`w-full px-3.5 py-2 pr-10 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 ${
                            watchedLoginEmail && watchedLoginEmail.includes('@')
                              ? watchedLoginEmail.toLowerCase().endsWith('@rgmcet.edu.in')
                                ? 'border-emerald-500 focus:ring-emerald-500'
                                : 'border-red-500 focus:ring-red-500'
                              : 'border-borderLine focus:ring-brand-primary'
                          }`}
                        />
                        {watchedLoginEmail && watchedLoginEmail.includes('@') && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            {watchedLoginEmail.toLowerCase().endsWith('@rgmcet.edu.in') ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                          </div>
                        )}
                      </div>
                      {watchedLoginEmail && watchedLoginEmail.includes('@') && !watchedLoginEmail.toLowerCase().endsWith('@rgmcet.edu.in') && (
                        <p className="text-xs text-alert mt-1 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Only @rgmcet.edu.in domain is allowed (e.g. username@rgmcet.edu.in)</span>
                        </p>
                      )}
                      {loginErrors.email && (!watchedLoginEmail || !watchedLoginEmail.includes('@') || watchedLoginEmail.toLowerCase().endsWith('@rgmcet.edu.in')) && (
                        <p className="text-xs text-alert mt-1">{loginErrors.email.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-textPrimary mb-1">Password *</label>
                      <div className="relative">
                        <input
                          {...registerLogin('password')}
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Enter password"
                          className="w-full px-3.5 py-2 pr-10 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textSecondary hover:text-textPrimary p-1 rounded-md transition-colors"
                          title={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4 text-brand-primary" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {loginErrors.password && (
                        <p className="text-xs text-alert mt-1">{loginErrors.password.message}</p>
                      )}
                    </div>

                    <div className="pt-2">
                      <PillButton
                        variant="primary"
                        size="lg"
                        type="submit"
                        disabled={isLoginSubmitting}
                        className="w-full"
                      >
                        Log In as Student
                      </PillButton>
                    </div>

                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => handleToggleSignUp(true)}
                        className="text-xs font-semibold text-brand-primary hover:underline"
                      >
                        New here? Create a Student Account
                      </button>
                    </div>
                  </form>
                ) : (
                  /* FRESHER (STAGE 0) LOGIN FORM */
                  <form onSubmit={onFresherLogin} className="space-y-4">
                    <div className="bg-brand-soft border border-brand-primary/20 rounded-xl p-3 text-xs text-brand-primary">
                      <div className="flex items-center gap-1.5 font-bold mb-0.5">
                        <Sparkles className="w-4 h-4 text-brand-primary" />
                        <span>1st Year Fresher Admission Access</span>
                      </div>
                      <p className="text-[11px] text-textSecondary leading-relaxed">
                        Log in using your <strong>Admission ID & Date of Birth</strong> provided at admission, or your chosen username once initialized.
                      </p>
                    </div>

                    {/* Method Toggle: DOB vs Username */}
                    <div className="flex justify-end gap-3 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setFresherLoginType('dob')}
                        className={`hover:underline ${fresherLoginType === 'dob' ? 'text-brand-primary underline font-bold' : 'text-textSecondary'}`}
                      >
                        Login with Admission ID + DOB
                      </button>
                      <span className="text-textMuted">•</span>
                      <button
                        type="button"
                        onClick={() => setFresherLoginType('username')}
                        className={`hover:underline ${fresherLoginType === 'username' ? 'text-brand-primary underline font-bold' : 'text-textSecondary'}`}
                      >
                        Login with Username
                      </button>
                    </div>

                    {fresherLoginType === 'dob' ? (
                      <>
                        <div>
                          <label className="block text-xs font-semibold text-textPrimary mb-1">Admission ID / Application No *</label>
                          <input
                            type="text"
                            value={fresherAdmissionId}
                            onChange={(e) => setFresherAdmissionId(e.target.value.toUpperCase())}
                            placeholder="e.g. ADM2025001"
                            className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary uppercase font-mono"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-semibold text-textPrimary">Date of Birth *</label>
                            <span className="text-[10px] text-textSecondary">YYYY-MM-DD</span>
                          </div>
                          <input
                            type="date"
                            value={fresherDob}
                            onChange={(e) => setFresherDob(e.target.value)}
                            className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs font-semibold text-textPrimary mb-1">Student Username *</label>
                          <input
                            type="text"
                            value={fresherUsername}
                            onChange={(e) => setFresherUsername(e.target.value)}
                            placeholder="e.g. rahul_rgm25"
                            className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-textPrimary mb-1">Password *</label>
                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={fresherPassword}
                              onChange={(e) => setFresherPassword(e.target.value)}
                              placeholder="Enter your password"
                              className="w-full px-3.5 py-2 pr-10 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textSecondary hover:text-textPrimary p-1 rounded-md transition-colors"
                              title={showPassword ? 'Hide password' : 'Show password'}
                            >
                              {showPassword ? <EyeOff className="w-4 h-4 text-brand-primary" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="pt-2">
                      <PillButton
                        variant="primary"
                        size="lg"
                        type="submit"
                        disabled={isFresherSubmitting}
                        className="w-full"
                      >
                        {isFresherSubmitting ? 'Verifying...' : 'Log In as Fresher Student'}
                      </PillButton>
                    </div>

                    <div className="text-center pt-1">
                      <p className="text-[11px] text-textSecondary">
                        Need assistance? Contact 1st Year Coordinator (<code className="text-textPrimary">coordinator@rgmcet.edu.in</code>)
                      </p>
                    </div>
                  </form>
                )}
              </div>
            )
          ) : (activeTab === 'faculty' || activeTab === 'hod') && isSignUp ? (
            /* FACULTY & HOD SIGN UP FORM */
            <form onSubmit={handleFacultySignUpSubmit(activeTab === 'hod' ? onHodSignUp : onFacultySignUp)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-textPrimary mb-1">
                  {activeTab === 'hod' ? 'HOD Full Name *' : 'Faculty Full Name *'}
                </label>
                <input
                  {...registerFacultySignUp('fullName')}
                  type="text"
                  placeholder={activeTab === 'hod' ? 'e.g. Dr. A. Srinivas' : 'e.g. Dr. M. V. Ramana'}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
                {facultySignUpErrors.fullName && (
                  <p className="text-xs text-alert mt-1">{facultySignUpErrors.fullName.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-textPrimary mb-1">Department *</label>
                <select
                  {...registerFacultySignUp('department')}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                >
                  {VALID_DEPARTMENT_NAMES.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {facultySignUpErrors.department && (
                  <p className="text-xs text-alert mt-1">{facultySignUpErrors.department.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-textPrimary mb-1">
                  Faculty Secret Security Key *
                  <span className="text-[10px] text-brand-primary font-normal ml-2">(Passcode required for staff account)</span>
                </label>
                <input
                  {...registerFacultySignUp('securityKey')}
                  type="password"
                  placeholder="Enter Secret Security Passcode"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary font-mono text-xs"
                />
                {facultySignUpErrors.securityKey && (
                  <p className="text-xs text-alert mt-1">{facultySignUpErrors.securityKey.message}</p>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold text-textPrimary">
                    {activeTab === 'hod' ? 'HOD Email (@rgmcet.edu.in) *' : 'Faculty Email (@rgmcet.edu.in) *'}
                  </label>
                  <span className="text-[10px] text-textSecondary">@rgmcet.edu.in only</span>
                </div>
                <div className="relative">
                  <input
                    {...registerFacultySignUp('email')}
                    type="email"
                    placeholder={activeTab === 'hod' ? 'hod.cse@rgmcet.edu.in' : 'faculty@rgmcet.edu.in'}
                    className={`w-full px-3.5 py-2 pr-10 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 ${
                      watchedFacultyEmail && watchedFacultyEmail.includes('@')
                        ? watchedFacultyEmail.toLowerCase().endsWith('@rgmcet.edu.in')
                          ? 'border-emerald-500 focus:ring-emerald-500'
                          : 'border-red-500 focus:ring-red-500'
                        : 'border-borderLine focus:ring-brand-primary'
                    }`}
                  />
                  {watchedFacultyEmail && watchedFacultyEmail.includes('@') && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      {watchedFacultyEmail.toLowerCase().endsWith('@rgmcet.edu.in') ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                  )}
                </div>
                {watchedFacultyEmail && watchedFacultyEmail.includes('@') && !watchedFacultyEmail.toLowerCase().endsWith('@rgmcet.edu.in') && (
                  <p className="text-xs text-alert mt-1 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Only @rgmcet.edu.in domain is allowed (e.g. faculty@rgmcet.edu.in)</span>
                  </p>
                )}
                {facultySignUpErrors.email && (!watchedFacultyEmail || !watchedFacultyEmail.includes('@') || watchedFacultyEmail.toLowerCase().endsWith('@rgmcet.edu.in')) && (
                  <p className="text-xs text-alert mt-1">{facultySignUpErrors.email.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-textPrimary mb-1">Password *</label>
                  <div className="relative">
                    <input
                      {...registerFacultySignUp('password')}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min 8 chars"
                      className="w-full px-3.5 py-2 pr-10 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textSecondary hover:text-textPrimary p-1 rounded-md transition-colors"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4 text-brand-primary" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {facultySignUpErrors.password && (
                    <p className="text-xs text-alert mt-1">{facultySignUpErrors.password.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textPrimary mb-1">Confirm Password *</label>
                  <div className="relative">
                    <input
                      {...registerFacultySignUp('confirmPassword')}
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Re-enter password"
                      className="w-full px-3.5 py-2 pr-10 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textSecondary hover:text-textPrimary p-1 rounded-md transition-colors"
                      title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4 text-brand-primary" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {facultySignUpErrors.confirmPassword && (
                    <p className="text-xs text-alert mt-1">{facultySignUpErrors.confirmPassword.message}</p>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <PillButton
                  variant="primary"
                  size="lg"
                  type="submit"
                  disabled={isFacultySignUpSubmitting}
                  className="w-full"
                >
                  {isFacultySignUpSubmitting
                    ? 'Creating Account...'
                    : activeTab === 'hod'
                    ? 'Create HOD Account'
                    : 'Create Faculty Account'}
                </PillButton>
              </div>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => handleToggleSignUp(false)}
                  className="text-xs font-semibold text-brand-primary hover:underline"
                >
                  Already registered? Log in as {activeTab === 'hod' ? 'HOD' : 'Faculty'}
                </button>
              </div>
            </form>
          ) : (
            /* FACULTY, HOD & ADMIN LOGIN FORMS */
            <div className="space-y-4">


              {activeTab === 'coordinator' ? (
                /* ── COORDINATOR LOGIN ── */
                <form onSubmit={handleAdminLoginSubmit(onLogin)} className="space-y-4">

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-semibold text-textPrimary">Coordinator Official Email</label>
                      <span className="text-[10px] text-textSecondary">@rgmcet.edu.in only</span>
                    </div>
                    <div className="relative">
                      <input
                        {...registerAdminLogin('email')}
                        type="email"
                        defaultValue="coordinator@rgmcet.edu.in"
                        placeholder="coordinator@rgmcet.edu.in"
                        className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-pink-500 font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-textPrimary mb-1">Password</label>
                    <div className="relative">
                      <input
                        {...registerAdminLogin('password')}
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter coordinator password"
                        className="w-full px-3.5 py-2 pr-10 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-pink-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textSecondary hover:text-textPrimary p-1 rounded-md transition-colors"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4 text-pink-500" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {adminLoginErrors.password && (
                      <p className="text-xs text-alert mt-1">{adminLoginErrors.password.message}</p>
                    )}
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isAdminLoginSubmitting}
                      className="w-full py-2.5 px-4 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      {isAdminLoginSubmitting ? 'Authenticating...' : 'Log In as 1st Year Coordinator'}
                    </button>
                  </div>

                  <div className="text-center pt-2">
                    <p className="text-xs text-textSecondary">
                      Need access? Contact Admin Office
                    </p>
                  </div>
                </form>
              ) : activeTab === 'admin' ? (
                /* ── ADMIN LOGIN — accepts @rgmcet.edu.in OR the 3 tier-1 Gmail super-admin addresses (no department) ── */
                <form onSubmit={handleAdminLoginSubmit(onLogin)} className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-semibold text-textPrimary">Admin Email</label>
                      <span className="text-[10px] text-textSecondary">@rgmcet.edu.in only</span>
                    </div>
                    <div className="relative">
                      <input
                        {...registerAdminLogin('email')}
                        type="email"
                        placeholder="admin@rgmcet.edu.in"
                        className={`w-full px-3.5 py-2 pr-10 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 font-medium ${
                          watchedAdminLoginEmail && watchedAdminLoginEmail.includes('@')
                            ? (watchedAdminLoginEmail.toLowerCase().endsWith('@rgmcet.edu.in') ||
                                (TIER1_SUPER_ADMIN_EMAILS as readonly string[]).includes(watchedAdminLoginEmail.toLowerCase()))
                              ? 'border-emerald-500 focus:ring-emerald-500'
                              : 'border-red-500 focus:ring-red-500'
                            : 'border-borderLine focus:ring-brand-primary'
                        }`}
                      />
                      {watchedAdminLoginEmail && watchedAdminLoginEmail.includes('@') && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                          {(watchedAdminLoginEmail.toLowerCase().endsWith('@rgmcet.edu.in') ||
                            (TIER1_SUPER_ADMIN_EMAILS as readonly string[]).includes(watchedAdminLoginEmail.toLowerCase())) ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                        </div>
                      )}
                    </div>
                    {watchedAdminLoginEmail && watchedAdminLoginEmail.includes('@') &&
                      !watchedAdminLoginEmail.toLowerCase().endsWith('@rgmcet.edu.in') &&
                      !(TIER1_SUPER_ADMIN_EMAILS as readonly string[]).includes(watchedAdminLoginEmail.toLowerCase()) && (
                      <p className="text-xs text-alert mt-1 flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Only @rgmcet.edu.in domain is allowed (e.g. username@rgmcet.edu.in)</span>
                      </p>
                    )}
                    {adminLoginErrors.email && (
                      <p className="text-xs text-alert mt-1">{adminLoginErrors.email.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-textPrimary mb-1">Password</label>
                    <div className="relative">
                      <input
                        {...registerAdminLogin('password')}
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter password"
                        className="w-full px-3.5 py-2 pr-10 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textSecondary hover:text-textPrimary p-1 rounded-md transition-colors"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4 text-brand-primary" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {adminLoginErrors.password && (
                      <p className="text-xs text-alert mt-1">{adminLoginErrors.password.message}</p>
                    )}
                  </div>

                  <div className="pt-2">
                    <PillButton
                      variant="primary"
                      size="lg"
                      type="submit"
                      disabled={isAdminLoginSubmitting}
                      className="w-full"
                    >
                      Log In as Admin
                    </PillButton>
                  </div>

                  <div className="text-center pt-2">
                    <p className="text-xs text-textSecondary">
                      Need access? Contact Admin Office
                    </p>
                  </div>
                </form>
              ) : (
                /* ── FACULTY / HOD LOGIN — @rgmcet.edu.in only ── */
                <form onSubmit={handleLoginSubmit(onLogin)} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-textPrimary mb-1">Department *</label>
                    <select
                      value={loginDept}
                      onChange={(e) => setLoginDept(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary font-medium"
                    >
                      {VALID_DEPARTMENT_NAMES.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-semibold text-textPrimary">
                        {activeTab === 'faculty' ? 'Faculty Email' : 'HOD Official Email'}
                      </label>
                      <span className="text-[10px] text-textSecondary">@rgmcet.edu.in only</span>
                    </div>
                    <div className="relative">
                      <input
                        {...registerLogin('email')}
                        type="email"
                        placeholder={activeTab === 'faculty' ? 'faculty.name@rgmcet.edu.in' : 'hod.ds@rgmcet.edu.in'}
                        className={`w-full px-3.5 py-2 pr-10 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 font-medium ${
                          watchedLoginEmail && watchedLoginEmail.includes('@')
                            ? watchedLoginEmail.toLowerCase().endsWith('@rgmcet.edu.in')
                              ? 'border-emerald-500 focus:ring-emerald-500'
                              : 'border-red-500 focus:ring-red-500'
                            : 'border-borderLine focus:ring-brand-primary'
                        }`}
                      />
                      {watchedLoginEmail && watchedLoginEmail.includes('@') && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                          {watchedLoginEmail.toLowerCase().endsWith('@rgmcet.edu.in') ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                        </div>
                      )}
                    </div>
                    {watchedLoginEmail && watchedLoginEmail.includes('@') && !watchedLoginEmail.toLowerCase().endsWith('@rgmcet.edu.in') && (
                      <p className="text-xs text-alert mt-1 flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Only @rgmcet.edu.in domain is allowed (e.g. username@rgmcet.edu.in)</span>
                      </p>
                    )}
                    {loginErrors.email && (!watchedLoginEmail || !watchedLoginEmail.includes('@') || watchedLoginEmail.toLowerCase().endsWith('@rgmcet.edu.in')) && (
                      <p className="text-xs text-alert mt-1">{loginErrors.email.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-textPrimary mb-1">Password</label>
                    <div className="relative">
                      <input
                        {...registerLogin('password')}
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter password"
                        className="w-full px-3.5 py-2 pr-10 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textSecondary hover:text-textPrimary p-1 rounded-md transition-colors"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4 text-brand-primary" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {loginErrors.password && (
                      <p className="text-xs text-alert mt-1">{loginErrors.password.message}</p>
                    )}
                  </div>

                  <div className="pt-2">
                    <PillButton
                      variant="primary"
                      size="lg"
                      type="submit"
                      disabled={isLoginSubmitting}
                      className="w-full"
                    >
                      Log In as {activeTab === 'faculty' ? 'Faculty' : 'HOD'}
                    </PillButton>
                  </div>

                  {activeTab === 'faculty' && (
                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => handleToggleSignUp(true)}
                        className="text-xs font-semibold text-brand-primary hover:underline cursor-pointer"
                      >
                        New Faculty Member? Register Account Here
                      </button>
                    </div>
                  )}
                  {activeTab === 'hod' && (
                    <div className="text-center pt-2">
                      <p className="text-xs text-textSecondary">
                        Need access? Contact Admin Office
                      </p>
                    </div>
                  )}
                </form>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
      {/* ── Glassmorphism Tagline Banner ── */}
      <div className="w-full shrink-0 flex items-center justify-center py-1 sm:py-1.5 z-10 relative">
        <div className="auth-glass-tag px-6 py-1 rounded-xl backdrop-blur-xl bg-white/10 dark:bg-white/5 border border-white/20 dark:border-white/10 shadow-sm shadow-brand-primary/10">
          <div className="auth-tag-crossfade">
            <span className="auth-tag-item text-xs font-extrabold tracking-wide bg-gradient-to-r from-brand-primary via-indigo-500 to-sky-500 bg-clip-text text-transparent">
              Where ever the data, there is Data Science ✨
            </span>
            <span className="auth-tag-item text-xs font-extrabold tracking-wide bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Celebrate every moment 🎉
            </span>
          </div>
        </div>
      </div>
      {/* ── Fresher First-Time Setup Modal (Set Username & Password) ── */}
      {showSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface border border-borderLine rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center mx-auto mb-2">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-black text-textPrimary">Welcome Fresher!</h2>
              <p className="text-xs text-textSecondary">
                Set up your personal <strong>Username</strong> and permanent <strong>Password</strong> to access your 1st-year dashboard.
              </p>
            </div>

            {setupStudentInfo && (
              <div className="bg-surface-2 p-3 rounded-xl border border-borderLine text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-textSecondary">Name:</span>
                  <span className="font-bold text-textPrimary">{setupStudentInfo.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-textSecondary">Admission ID:</span>
                  <span className="font-mono font-bold text-brand-primary">{setupStudentInfo.admission_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-textSecondary">Branch / Section:</span>
                  <span className="font-bold text-textPrimary">{setupStudentInfo.department} (Sec {setupStudentInfo.section})</span>
                </div>
              </div>
            )}

            {setupError && (
              <div className="bg-red-950/60 border border-red-500/50 rounded-xl p-2.5 text-xs text-red-300">
                {setupError}
              </div>
            )}

            <form onSubmit={onCompleteSetup} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-textPrimary mb-1">Choose Username *</label>
                <div className="relative">
                  <input
                    type="text"
                    value={setupUsername}
                    onChange={(e) => setSetupUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                    placeholder="e.g. rahul_rgm25"
                    className={`w-full px-3.5 py-2 pr-24 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 font-medium ${
                      usernameStatus.available === true
                        ? 'border-emerald-500 focus:ring-emerald-500'
                        : usernameStatus.available === false
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-borderLine focus:ring-brand-primary'
                    }`}
                  />
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold">
                    {usernameStatus.loading ? (
                      <span className="text-textSecondary">Checking...</span>
                    ) : usernameStatus.available === true ? (
                      <span className="text-emerald-400">✓ Available</span>
                    ) : usernameStatus.available === false ? (
                      <span className="text-red-400">✕ Taken</span>
                    ) : null}
                  </div>
                </div>
                <p className="text-[10px] text-textSecondary mt-0.5">
                  4-30 characters (letters, numbers, _, .)
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-textPrimary mb-1">Create Password *</label>
                <input
                  type="password"
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textPrimary mb-1">Confirm Password *</label>
                <input
                  type="password"
                  value={setupConfirmPassword}
                  onChange={(e) => setSetupConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-borderLine bg-background focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowSetupModal(false)}
                  className="flex-1 py-2 text-xs font-semibold rounded-xl border border-borderLine text-textSecondary hover:bg-surface-2 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSettingUp}
                  className="flex-1 py-2 text-xs font-bold rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isSettingUp ? 'Saving...' : 'Save & Enter Dashboard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="z-10 relative">
        <Footer />
      </div>
    </div>
  );
};
