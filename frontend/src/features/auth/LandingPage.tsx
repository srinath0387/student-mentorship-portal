import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, ArrowRight } from 'lucide-react';
import { AuthAnimated3DBackground } from './AuthAnimated3DBackground';
import { Footer } from '../../components/layout/Footer';
import { UserRole } from '../../types';

interface RoleCardConfig {
  role: UserRole;
  title: string;
  topBorderColor: string;
  textColor: string;
  buttonBg: string;
  renderIllustration: () => React.ReactNode;
}

// ── Custom Rich Flat SVG Illustrations ──────────────────────────────────────────

const StudentIllustration: React.FC = () => (
  <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 relative flex items-center justify-center">
    <svg viewBox="0 0 80 80" fill="none" className="w-full h-full drop-shadow-sm">
      {/* Background Soft Glow Disc */}
      <circle cx="40" cy="40" r="36" fill="#EFF6FF" />
      <circle cx="40" cy="40" r="30" fill="#DBEAFE" />
      {/* Student Body / Robe */}
      <path d="M22 64C22 52.9543 30.0589 44 40 44C49.9411 44 58 52.9543 58 64H22Z" fill="#1D4ED8" />
      {/* White Collar / Shirt V */}
      <path d="M35 44L40 52L45 44H35Z" fill="#FFFFFF" />
      <path d="M38 52L40 58L42 52H38Z" fill="#F59E0B" />
      {/* Face */}
      <circle cx="40" cy="34" r="10" fill="#FDE68A" />
      {/* Hair */}
      <path d="M30 30C30 25.5817 34.4772 22 40 22C45.5228 22 50 25.5817 50 30C48 29 44 28 40 28C36 28 32 29 30 30Z" fill="#1E293B" />
      {/* Mortarboard Graduation Cap */}
      <polygon points="40,14 62,23 40,32 18,23" fill="#1E3A8A" />
      <polygon points="40,16 58,23 40,30 22,23" fill="#2563EB" />
      {/* Cap Skull Section */}
      <path d="M28 26V33C28 36.3137 33.3726 39 40 39C46.6274 39 52 36.3137 52 33V26" fill="#1E3A8A" opacity="0.9" />
      {/* Tassel */}
      <path d="M40 23L57 28V36" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
      <circle cx="57" cy="37" r="2" fill="#F59E0B" />
      <circle cx="40" cy="23" r="2" fill="#FDE68A" />
    </svg>
  </div>
);

const ParentIllustration: React.FC = () => (
  <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 relative flex items-center justify-center">
    <svg viewBox="0 0 80 80" fill="none" className="w-full h-full drop-shadow-sm">
      {/* Background Soft Glow Disc */}
      <circle cx="40" cy="40" r="36" fill="#ECFDF5" />
      <circle cx="40" cy="40" r="30" fill="#D1FAE5" />
      {/* Parent Figure (Left) */}
      <path d="M16 64C16 54.0589 23.1634 46 32 46C35.5 46 38.5 47.5 40 50C36 53 34 58 34 64H16Z" fill="#047857" />
      <circle cx="28" cy="35" r="8" fill="#FDE68A" />
      <path d="M21 33C21 28 24 25 29 25C34 25 36 28 36 33C33 32 31 31 28 31C25 31 23 32 21 33Z" fill="#065F46" />
      {/* Parent Figure (Right) */}
      <path d="M40 50C41.5 47.5 44.5 46 48 46C56.8366 46 64 54.0589 64 64H46C46 58 44 53 40 50Z" fill="#059669" />
      <circle cx="52" cy="35" r="8" fill="#FDE68A" />
      <path d="M44 32C44 26 48 24 53 24C58 24 60 27 60 32C57 31 55 30 52 30C48 30 46 31 44 32Z" fill="#047857" />
      {/* Child Figure (Center) */}
      <path d="M30 64C30 57.3726 34.4772 52 40 52C45.5228 52 50 57.3726 50 64H30Z" fill="#10B981" />
      <circle cx="40" cy="43" r="6" fill="#FEF3C7" />
      {/* Protective Heart Emblem */}
      <circle cx="40" cy="22" r="7" fill="#34D399" />
      <path d="M40 26.5L36.5 23C35.5 22 35.5 20.5 36.5 19.5C37.5 18.5 39 18.5 40 19.5C41 18.5 42.5 18.5 43.5 19.5C44.5 20.5 44.5 22 43.5 23L40 26.5Z" fill="#FFFFFF" />
    </svg>
  </div>
);

