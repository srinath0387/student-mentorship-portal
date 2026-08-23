import React from 'react';
import { Heart, Sparkles } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full py-2 sm:py-2.5 px-4 border-t border-borderLine bg-surface shrink-0 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col items-center gap-1 text-center">
        {/* Motto Banner */}
        <div className="flex items-center justify-center gap-1.5">
          <Sparkles className="w-3 h-3 text-brand-primary" />
          <span className="text-[11px] font-black tracking-widest uppercase bg-gradient-to-r from-brand-primary via-indigo-500 to-sky-500 bg-clip-text text-transparent">
            Code &bull; Create &bull; Elevate
          </span>
          <Sparkles className="w-3 h-3 text-sky-500" />
        </div>

        {/* Handcrafted Credits */}
        <p className="text-xs text-slate-800 dark:text-slate-200 font-semibold leading-relaxed flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5">
          <span className="text-slate-700 dark:text-slate-300">Handcrafted with</span>
          <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500 inline-block animate-pulse" />
          <span className="text-slate-700 dark:text-slate-300">from</span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/30 text-[11px] font-black">
            RGMCET
          </span>
          <span className="text-slate-700 dark:text-slate-300">by</span>
          <span className="text-slate-900 dark:text-white font-extrabold">Jaya Krushna</span>,
          <span className="text-slate-900 dark:text-white font-extrabold">Dinesh Kumar</span>
          <span className="text-slate-700 dark:text-slate-300">&amp;</span>
          <span className="text-slate-900 dark:text-white font-extrabold">Jayanth Kumar Naidu</span>
          <span className="hidden sm:inline text-slate-400 dark:text-slate-500 mx-1 font-black">&bull;</span>
          <span className="w-full sm:w-auto mt-0.5 sm:mt-0 font-medium text-slate-700 dark:text-slate-300">
            Guided by <strong className="text-brand-primary dark:text-indigo-400 font-black">Mr. Y.P Srinath Reddy</strong>
          </span>
        </p>
      </div>
    </footer>
  );
};

