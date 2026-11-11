/**
 * Sidebar.tsx — Redesigned accordion navigation sidebar.
 *
 * Changes vs old version:
 * - Each role's flat list is now grouped into collapsible accordion sections.
 * - Only one accordion section is open at a time.
 * - Active item auto-opens its parent group.
 * - Collapsed (icon-rail) mode still works — groups collapse to icons only.
 * - Menu config lives in one array per role — easy to add/rename items.
 * - Smooth 250ms transitions on expand/collapse.
 * - All routing, auth, role logic unchanged.
 */

import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileBarChart,
  Award,
  User,
  CheckCircle2,
  FileText,
  FileCheck,
  Users,
  LogOut,
  ShieldCheck,
  BarChart2,
  PieChart,
  Building2,
  UserCheck,
  CalendarCheck,
  Calendar,
  ClipboardCheck,
  FolderOpen,
  Star,
  ClipboardList,
  CheckSquare,
  ChevronRight,
  LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/* ─────────────────────────── Types ─────────────────────────── */

interface SidebarProps {
  isOpen: boolean;      // mobile overlay open/close
  collapsed: boolean;   // desktop icon-only rail
  onClose: () => void;
}

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  soon?: boolean;
}

/** An accordion group: clicking the header expands/collapses its items */
interface NavGroup {
  title: string;      // group header text
  icon: LucideIcon;   // header icon (shown in collapsed rail tooltip)
  items: NavItem[];
}

/* ─────────────────────────── Nav configs (one per role) ─────────────────────────── */
// Add / rename items here — the UI rebuilds automatically.

const studentNav: NavGroup[] = [
  {
    title: 'Overview',
    icon: LayoutDashboard,
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
      { label: 'Overall Report', path: '/profile?tab=coding-profiles', icon: PieChart },
      { label: 'Program Leaderboard', path: '/coding-analytics', icon: BarChart2 },
    ],
  },
  {
    title: 'My Profile',
    icon: User,
    items: [
      { label: 'My 360° Profile', path: '/profile?tab=personal-info', icon: User },
      { label: 'My Attendance', path: '/profile?tab=attendance', icon: CalendarCheck },
      { label: 'On-Duty Permissions', path: '/profile?tab=permissions', icon: FileCheck },
      { label: 'My Mentor', path: '/mentor', icon: UserCheck },
      { label: 'Certificates', path: '/profile?tab=certifications', icon: CheckCircle2 },
      { label: 'Documents', path: '/profile?tab=documents', icon: FolderOpen },
      { label: 'Resume Builder', path: '/resume-builder', icon: FileText, soon: true },
    ],
  },
];