const FacultyIllustration: React.FC = () => (
  <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 relative flex items-center justify-center">
    <svg viewBox="0 0 80 80" fill="none" className="w-full h-full drop-shadow-sm">
      {/* Background Soft Glow Disc */}
      <circle cx="40" cy="40" r="36" fill="#F5F3FF" />
      <circle cx="40" cy="40" r="30" fill="#EDE9FE" />
      {/* Suit & Tie Body */}
      <path d="M20 64C20 52.9543 28.9543 44 40 44C51.0457 44 60 52.9543 60 64H20Z" fill="#6D28D9" />
      {/* Shirt */}
      <polygon points="40,44 46,44 40,54 34,44" fill="#FFFFFF" />
      {/* Red/Gold Tie */}
      <polygon points="38.5,47 41.5,47 42.5,58 40,62 37.5,58" fill="#F59E0B" />
      {/* Teacher Face */}
      <circle cx="40" cy="32" r="10" fill="#FDE68A" />
      {/* Professor Hair */}
      <path d="M29 30C29 23 34 19 40 19C46 19 51 23 51 30C48 28 44 27 40 27C36 27 32 28 29 30Z" fill="#4B5563" />
      {/* Glasses */}
      <rect x="33" y="30" width="6" height="4" rx="1" fill="#FFFFFF" stroke="#1E293B" strokeWidth="1.5" />
      <rect x="41" y="30" width="6" height="4" rx="1" fill="#FFFFFF" stroke="#1E293B" strokeWidth="1.5" />
      <line x1="39" y1="32" x2="41" y2="32" stroke="#1E293B" strokeWidth="1.5" />
      {/* Badge / Pen in pocket */}
      <rect x="26" y="52" width="6" height="2" rx="1" fill="#DDD6FE" />
      <rect x="28" y="49" width="2" height="4" rx="0.5" fill="#FBBF24" />
    </svg>
  </div>
);

const HodIllustration: React.FC = () => (
  <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 relative flex items-center justify-center">
    <svg viewBox="0 0 80 80" fill="none" className="w-full h-full drop-shadow-sm">
      {/* Background Soft Glow Disc */}
      <circle cx="40" cy="40" r="36" fill="#FFFBEB" />
      <circle cx="40" cy="40" r="30" fill="#FEF3C7" />
      {/* Executive Body */}
      <path d="M20 64C20 52.9543 28.9543 44 40 44C51.0457 44 60 52.9543 60 64H20Z" fill="#D97706" />
      {/* Executive Shirt & Tie */}
      <polygon points="40,44 46,44 40,55 34,44" fill="#FFFFFF" />
      <polygon points="38.5,47 41.5,47 42.5,59 40,63 37.5,59" fill="#B45309" />
      {/* Face */}
      <circle cx="40" cy="33" r="10" fill="#FDE68A" />
      {/* Hair */}
      <path d="M30 30C30 24 34 20 40 20C46 20 50 24 50 30C47 28 44 27 40 27C36 27 33 28 30 30Z" fill="#334155" />
      {/* Department Leadership Crown Badge */}
      <path d="M30 18L34 11L40 16L46 11L50 18H30Z" fill="#F59E0B" stroke="#B45309" strokeWidth="1" />
      <circle cx="34" cy="11" r="1.5" fill="#EF4444" />
      <circle cx="40" cy="16" r="1.5" fill="#3B82F6" />
      <circle cx="46" cy="11" r="1.5" fill="#EF4444" />
    </svg>
  </div>
);

