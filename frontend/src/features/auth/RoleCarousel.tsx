import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LogIn } from 'lucide-react';

export interface CarouselRole {
  id: string;
  title: string;
  category: 'staff_student' | 'oversight';
  icon: React.FC<{ className?: string }>;
  accentColor: string;
  description: string;
}

/** What each ID card promises — three short lines. */
const FEATURES: Record<string, string[]> = {
  student: ['Attendance & marks', 'Certificates & documents', 'Coding profile & placements'],
  parent: ["Ward's attendance", 'Mentor reviews', 'Academic progress'],
  faculty: ['Take attendance', 'Leaves & office orders', 'Mentees & API score'],
  hod: ['Department analytics', 'Leave & OD approvals', 'Workload & compliance'],
  coordinator: ['First-year induction', 'Sectioning', 'Class incharges'],
  admin: ['Student & faculty records', 'Attendance control', 'Portal settings'],
  management: ['Executive KPIs', 'Compliance & governance', 'Institution reports'],
  principal: ['Executive KPIs', 'Duties & office orders', 'Leave sanctions'],
  director: ['College-wide analytics', 'Research index', 'Strategic reports'],
  program_chair: ['CSE & allied branches', 'Faculty & student analytics', 'Documents & leaderboard'],
};

const cardKind = (r: CarouselRole) =>
  r.category === 'oversight' ? 'OVERSIGHT ID' : r.id === 'student' ? 'STUDENT ID' : r.id === 'parent' ? 'PARENT PASS' : 'STAFF ID';

export const cardHeaderClass = (r: { category: string }) =>
  r.category === 'oversight' ? 'bg-gradient-to-br from-indigo-600 to-violet-700' : 'bg-gradient-to-br from-brand-primary to-violet-600';

/** Gradient header shared by the card front and the login form (card back). */
export const IdCardHeader: React.FC<{ role: CarouselRole; right?: React.ReactNode }> = ({ role, right }) => (
  <div className={`${cardHeaderClass(role)} text-white px-5 py-4 flex items-center justify-between gap-3`}>
    <div className="min-w-0">
      <p className="text-[10px] font-black tracking-[0.18em] text-white/75">RGMCET · {cardKind(role)}</p>
      <p className="text-lg font-black truncate">{role.title}</p>
    </div>
    {right ?? (
      <div className="w-10 h-10 rounded-xl bg-white p-1 shrink-0">
        <img src="/rgmcet-crest.png" alt="" className="w-full h-full object-contain" />
      </div>
    )}
  </div>
);

interface Props {
  roles: CarouselRole[];
  index: number;
  onIndexChange: (i: number) => void;
  /** Open the login form for the centred card */
  onOpen: () => void;
}

/**
 * 3D ID-card carousel for picking a login role: arrows, ←/→ keys, swipe, or tap a side card.
 * The centred card's button opens the login form (the card "flips").
 */
export const RoleCarousel: React.FC<Props> = ({ roles, index, onIndexChange, onOpen }) => {
  const n = roles.length;
  const go = (d: number) => onIndexChange((index + d + n) % n);
  const touchX = useRef<number | null>(null);
  const [spread, setSpread] = useState(220);

  useEffect(() => {
    const fit = () => setSpread(Math.max(120, Math.min(230, window.innerWidth * 0.26)));
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'Enter') onOpen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const groups: { label: string; ids: string[] }[] = [
    { label: 'Students', ids: ['student', 'parent'] },
    { label: 'Staff', ids: ['faculty', 'hod', 'coordinator', 'admin'] },
    { label: 'Oversight', ids: ['principal', 'director', 'management', 'program_chair'] },
  ];

  return (
    <div className="w-full select-none">
      <div
        className="relative h-[330px] sm:h-[350px]"
        onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={e => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current; touchX.current = null;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
        role="listbox"
        aria-label="Choose your login role"
      >
        {roles.map((r, i) => {
          let o = i - index;
          if (o > n / 2) o -= n;
          if (o < -n / 2) o += n;
          const abs = Math.abs(o);
          if (abs > 2) return null;
          const center = o === 0;
          const Icon = r.icon;
          return (
            <div
              key={r.id}
              role="option"
              aria-selected={center}
              onClick={() => (center ? onOpen() : onIndexChange(i))}
              className="absolute left-1/2 top-2 w-[250px] sm:w-[280px] cursor-pointer transition-all duration-500 ease-out motion-reduce:transition-none"
              style={{
                transform: `translateX(calc(-50% + ${o * spread}px)) perspective(1100px) rotateY(${-o * 24}deg) scale(${1 - abs * 0.13})`,
                zIndex: 10 - abs,
                opacity: abs === 2 ? 0.35 : abs === 1 ? 0.8 : 1,
                filter: center ? 'none' : 'saturate(.6)',
              }}
            >
              <div className={`neu-raised rounded-[24px] overflow-hidden ${center ? 'ring-1 ring-brand-primary/20' : ''}`}>
                <IdCardHeader role={r} />
                <div className="p-5 space-y-4">
                  <div className="flex gap-3.5 items-center">
                    <div className={`w-16 h-20 rounded-xl flex items-center justify-center shrink-0 border ${r.accentColor}`}>
                      <Icon className="w-8 h-8" />
                    </div>
                    <ul className="text-[11px] text-slate-600 space-y-1 min-w-0">
                      {(FEATURES[r.id] || []).map(f => <li key={f} className="truncate">• {f}</li>)}
                    </ul>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug line-clamp-2 min-h-[30px]">{r.description}</p>
                  <button
                    type="button"
                    tabIndex={center ? 0 : -1}
                    onClick={e => { e.stopPropagation(); center ? onOpen() : onIndexChange(i); }}
                    className={`w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${center ? 'bg-brand-primary text-white neu-accent hover:scale-[1.01]' : 'neu-raised-sm text-slate-500'}`}
                  >
                    <LogIn className="w-3.5 h-3.5" />{center ? `Login as ${r.title.replace(/ \(.*\)$/, '')}` : 'Select'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        <button type="button" onClick={() => go(-1)} aria-label="Previous role"
          className="absolute left-0 sm:left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full neu-raised-sm flex items-center justify-center text-slate-600 hover:text-brand-primary">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button type="button" onClick={() => go(1)} aria-label="Next role"
          className="absolute right-0 sm:right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full neu-raised-sm flex items-center justify-center text-slate-600 hover:text-brand-primary">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Quick jump — grouped role chips */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-1">
        {groups.map(g => (
          <div key={g.label} className="flex items-center gap-1.5 flex-wrap justify-center">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{g.label}</span>
            {g.ids.map(id => {
              const i = roles.findIndex(r => r.id === id);
              if (i < 0) return null;
              const on = i === index;
              return (
                <button key={id} type="button" onClick={() => onIndexChange(i)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${on ? 'bg-brand-primary text-white' : 'neu-raised-sm text-slate-600 hover:text-brand-primary'}`}>
                  {roles[i].title.replace(/ \(.*\)$/, '').replace('Institutional ', '').replace('1st Year ', '')}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default RoleCarousel;
