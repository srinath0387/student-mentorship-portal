import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  GraduationCap, 
  Users, 
  UserCheck, 
  Crown, 
  Shield, 
  ArrowRight 
} from 'lucide-react';
import { AuthAnimated3DBackground } from './AuthAnimated3DBackground';
import { Footer } from '../../components/layout/Footer';
import { UserRole } from '../../types';

interface RoleStripConfig {
  role: UserRole;
  title: string;
  icon: React.ElementType;
  accentBar: string;
  iconColor: string;
  arrowHoverColor: string;
}

const ROLES: RoleStripConfig[] = [
  {
    role: 'student',
    title: 'Student',
    icon: GraduationCap,
    accentBar: 'bg-blue-500',
    iconColor: 'text-blue-400 group-hover:text-blue-300',
    arrowHoverColor: 'group-hover:bg-blue-500/20 group-hover:text-blue-300 group-hover:border-blue-500/40',
  },
  {
    role: 'parent',
    title: 'Parent',
    icon: Users,
    accentBar: 'bg-emerald-500',
    iconColor: 'text-emerald-400 group-hover:text-emerald-300',
    arrowHoverColor: 'group-hover:bg-emerald-500/20 group-hover:text-emerald-300 group-hover:border-emerald-500/40',
  },
  {
    role: 'faculty',
    title: 'Faculty',
    icon: UserCheck,
    accentBar: 'bg-purple-500',
    iconColor: 'text-purple-400 group-hover:text-purple-300',
    arrowHoverColor: 'group-hover:bg-purple-500/20 group-hover:text-purple-300 group-hover:border-purple-500/40',
  },
  {
    role: 'hod',
    title: 'HOD',
    icon: Crown,
    accentBar: 'bg-amber-500',
    iconColor: 'text-amber-400 group-hover:text-amber-300',
    arrowHoverColor: 'group-hover:bg-amber-500/20 group-hover:text-amber-300 group-hover:border-amber-500/40',
  },
  {
    role: 'admin',
    title: 'Admin',
    icon: Shield,
    accentBar: 'bg-rose-500',
    iconColor: 'text-rose-400 group-hover:text-rose-300',
    arrowHoverColor: 'group-hover:bg-rose-500/20 group-hover:text-rose-300 group-hover:border-rose-500/40',
  },
];

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const handleSelectRole = (role: UserRole) => {
    navigate(`/login?role=${role}`);
  };

  return (
    <div className="h-screen bg-background flex flex-col justify-between overflow-y-auto sm:overflow-hidden relative text-slate-100">
      {/* ── Fixed Animated 3D Background Layer ── */}
      <AuthAnimated3DBackground />

      {/* ── Header Brand Section ── */}
      <div className="z-10 relative pt-4 sm:pt-6 pb-2 px-4 sm:px-6 text-center max-w-4xl mx-auto shrink-0">
        <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#031B33] p-1 shadow-md shadow-brand-primary/20 mb-1.5 sm:mb-2 ring-1 ring-white/10 overflow-hidden">
          <img
            src="/ds-logo.jpeg"
            alt="Data Science Logo"
            className="w-full h-full object-contain"
          />
        </div>

        <h1 className="text-2xl sm:text-3xl font-black tracking-wider">
          <span className="text-white drop-shadow-sm">A</span>
          <span className="text-cyan-400 font-black drop-shadow-[0_0_14px_rgba(56,217,232,0.9)] inline-block">D</span>
          <span className="text-white drop-shadow-sm">VITIYAN</span>
          <span className="text-cyan-400 font-black drop-shadow-[0_0_14px_rgba(56,217,232,0.9)] inline-block">S</span>
        </h1>

        <p className="mt-1 text-xs text-slate-300 font-medium">
          Student 360°, Faculty & Placement Cell Platform • RGMCET
        </p>
      </div>

      {/* ── Compact Role Selection Section ── */}
      <main className="z-10 relative flex-1 max-w-md w-full mx-auto px-4 sm:px-6 py-2 flex flex-col justify-center min-h-0">
        <div className="text-center mb-3 sm:mb-4">
          <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
            Select Your Role to Continue
          </h2>
          <p className="text-[11px] text-textSecondary mt-0.5">
            Click below to access your dedicated portal
          </p>
        </div>

        {/* ── 5 Compact Horizontal Strips ── */}
        <div className="space-y-2 sm:space-y-2.5">
          {ROLES.map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.role}
                onClick={() => handleSelectRole(item.role)}
                className="group cursor-pointer bg-surface/90 hover:bg-surface-2/95 backdrop-blur-md border border-borderLine hover:border-white/20 rounded-xl px-4 py-3 sm:py-3.5 flex items-center justify-between transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 relative overflow-hidden active:scale-[0.99]"
              >
                {/* Thin Top Accent Color Bar */}
                <div className={`absolute top-0 left-0 right-0 h-[3px] ${item.accentBar}`} />

                {/* Left: Simple Outline Icon + Middle: Role Name */}
                <div className="flex items-center gap-3.5">
                  <Icon className={`w-5 h-5 transition-colors ${item.iconColor}`} />
                  <span className="text-sm font-bold text-slate-100 group-hover:text-white tracking-wide">
                    {item.title}
                  </span>
                </div>

                {/* Right: Compact Circular Arrow Enter Button */}
                <div
                  className={`w-7 h-7 rounded-full bg-surface-2 border border-borderLine flex items-center justify-center text-textSecondary transition-all duration-200 ${item.arrowHoverColor}`}
                >
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            );
          })}
        </div>
      </main>

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

      {/* ── Footer ── */}
      <div className="z-10 relative">
        <Footer />
      </div>
    </div>
  );
};

export default LandingPage;
