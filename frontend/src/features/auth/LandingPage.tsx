import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  GraduationCap, 
  Users, 
  UserCheck, 
  Crown, 
  Shield, 
  ArrowRight, 
  CheckCircle2
} from 'lucide-react';
import { AuthAnimated3DBackground } from './AuthAnimated3DBackground';
import { Footer } from '../../components/layout/Footer';
import { UserRole } from '../../types';

interface RoleCardConfig {
  role: UserRole;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  icon: React.ElementType;
  description: string;
  features: string[];
  gradientBorder: string;
  glowColor: string;
  buttonBg: string;
}

const ROLE_CARDS: RoleCardConfig[] = [
  {
    role: 'student',
    title: 'Student',
    subtitle: 'B.Tech Undergraduates',
    badge: 'Academics & Coding',
    badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    icon: GraduationCap,
    description: 'Track your 360° performance, semester GPA, LeetCode & GitHub stats, and mentor remarks.',
    features: [
      'Cumulative SGPA & CGPA Analytics',
      'Live Coding Profiles (LeetCode & GitHub)',
      'Assigned Mentor Details & Remarks',
    ],
    gradientBorder: 'hover:border-cyan-400/50 hover:shadow-[0_0_24px_rgba(56,217,232,0.25)]',
    glowColor: 'from-cyan-500/20 to-blue-600/10',
    buttonBg: 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white',
  },
  {
    role: 'parent',
    title: 'Parent',
    subtitle: 'Student Guardians (View Only)',
    badge: 'Ward Academic 360°',
    badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    icon: Users,
    description: "Monitor your ward's academic progress, attendance percentages, and faculty counseling records.",
    features: [
      'Real-Time Attendance Overview',
      'Semester Marks & CGPA Progress',
      'Faculty Counseling & Feedback',
    ],
    gradientBorder: 'hover:border-emerald-400/50 hover:shadow-[0_0_24px_rgba(52,211,153,0.25)]',
    glowColor: 'from-emerald-500/20 to-teal-600/10',
    buttonBg: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white',
  },
  {
    role: 'faculty',
    title: 'Faculty',
    subtitle: 'Mentors & Teaching Staff',
    badge: 'Mentorship & Profile',
    badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    icon: UserCheck,
    description: 'Manage assigned mentees, update student counseling logs, and maintain your 360° faculty profile.',
    features: [
      'Mentee Roster & Student 360°',
      'Counseling Remarks & Meeting Logs',
      'Faculty 360° Profile (Publications & Certs)',
    ],
    gradientBorder: 'hover:border-indigo-400/50 hover:shadow-[0_0_24px_rgba(129,140,248,0.25)]',
    glowColor: 'from-indigo-500/20 to-purple-600/10',
    buttonBg: 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white',
  },
  {
    role: 'hod',
    title: 'HOD',
    subtitle: 'Head of Department',
    badge: 'Department Authority',
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    icon: Crown,
    description: 'Oversee department analytics, faculty mentee distributions, placement cell metrics, and coding leaderboards.',
    features: [
      'Department-Wide CGPA Trends',
      'Faculty 360° Inspection & Directory',
      'Placement Eligibility & Stats',
    ],
    gradientBorder: 'hover:border-amber-400/50 hover:shadow-[0_0_24px_rgba(251,191,36,0.25)]',
    glowColor: 'from-amber-500/20 to-orange-600/10',
    buttonBg: 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white',
  },
  {
    role: 'admin',
    title: 'Admin',
    subtitle: 'System Administrator',
    badge: 'Master Control',
    badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    icon: Shield,
    description: 'Master administration, complete student directory CRUD, faculty accounts, CSV imports, and audit logs.',
    features: [
      'Full Student Directory CRUD',
      'Bulk CSV Import & Export',
      'Faculty Management & System Config',
    ],
    gradientBorder: 'hover:border-rose-400/50 hover:shadow-[0_0_24px_rgba(244,63,94,0.25)]',
    glowColor: 'from-rose-500/20 to-pink-600/10',
    buttonBg: 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white',
  },
];

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const handleSelectRole = (role: UserRole) => {
    navigate(`/login?role=${role}`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between overflow-y-auto relative text-slate-100">
      {/* ── Fixed Animated 3D Background Layer ── */}
      <AuthAnimated3DBackground />

      {/* ── Top Header Brand ── */}
      <div className="z-10 relative pt-6 sm:pt-8 pb-4 px-4 sm:px-6 lg:px-8 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#031B33] p-1.5 shadow-xl shadow-brand-primary/20 mb-3 ring-1 ring-white/15 overflow-hidden">
          <img
            src="/ds-logo.jpeg"
            alt="Data Science Logo"
            className="w-full h-full object-contain"
          />
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-wider">
          <span className="text-white drop-shadow-sm">A</span>
          <span className="text-cyan-400 font-black drop-shadow-[0_0_16px_rgba(56,217,232,0.9)] inline-block">D</span>
          <span className="text-white drop-shadow-sm">VITIYAN</span>
          <span className="text-cyan-400 font-black drop-shadow-[0_0_16px_rgba(56,217,232,0.9)] inline-block">S</span>
        </h1>

        <p className="mt-2 text-sm sm:text-base text-slate-300 font-medium max-w-2xl mx-auto">
          Department of Computer Science & Engineering (Data Science) • RGMCET
        </p>

        <div className="mt-3 inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-surface/80 border border-white/10 backdrop-blur-md text-xs text-textSecondary shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-slate-200">Institutional Mentorship & 360° Portal</span>
        </div>
      </div>

      {/* ── Role Selection Section ── */}
      <main className="z-10 relative flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col justify-center">
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Select Your Role to Continue
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-textSecondary max-w-lg mx-auto">
            Choose your portal below to access dedicated tools, analytics, and records.
          </p>
        </div>

        {/* ── 5 Role Cards Grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 justify-center">
          {ROLE_CARDS.map((card, idx) => {
            const Icon = card.icon;
            const isLastOn3Cols = idx === 4;

            return (
              <div
                key={card.role}
                onClick={() => handleSelectRole(card.role)}
                className={`group cursor-pointer bg-surface/90 backdrop-blur-xl border border-borderLine rounded-2xl p-5 sm:p-6 transition-all duration-300 hover:-translate-y-1.5 flex flex-col justify-between relative overflow-hidden ${card.gradientBorder} ${
                  isLastOn3Cols ? 'sm:col-span-2 lg:col-span-1 sm:max-w-md sm:mx-auto lg:max-w-none w-full' : ''
                }`}
              >
                {/* Subtle Card Background Glow */}
                <div
                  className={`absolute -top-16 -right-16 w-36 h-36 rounded-full bg-gradient-to-br ${card.glowColor} blur-2xl pointer-events-none group-hover:scale-150 transition-transform duration-500`}
                />

                <div>
                  {/* Top Row: Icon + Badge */}
                  <div className="flex items-center justify-between gap-2 mb-3.5">
                    <div className="w-11 h-11 rounded-xl bg-surface-2 border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm">
                      <Icon className="w-6 h-6 text-brand-primary group-hover:text-cyan-400 transition-colors" />
                    </div>
                    <span
                      className={`text-[10px] font-bold tracking-wide uppercase px-2.5 py-0.5 rounded-full border ${card.badgeColor}`}
                    >
                      {card.badge}
                    </span>
                  </div>

                  {/* Title & Subtitle */}
                  <div className="mb-2">
                    <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors flex items-center gap-1.5">
                      {card.title} Portal
                    </h3>
                    <p className="text-xs text-textSecondary font-medium">
                      {card.subtitle}
                    </p>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-300/90 leading-relaxed mb-4">
                    {card.description}
                  </p>

                  {/* Feature Bullets */}
                  <ul className="space-y-1.5 mb-5 text-[11px] text-textSecondary">
                    {card.features.map((feat, fIdx) => (
                      <li key={fIdx} className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate">{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Card Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectRole(card.role);
                  }}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all duration-200 group-hover:shadow-lg active:scale-95 cursor-pointer ${card.buttonBg}`}
                >
                  <span>Log In as {card.title}</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            );
          })}
        </div>
      </main>

      {/* ── Glassmorphism Tagline Banner ── */}
      <div className="w-full shrink-0 flex items-center justify-center py-2 z-10 relative">
        <div className="auth-glass-tag px-6 py-1.5 rounded-xl backdrop-blur-xl bg-white/10 dark:bg-white/5 border border-white/20 dark:border-white/10 shadow-sm shadow-brand-primary/10">
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

      {/* ── Global Footer ── */}
      <div className="z-10 relative">
        <Footer />
      </div>
    </div>
  );
};

export default LandingPage;
