import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQueryClient, useQuery } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AuthPage } from './features/auth/AuthPage';
import { LandingPage } from './features/auth/LandingPage';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { DashboardSkeleton } from './components/layout/DashboardSkeleton';
import { Footer } from './components/layout/Footer';
import { api } from './lib/api';
import { ProfilePhotoUploadModal } from './components/common/ProfilePhotoUploadModal';
import { LoginNoticePopupModal } from './components/common/LoginNoticePopupModal';

// Lazy load feature dashboard pages on-demand for fast initial page load
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })));
const ProfilePage = lazy(() => import('./features/profile/ProfilePage').then(m => ({ default: m.ProfilePage })));
const FacultyDashboardPage = lazy(() => import('./features/faculty/FacultyDashboardPage').then(m => ({ default: m.FacultyDashboardPage })));
const AdminDashboardPage = lazy(() => import('./features/admin/AdminDashboardPage').then(m => ({ default: m.AdminDashboardPage })));
const HodDashboardPage = lazy(() => import('./features/hod/HodDashboardPage').then(m => ({ default: m.HodDashboardPage })));
const CoordinatorDashboardPage = lazy(() => import('./features/coordinator/CoordinatorDashboardPage').then(m => ({ default: m.CoordinatorDashboardPage || m.default })));
const CodingAnalyticsPage = lazy(() => import('./features/coding/CodingAnalyticsPage').then(m => ({ default: m.CodingAnalyticsPage })));
const PlatformStatsRedirect = lazy(() => import('./features/coding/PlatformStatsRedirect').then(m => ({ default: m.PlatformStatsRedirect })));
const FacultyManagementPage = lazy(() => import('./features/admin/FacultyManagementPage'));
const MyMentorPage = lazy(() => import('./features/mentor/MyMentorPage'));
const AttendancePage = lazy(() => import('./features/attendance/AttendancePage').then(m => ({ default: m.AttendancePage })));
const OversightDashboardPage = lazy(() => import('./features/oversight/OversightDashboardPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 2 * 60 * 1000, // 2 minutes cache to avoid redundant API/Lambda calls on tab switching
      refetchOnMount: false,
      retry: 1,
    },
  },
});

/**
 * CacheClearer — watches user identity and clears ALL React Query cache
 * whenever the logged-in user changes (login, logout, or role switch).
 * This prevents data from one role (HOD / Admin / Student) leaking into
 * another role's view after a session change.
 */
const CacheClearer: React.FC = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const currentId = user?.id;
    if (prevUserIdRef.current !== currentId) {
      // User changed — nuke stale cache immediately
      qc.clear();
      prevUserIdRef.current = currentId;
    }
  }, [user?.id, qc]);

  return null;
};

const RoleDashboardRedirect: React.FC = () => {
  const { role } = useAuth();
  if (['director', 'principal', 'management', 'program_chair'].includes(role || '')) {
    return <Navigate to="/oversight/dashboard" replace />;
  }
  if (role === 'coordinator') {
    return <Navigate to="/coordinator/dashboard" replace />;
  }
  if (role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }
  if (role === 'faculty') {
    return <Navigate to="/faculty/dashboard" replace />;
  }
  if (role === 'hod') {
    return <Navigate to="/hod/dashboard" replace />;
  }
  return <DashboardPage />;
};

const RootRedirect: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-textSecondary font-medium">Loading...</p>
        </div>
      </div>
    );
  }
  if (isAuthenticated) {
    return <RoleDashboardRedirect />;
  }
  return <LandingPage />;
};

/**
 * ProtectedRoute — Redirects users who don't have the required role.
 * Authenticated users with the wrong role are sent to their own dashboard,
 * not shown a blank/error page.
 */
