import { useEffect } from 'react';

/** Role colour classes applied to <html> by the signed-in layout (see index.css). */
export const ROLE_THEME_CLASSES = [
  'theme-hod', 'theme-faculty', 'theme-admin',
  'theme-coordinator', 'theme-student', 'theme-parent', 'theme-oversight',
];

/**
 * Landing / login pages: drop any role colour left over from the previous session
 * and use the dedicated landing palette while mounted.
 */
export function useLandingTheme(): void {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove(...ROLE_THEME_CLASSES);
    html.classList.add('theme-landing');
    return () => html.classList.remove('theme-landing');
  }, []);
}