const facultyNav: NavGroup[] = [
  {
    title: 'Faculty Portal',
    icon: LayoutDashboard,
    items: [
      { label: 'Faculty Dashboard', path: '/faculty/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Attendance',
    icon: CalendarCheck,
    items: [
      { label: 'Take Attendance', path: '/attendance', icon: ClipboardCheck },
      { label: 'Attendance Records', path: '/faculty/dashboard?tab=attendance', icon: CalendarCheck },
    ],
  },
  {
    title: 'Leave & Duties',
    icon: CheckSquare,
    items: [
      { label: 'Leave & Duties', path: '/faculty/dashboard?tab=leaves', icon: CalendarCheck },
      { label: 'My Academic Duties', path: '/my-duties', icon: CheckSquare },
    ],
  },
  {
    title: 'Profile & Score',
    icon: Star,
    items: [
      { label: 'My Faculty Profile', path: '/faculty/dashboard?tab=profile', icon: User },
      { label: 'My API Score', path: '/faculty/dashboard?tab=profile', icon: Star },
    ],
  },
  {
    title: 'Mentees & Docs',
    icon: Users,
    items: [
      { label: 'Mentee Directory', path: '/faculty/dashboard?tab=mentees', icon: Users },
      { label: 'Documents Approval', path: '/documents', icon: FolderOpen },
      { label: 'Dept CGPA Analytics', path: '/faculty/dashboard?tab=analytics', icon: FileBarChart },
    ],
  },
];

const adminNav: NavGroup[] = [
  {
    title: 'Administration',
    icon: LayoutDashboard,
    items: [
      { label: 'Admin Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Attendance',
    icon: CalendarCheck,
    items: [
      { label: 'Attendance Mgmt', path: '/admin/dashboard?tab=attendance', icon: CalendarCheck },
      { label: 'Faculty Workload', path: '/attendance/workload', icon: BarChart2 },
      { label: 'Attendance Reports', path: '/attendance/reports', icon: FileBarChart },
      { label: 'Holiday Calendar', path: '/admin/dashboard?tab=holidays', icon: Calendar },
    ],
  },
  {
    title: 'Leave & Duties',
    icon: ShieldCheck,
    items: [
      { label: 'Leave & OD Approvals', path: '/admin/dashboard?tab=leaves', icon: ShieldCheck },
      { label: 'Academic Duties', path: '/academic-duties', icon: ClipboardList },
    ],
  },
  {
    title: 'Faculty',
    icon: User,
    items: [
      { label: 'Faculty API Score', path: '/faculty/api', icon: Star },
      { label: 'Faculty & Mentors', path: '/admin/dashboard?tab=faculty', icon: ShieldCheck },
      { label: 'Faculty Management', path: '/admin/faculty', icon: ShieldCheck },
    ],
  },
  {
    title: 'Students & Academics',
    icon: Users,
    items: [
      { label: 'Student Directory', path: '/admin/dashboard?tab=students', icon: Users },
      { label: 'CGPA & Top Performers', path: '/admin/dashboard?tab=performance', icon: Award },
      { label: 'Coding Leaderboard', path: '/coding-analytics', icon: BarChart2 },
      { label: 'Documents', path: '/documents', icon: FolderOpen },
    ],
  },
];

const hodNav: NavGroup[] = [
  {
    title: 'HOD Portal',
    icon: LayoutDashboard,
    items: [
      { label: 'Power BI Dashboard', path: '/hod/dashboard?tab=powerbi', icon: BarChart2 },
      { label: 'Department Overview', path: '/hod/dashboard?tab=overview', icon: Building2 },
    ],
  },
  {
    title: 'Attendance',
    icon: CalendarCheck,
    items: [
      { label: 'Attendance Tracker', path: '/hod/dashboard?tab=attendance', icon: CalendarCheck },
      { label: 'Faculty Workload', path: '/attendance/workload', icon: BarChart2 },
      { label: 'Attendance Reports', path: '/attendance/reports', icon: FileBarChart },
    ],
  },
  {
    title: 'Leave & Duties',
    icon: ShieldCheck,
    items: [
      { label: 'Leave & OD Approvals', path: '/hod/dashboard?tab=leaves', icon: ShieldCheck },
      { label: 'Academic Duties', path: '/academic-duties', icon: ClipboardList },
    ],
  },
  {
    title: 'Faculty',
    icon: User,
    items: [
      { label: 'Faculty API Score', path: '/faculty/api', icon: Star },
      { label: 'Faculty Directory & 360°', path: '/admin/faculty', icon: ShieldCheck },
    ],
  },
  {
    title: 'Students & Academics',
    icon: Users,
    items: [
      { label: 'Student Directory', path: '/hod/dashboard?tab=students', icon: Users },
      { label: 'CGPA & Rankings', path: '/hod/dashboard?tab=rankings', icon: Award },
      { label: 'My Mentees', path: '/hod/dashboard?tab=mentees', icon: UserCheck },
      { label: 'Coding Leaderboard', path: '/coding-analytics', icon: BarChart2 },
      { label: 'Documents', path: '/documents', icon: FolderOpen },
    ],
  },
];

const coordinatorNav: NavGroup[] = [
  {
    title: 'Coordinator Hub',
    icon: LayoutDashboard,
    items: [
      { label: 'Coordinator Hub', path: '/coordinator/dashboard?tab=onboarding', icon: LayoutDashboard },
      { label: 'Fresher Directory', path: '/coordinator/dashboard?tab=freshers', icon: Users },
      { label: 'Class Incharges', path: '/coordinator/dashboard?tab=incharge', icon: Award },
    ],
  },
  {
    title: 'Attendance & Leave',
    icon: CalendarCheck,
    items: [
      { label: 'Attendance Mgmt', path: '/coordinator/dashboard?tab=attendance', icon: CalendarCheck },
      { label: 'Leave Approvals', path: '/coordinator/dashboard?tab=leaves', icon: ShieldCheck },
    ],
  },
  {
    title: 'Faculty',
    icon: User,
    items: [
      { label: 'Faculty Directory', path: '/admin/faculty', icon: ShieldCheck },
    ],
  },
];

const parentNav: NavGroup[] = [
  {
    title: "Ward's Overview",
    icon: LayoutDashboard,
    items: [
      { label: 'Ward Dashboard', path: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Academics & Activity',
    icon: PieChart,
    items: [
      { label: 'Ward Attendance', path: '/profile?tab=attendance', icon: CalendarCheck },
      { label: 'On-Duty Permissions', path: '/profile?tab=permissions', icon: FileCheck },
      { label: 'Academics & CGPA', path: '/profile?tab=academics', icon: PieChart },
      { label: 'Coding & Platforms', path: '/profile?tab=coding-profiles', icon: BarChart2 },
      { label: 'Assigned Mentor', path: '/mentor', icon: UserCheck },
      { label: 'Certifications', path: '/profile?tab=certifications', icon: CheckCircle2 },
    ],
  },
];

const oversightNav: NavGroup[] = [
  {
    title: 'Institutional Oversight',
    icon: LayoutDashboard,
    items: [
      { label: 'Executive Dashboard', path: '/oversight/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Academics & Students',
    icon: Award,
    items: [
      { label: 'Academic & CGPA', path: '/admin/dashboard?tab=performance', icon: Award },
      { label: 'Student Directory', path: '/admin/dashboard?tab=students', icon: Users },
      { label: 'Coding Leaderboard', path: '/coding-analytics', icon: BarChart2 },
    ],
  },
  {
    title: 'Attendance',
    icon: CalendarCheck,
    items: [
      { label: 'Attendance Analytics', path: '/admin/dashboard?tab=attendance', icon: CalendarCheck },
      { label: 'Faculty Workload', path: '/attendance/workload', icon: BarChart2 },
      { label: 'Attendance Reports', path: '/attendance/reports', icon: FileBarChart },
    ],
  },
  {
    title: 'Faculty & Documents',
    icon: User,
    items: [
      { label: 'Faculty & Mentors', path: '/admin/dashboard?tab=faculty', icon: ShieldCheck },
      { label: 'Documents', path: '/documents', icon: FolderOpen },
    ],
  },
];

/* ─────────────────────────── Helpers ─────────────────────────── */

function getNavGroups(role: string | null | undefined): NavGroup[] {
  if (['director', 'principal', 'management', 'program_chair'].includes(role || '')) return oversightNav;
  if (role === 'coordinator') return coordinatorNav;
  if (role === 'admin') return adminNav;
  if (role === 'faculty') return facultyNav;
  if (role === 'hod') return hodNav;
  if (role === 'parent') return parentNav;
  return studentNav;
}

function isItemActive(itemPath: string, pathname: string, search: string): boolean {
  const cur = pathname + search;
  if (itemPath.includes('?')) return cur === itemPath;
  if (itemPath === '/admin/dashboard') return pathname === '/admin/dashboard' && (!search || search === '?tab=students');
  if (itemPath === '/hod/dashboard') return pathname === '/hod/dashboard' && (!search || search === '?tab=overview');
  if (itemPath === '/coordinator/dashboard') return pathname === '/coordinator/dashboard' && (!search || search === '?tab=onboarding');
  if (itemPath === '/faculty/dashboard') return pathname === '/faculty/dashboard' && !search;
  return pathname === itemPath;
}

/** Returns the index of the group that contains the currently active item */
function findActiveGroupIndex(groups: NavGroup[], pathname: string, search: string): number {
  return groups.findIndex(g =>
    g.items.some(item => isItemActive(item.path, pathname, search))
  );
}

/* ─────────────────────────── Sidebar component ─────────────────────────── */

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, collapsed, onClose }) => {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const navGroups = getNavGroups(role);

  // Start with ALL groups closed on login (-1 = nothing open)
  const [openGroup, setOpenGroup] = useState<number>(-1);

  // Track first render so we don't auto-open on login
  const isFirstRender = useRef(true);

  // After user navigates (e.g. via back button or breadcrumb), auto-open the correct group
  // Skip on first mount so the sidebar is fully closed on login
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const idx = findActiveGroupIndex(navGroups, location.pathname, location.search);
    if (idx !== -1) setOpenGroup(idx);
  }, [location.pathname, location.search]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const toggleGroup = (idx: number) => {
    setOpenGroup(prev => (prev === idx ? -1 : idx));
  };

  /* User display helpers */
  const rawName = user?.name || (user?.email ? user.email.split('@')[0] : 'User');
  const displayName = rawName.replace(/\s*\(HOD.*$/i, '').replace(/\s*\(.*$/, '').trim();
  const initials = displayName.split(' ').filter(Boolean).map((n: string) => n[0]).join('').toUpperCase() || 'U';

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-x-0 bottom-0 top-16 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
        />
      )}

      <aside
        className={[
          'fixed top-0 left-0 bottom-0 z-50 flex flex-col bg-surface border-r border-borderLine',
          'transition-all duration-300 ease-in-out overflow-hidden',
          collapsed ? 'lg:w-[60px]' : 'lg:w-[232px]',
          isOpen ? 'w-[232px] translate-x-0' : 'w-[232px] -translate-x-full',
          'lg:translate-x-0',
        ].join(' ')}
        style={{ boxShadow: '1px 0 0 0 var(--color-borderLine)' }}
      >

        {/* ── Logo Header ── */}
        <div className="h-16 flex items-center border-b border-borderLine shrink-0 px-3.5 gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-xl bg-brand-primary flex items-center justify-center text-white font-black text-sm shrink-0 select-none shadow-brand">
            R
          </div>
          <div className={['overflow-hidden transition-all duration-300', collapsed ? 'lg:w-0 lg:opacity-0' : 'w-auto opacity-100'].join(' ')}>
            <p className="text-sm font-extrabold tracking-tight text-textPrimary whitespace-nowrap">
              RGM <span className="text-brand-primary font-black">Manage</span><span className="font-bold tracking-wide">BAC</span>
            </p>
            <p className="text-[9px] font-semibold text-textMuted uppercase tracking-widest whitespace-nowrap -mt-0.5">
              Institutional Platform
            </p>
          </div>
        </div>

        {/* ── Accordion Navigation ── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-1.5 space-y-0.5">
          {navGroups.map((group, idx) => {
            const GroupIcon = group.icon;
            const isOpen_ = openGroup === idx;
            const hasActive = group.items.some(item =>
              isItemActive(item.path, location.pathname, location.search)
            );

            return (
              <div key={group.title}>
                {/* ── Group Header Button ── */}
                <button
                  type="button"
                  onClick={() => toggleGroup(idx)}
                  title={collapsed ? group.title : undefined}
                  className={[
                    'w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold transition-all duration-200 select-none',
                    collapsed ? 'lg:justify-center lg:px-0 lg:py-3' : '',
                    isOpen_ || hasActive
                      ? 'bg-brand-soft text-brand-primary'
                      : 'text-textSecondary hover:bg-surface-2 hover:text-textPrimary',
                  ].join(' ')}
                >
                  {/* Active indicator bar */}
                  {hasActive && (
                    <span className="absolute left-0 w-[3px] h-5 rounded-r-full bg-brand-primary" />
                  )}
                  <GroupIcon
                    className={[
                      'shrink-0 transition-transform duration-200',
                      isOpen_ || hasActive ? 'w-[18px] h-[18px]' : 'w-[17px] h-[17px]',
                    ].join(' ')}
                  />
                  <span className={['flex-1 text-left truncate transition-all duration-300', collapsed ? 'lg:hidden' : 'block'].join(' ')}>
                    {group.title}
                  </span>
                  {/* Chevron arrow — hidden in collapsed mode */}
                  <ChevronRight
                    className={[
                      'w-3.5 h-3.5 shrink-0 transition-transform duration-250',
                      collapsed ? 'lg:hidden' : 'block',
                      isOpen_ ? 'rotate-90' : '',
                    ].join(' ')}
                  />
                </button>

                {/* ── Sub-items (animated expand) ── */}
                {/* In collapsed mode: always show items as icon-only via title tooltip */}
                <div
                  className={[
                    'overflow-hidden transition-all duration-250 ease-in-out',
                    // On desktop collapsed: show items as icon-only without height animation
                    collapsed ? 'lg:block' : '',
                    // On expanded sidebar: animate height
                    !collapsed ? (isOpen_ ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0') : '',
                  ].join(' ')}
                  style={
                    // Only apply maxHeight transition when not collapsed
                    !collapsed
                      ? { maxHeight: isOpen_ ? '600px' : '0px', opacity: isOpen_ ? 1 : 0, transition: 'max-height 250ms ease-in-out, opacity 200ms ease-in-out' }
                      : {}
                  }
                >
                  <div className={['pl-2 pb-1 space-y-0.5', collapsed ? 'lg:pl-0' : ''].join(' ')}>
                    {group.items.map((item) => {
                      const ItemIcon = item.icon;
                      const active = isItemActive(item.path, location.pathname, location.search);
                      return (
                        <NavLink
                          key={item.label + item.path}
                          to={item.path}
                          onClick={onClose}
                          title={item.label}
                          className={[
                            'relative flex items-center gap-2.5 rounded-xl text-xs font-medium transition-all duration-200',
                            collapsed ? 'lg:justify-center lg:px-0 lg:py-2.5 px-3 py-2' : 'px-3 py-2',
                            active && !item.soon
                              ? 'bg-brand-primary/10 text-brand-primary font-semibold'
                              : 'text-textSecondary hover:bg-surface-2 hover:text-textPrimary',
                          ].join(' ')}
                        >
                          {/* Active left accent (sub-item) */}
                          {active && !item.soon && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r-full bg-brand-primary" />
                          )}

                          <ItemIcon
                            className={['shrink-0', active && !item.soon ? 'w-[15px] h-[15px]' : 'w-[14px] h-[14px]'].join(' ')}
                          />

                          <span className={['truncate transition-all duration-300', collapsed ? 'lg:hidden' : 'block'].join(' ')}>
                            {item.label}
                          </span>

                          {item.soon && (
                            <span className={['ml-auto text-[9px] font-bold bg-surface-2 text-textMuted border border-borderLine px-1.5 py-0.5 rounded-md shrink-0', collapsed ? 'lg:hidden' : ''].join(' ')}>
                              Soon
                            </span>
                          )}
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        {/* ── User Footer + Logout ── */}
        <div className="shrink-0 border-t border-borderLine p-2">
          {/* User card — hidden in collapsed mode */}
          <div className={['overflow-hidden transition-all duration-300 mb-1', collapsed ? 'lg:h-0 lg:opacity-0 lg:mb-0' : 'h-auto opacity-100'].join(' ')}>
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-2 border border-borderLine">
              <div className="w-8 h-8 rounded-full bg-brand-primary text-white font-bold flex items-center justify-center text-[10px] shrink-0 shadow-xs">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-textPrimary truncate leading-snug">{displayName}</p>
                <p className="text-[10px] text-brand-primary font-bold uppercase tracking-wider truncate">
                  {role === 'parent' ? 'Parent (View Only)' : role}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Log out"
            className={['w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-alert hover:bg-alert-soft transition-colors', collapsed ? 'lg:justify-center' : ''].join(' ')}
          >
            <LogOut className="w-[17px] h-[17px] shrink-0" />
            <span className={collapsed ? 'lg:hidden' : ''}>Log out</span>
          </button>
        </div>
      </aside>
    </>
  );
};