const ProtectedRoute: React.FC<{ allowedRoles: string[] }> = ({ allowedRoles }) => {
  const { isAuthenticated, isLoading, role } = useAuth();
  if (isLoading) return <DashboardSkeleton />;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (role && !allowedRoles.includes(role)) {
    // Send the user to their own role's dashboard
    if (['director', 'principal', 'management', 'program_chair'].includes(role)) return <Navigate to="/oversight/dashboard" replace />;
    if (role === 'admin') return <Navigate to="/admin/dashboard" replace />;
    if (role === 'hod') return <Navigate to="/hod/dashboard" replace />;
    if (role === 'coordinator') return <Navigate to="/coordinator/dashboard" replace />;
    if (role === 'faculty') return <Navigate to="/faculty/dashboard" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
};

const MainLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);  // mobile overlay
  const [collapsed, setCollapsed] = useState(false);           // desktop icon-rail
  const { user, role, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const queryClient = useQueryClient();
  const [photoModalDismissed, setPhotoModalDismissed] = useState(false);
  const [popupNoticesDismissed, setPopupNoticesDismissed] = useState(false);

  // Pending Login Notice Popups check
  const { data: pendingNotices = [] } = useQuery({
    queryKey: ['pendingPopupNotifications', user?.id || user?.email],
    queryFn: () => (isAuthenticated ? api.getPendingPopupNotifications().catch(() => []) : Promise.resolve([])),
    enabled: Boolean(isAuthenticated),
    staleTime: 60 * 1000,
  });

  const handleDismissNotice = async (noticeId: string) => {
    try {
      await api.dismissPopupNotification(noticeId);
      queryClient.invalidateQueries({ queryKey: ['pendingPopupNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['myNotifications'] });
    } catch (e) {
      console.warn('Failed to dismiss notice popup:', e);
    }
  };

  // Student profile check for photo
  const { data: studentProfile } = useQuery({
    queryKey: ['studentProfileForPhoto', user?.rollNumber],
    queryFn: () => (user?.rollNumber ? api.getStudentProfile(user.rollNumber) : Promise.resolve(null)),
    enabled: Boolean(isAuthenticated && role === 'student' && user?.rollNumber),
    staleTime: 60 * 1000,
  });

  // Faculty profile check for photo
  const isFacultyRole = ['faculty', 'coordinator', 'mentor'].includes(role || '');
  const { data: facultyProfile } = useQuery({
    queryKey: ['facultyProfileForPhoto', user?.email],
    queryFn: () => (user?.email ? api.getFacultyFullProfile(user.email) : Promise.resolve(null)),
    enabled: Boolean(isAuthenticated && isFacultyRole && user?.email),
    staleTime: 60 * 1000,
  });

  // Check if profile photo is missing
  const hasStudentPhoto = Boolean(studentProfile?.photo_url && studentProfile.photo_url.trim().length > 0);
  const hasFacultyPhoto = Boolean(facultyProfile?.personal?.photo_url && facultyProfile.personal.photo_url.trim().length > 0);

  const shouldPromptStudent = Boolean(role === 'student' && studentProfile && !hasStudentPhoto);
  const shouldPromptFaculty = Boolean(isFacultyRole && facultyProfile && !hasFacultyPhoto);
  const isPhotoRequired = (shouldPromptStudent || shouldPromptFaculty) && !photoModalDismissed;

  // Scroll the main content area to the top whenever the route or tab changes.
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [location.pathname, location.search]);

  // Auth guard: redirect to root if not authenticated
  if (!isLoading && !isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        collapsed={collapsed}
      />
      <div
        className={[
          'flex-1 flex flex-col min-w-0 transition-all duration-200',
          collapsed ? 'lg:pl-14' : 'lg:pl-[220px]',
        ].join(' ')}
      >
        <TopBar
          onMenuToggle={() => {
            // Use matchMedia — same breakpoint as Tailwind's lg: (min-width: 1024px)
            if (window.matchMedia('(min-width: 1024px)').matches) {
              setCollapsed((c) => !c);
            } else {
              setIsSidebarOpen((o) => !o);
            }
          }}
        />
        <main ref={mainRef} className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl w-full mx-auto">
            <Suspense fallback={<DashboardSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
        <Footer />
      </div>

      {/* Mandatory / Enforced Profile Photo Upload on Login */}
      {isPhotoRequired && (
        <ProfilePhotoUploadModal
          isOpen={true}
          isEnforced={true}
          role={role === 'student' ? 'student' : 'faculty'}
          userId={role === 'student' ? (user?.rollNumber || '') : (user?.email || '')}
          userName={user?.name || ''}
          currentPhotoUrl={role === 'student' ? studentProfile?.photo_url : facultyProfile?.personal?.photo_url}
          onClose={() => setPhotoModalDismissed(true)}
          onSuccess={() => setPhotoModalDismissed(true)}
        />
      )}

      {/* Priority Login Notice Pop-up from HOD, Principal, Mentor, or Admin */}
      {!popupNoticesDismissed && pendingNotices.length > 0 && (
        <LoginNoticePopupModal
          notices={pendingNotices}
          onDismissNotice={handleDismissNotice}
          onClose={() => setPopupNoticesDismissed(true)}
        />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
        {/* Clears React Query cache on every user/role change — prevents HOD data leaking into student view */}
        <CacheClearer />
        <Router>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/login/:role" element={<AuthPage />} />
            <Route path="/student-login" element={<AuthPage />} />
            <Route path="/faculty-login" element={<AuthPage />} />
            <Route path="/coordinator-login" element={<AuthPage />} />
            <Route path="/hod-login" element={<AuthPage />} />
            <Route path="/admin-login" element={<AuthPage />} />
            <Route path="/parent-login" element={<AuthPage />} />
            <Route path="/oversight-login" element={<AuthPage />} />
            <Route path="/director-login" element={<AuthPage />} />
            <Route path="/principal-login" element={<AuthPage />} />
            <Route path="/management-login" element={<AuthPage />} />
            <Route path="/program-chair-login" element={<AuthPage />} />
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<RoleDashboardRedirect />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/profile/coding-profiles/:platform" element={<PlatformStatsRedirect />} />
              <Route path="/program-stats/:platform" element={<PlatformStatsRedirect />} />
              <Route path="/mentor" element={<MyMentorPage />} />
              <Route path="/coding-analytics" element={<CodingAnalyticsPage />} />
              <Route path="/attendance" element={<AttendancePage />} />

              {/* Oversight (View-Only) routes */}
              <Route element={<ProtectedRoute allowedRoles={['director', 'principal', 'management', 'program_chair', 'admin']} />}>
                <Route path="/oversight/dashboard" element={<OversightDashboardPage />} />
              </Route>

              {/* Faculty-only routes */}
              <Route element={<ProtectedRoute allowedRoles={['faculty', 'hod', 'admin']} />}>
                <Route path="/faculty/dashboard" element={<FacultyDashboardPage />} />
              </Route>

              {/* Coordinator-only routes */}
              <Route element={<ProtectedRoute allowedRoles={['coordinator', 'admin']} />}>
                <Route path="/coordinator/dashboard" element={<CoordinatorDashboardPage />} />
              </Route>

              {/* HOD-only routes */}
              <Route element={<ProtectedRoute allowedRoles={['hod', 'admin']} />}>
                <Route path="/hod/dashboard" element={<HodDashboardPage />} />
              </Route>

              {/* Faculty Directory & Management: Admin, HOD, Coordinator & Oversight Roles */}
              <Route element={<ProtectedRoute allowedRoles={['admin', 'hod', 'coordinator', 'director', 'principal', 'management', 'program_chair']} />}>
                <Route path="/admin/faculty" element={<FacultyManagementPage />} />
              </Route>

              {/* Admin & Oversight Dashboard routes */}
              <Route element={<ProtectedRoute allowedRoles={['admin', 'director', 'principal', 'management', 'program_chair']} />}>
                <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
              </Route>

            </Route>
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </Router>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