const AdminIllustration: React.FC = () => (
  <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 relative flex items-center justify-center">
    <svg viewBox="0 0 80 80" fill="none" className="w-full h-full drop-shadow-sm">
      {/* Background Soft Glow Disc */}
      <circle cx="40" cy="40" r="36" fill="#F0FDFA" />
      <circle cx="40" cy="40" r="30" fill="#CCFBF1" />
      {/* Body */}
      <path d="M22 64C22 52.9543 30.0589 44 40 44C49.9411 44 58 52.9543 58 64H22Z" fill="#0F766E" />
      <polygon points="40,44 46,44 40,54 34,44" fill="#FFFFFF" />
      <polygon points="38.5,47 41.5,47 42.5,58 40,62 37.5,58" fill="#14B8A6" />
      {/* Face */}
      <circle cx="40" cy="33" r="10" fill="#FDE68A" />
      {/* Security Headset / Hair */}
      <path d="M30 30C30 24 34 20 40 20C46 20 50 24 50 30C47 28 44 27 40 27C36 27 33 28 30 30Z" fill="#134E4A" />
      {/* Security Shield Badge */}
      <path d="M40 9L48 13V18C48 22.5 44.5 26 40 27C35.5 26 32 22.5 32 18V13L40 9Z" fill="#0D9488" stroke="#115E59" strokeWidth="1" />
      {/* Checkmark in shield */}
      <path d="M36 17.5L39 20.5L44 15.5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

const CoordinatorIllustration: React.FC = () => (
  <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 relative flex items-center justify-center">
    <svg viewBox="0 0 80 80" fill="none" className="w-full h-full drop-shadow-sm">
      {/* Background Soft Glow Disc */}
      <circle cx="40" cy="40" r="36" fill="#FDF2F8" />
      <circle cx="40" cy="40" r="30" fill="#FCE7F3" />
      {/* Body */}
      <path d="M22 64C22 52.9543 30.0589 44 40 44C49.9411 44 58 52.9543 58 64H22Z" fill="#BE185D" />
      <polygon points="40,44 46,44 40,54 34,44" fill="#FFFFFF" />
      <polygon points="38.5,47 41.5,47 42.5,58 40,62 37.5,58" fill="#DB2777" />
      {/* Face */}
      <circle cx="40" cy="33" r="10" fill="#FDE68A" />
      <path d="M30 30C30 24 34 20 40 20C46 20 50 24 50 30C47 28 44 27 40 27C36 27 33 28 30 30Z" fill="#831843" />
      {/* 1st Year Star Badge */}
      <circle cx="40" cy="14" r="6" fill="#F59E0B" />
      <path d="M40 10.5L41.2 13.5L44.5 13.5L41.8 15.5L42.8 18.5L40 16.5L37.2 18.5L38.2 15.5L35.5 13.5L38.8 13.5Z" fill="#FFFFFF" />
    </svg>
  </div>
);

// ── Role Cards Configuration ──────────────────────────────────────────────────

const ROLE_CARDS: RoleCardConfig[] = [
  {
    role: 'student',
    title: 'Student',
    topBorderColor: 'border-blue-600',
    textColor: 'text-blue-600',
    buttonBg: 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/30',
    renderIllustration: () => <StudentIllustration />,
  },
  {
    role: 'parent',
    title: 'Parent',
    topBorderColor: 'border-emerald-600',
    textColor: 'text-emerald-600',
    buttonBg: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30',
    renderIllustration: () => <ParentIllustration />,
  },
  {
    role: 'faculty',
    title: 'Faculty',
    topBorderColor: 'border-purple-600',
    textColor: 'text-purple-600',
    buttonBg: 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/30',
    renderIllustration: () => <FacultyIllustration />,
  },
  {
    role: 'hod',
    title: 'HOD',
    topBorderColor: 'border-orange-500',
    textColor: 'text-orange-500',
    buttonBg: 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/30',
    renderIllustration: () => <HodIllustration />,
  },
  {
    role: 'coordinator',
    title: 'Coordinator',
    topBorderColor: 'border-pink-600',
    textColor: 'text-pink-600',
    buttonBg: 'bg-pink-600 hover:bg-pink-700 shadow-pink-600/30',
    renderIllustration: () => <CoordinatorIllustration />,
  },
  {
    role: 'admin',
    title: 'Admin',
    topBorderColor: 'border-teal-600',
    textColor: 'text-teal-600',
    buttonBg: 'bg-teal-600 hover:bg-teal-700 shadow-teal-600/30',
    renderIllustration: () => <AdminIllustration />,
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
      <div className="z-10 relative pt-6 sm:pt-10 pb-3 px-4 sm:px-6 lg:px-8 text-center max-w-5xl mx-auto shrink-0">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/95 p-1.5 shadow-2xl shadow-cyan-500/20 mb-3 ring-2 ring-white/20 backdrop-blur-md overflow-hidden hover:scale-105 transition-transform duration-300">
          <img
            src="/rgmcet-crest.png"
            alt="RGM Official Institutional Crest"
            className="w-full h-full object-contain filter drop-shadow-md"
          />
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-wider">
          <span className="text-white font-black drop-shadow-sm">RGM </span>
          <span className="text-cyan-400 font-black drop-shadow-[0_0_16px_rgba(56,217,232,0.9)] inline-block tracking-tight font-sans">EDU</span>
          <span className="text-white font-medium drop-shadow-sm tracking-widest inline-block" style={{ fontFamily: "'Kalam', cursive" }}>flow</span>
        </h1>

        <p className="mt-3 text-xs sm:text-sm text-slate-200/90 font-medium max-w-3xl mx-auto leading-relaxed px-4">
          A digital initiative by the institute facilitating Faculty, Staff, Students and Parents to access and process Academics, Research, Supporting services at one common platform.
        </p>
      </div>

      {/* ── Role Selection Section ── */}
      <main className="z-10 relative flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col justify-center">
        {/* ── 5 White Role Cards Grid (3 per row on desktop) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 justify-center">
          {ROLE_CARDS.map((card, idx) => {
            const isLastSingle = idx === 4;

            return (
              <div
                key={card.role}
                onClick={() => handleSelectRole(card.role)}
                className={`group cursor-pointer bg-white rounded-2xl p-6 sm:p-7 border-t-[5px] ${card.topBorderColor} shadow-xl hover:shadow-2xl hover:shadow-black/30 transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02] flex items-center justify-between gap-4 select-none relative overflow-hidden active:scale-[0.99] ${
                  isLastSingle ? 'md:col-span-2 lg:col-span-1 md:max-w-md md:mx-auto lg:max-w-none w-full' : ''
                }`}
              >
                {/* Left: Colorful Illustrated Graphic (~60-70px) */}
                <div className="shrink-0 transition-transform duration-200 group-hover:scale-105">
                  {card.renderIllustration()}
                </div>

                {/* Middle: Role Name as Bold Colored Text (~28-32px) */}
                <div className="flex-1 text-center sm:text-left">
                  <span
                    className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${card.textColor}`}
                  >
                    {card.title}
                  </span>
                </div>

                {/* Right: Small Square Action Button Matching Accent Color (~48-56px) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectRole(card.role);
                  }}
                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center text-white shadow-md transition-all duration-200 group-hover:scale-105 active:scale-95 shrink-0 cursor-pointer ${card.buttonBg}`}
                  title={`Log in as ${card.title}`}
                >
                  <LogIn className="w-5 h-5 sm:w-6 sm:h-6 transition-transform group-hover:translate-x-0.5" />
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
