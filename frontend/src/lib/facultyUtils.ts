import { FacultyFullProfile } from '../types';

/**
 * Calculates academic year based on institution cycle: June–May
 * e.g. Oct 2024 -> "2024–25", Feb 2025 -> "2024–25", June 2025 -> "2025–26"
 */
export function calculateAcademicYear(dateStr?: string): string {
  if (!dateStr) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const startYear = m >= 6 ? y : y - 1;
    return `${startYear}–${String(startYear + 1).slice(-2)}`;
  }

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '2024–25';

  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1-12
  const startYear = m >= 6 ? y : y - 1;
  return `${startYear}–${String(startYear + 1).slice(-2)}`;
}

/**
 * Calculates Experience in RGMCET dynamically from today − joining_date
 * Returns { years, months, text: "X years, Y months" }
 */
export function calculateRgmcetExperience(joiningDateStr?: string): { years: number; months: number; text: string } {
  if (!joiningDateStr) {
    return { years: 0, months: 0, text: '0 years, 0 months' };
  }

  const joinDate = new Date(joiningDateStr);
  if (isNaN(joinDate.getTime())) {
    return { years: 0, months: 0, text: '0 years, 0 months' };
  }

  const today = new Date();
  if (today < joinDate) {
    return { years: 0, months: 0, text: '0 years, 0 months' };
  }

  let years = today.getFullYear() - joinDate.getFullYear();
  let months = today.getMonth() - joinDate.getMonth();
  const days = today.getDate() - joinDate.getDate();

  if (days < 0) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  years = Math.max(0, years);
  months = Math.max(0, months);

  const text = `${years} year${years === 1 ? '' : 's'}, ${months} month${months === 1 ? '' : 's'}`;
  return { years, months, text };
}

/**
 * Calculates Total Experience = Experience in RGMCET + Prior Experience
 * Returns { years, months, text: "X years, Y months" }
 */
export function calculateTotalExperience(
  joiningDateStr?: string,
  priorYears: number = 0,
  priorMonths: number = 0
): { years: number; months: number; text: string } {
  const rgmcet = calculateRgmcetExperience(joiningDateStr);
  const totalMonths = (rgmcet.years * 12 + rgmcet.months) + (Number(priorYears || 0) * 12 + Number(priorMonths || 0));

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  const text = `${years} year${years === 1 ? '' : 's'}, ${months} month${months === 1 ? '' : 's'}`;
  return { years, months, text };
}

/**
 * Computes live profile completion percentage and missing fields list
 */
export function calculateFacultyProfileCompletion(profile?: Partial<FacultyFullProfile> | null): {
  percentage: number;
  missingSections: string[];
  isComplete: boolean;
} {
  if (!profile) {
    return {
      percentage: 0,
      missingSections: ['Personal Details', 'Educational Credentials', 'Certifications', 'Publications', 'Domain Expertise'],
      isComplete: false,
    };
  }

  const missing: string[] = [];
  let score = 0;

  // 1. Personal Details (35% total)
  const p = profile.personal;
  let personalScore = 0;
  if (p?.phone && p.phone.length === 10) personalScore += 7;
  if (p?.blood_group) personalScore += 5;
  if (p?.linkedin_url && p.linkedin_url.includes('linkedin.com')) personalScore += 6;
  if (p?.joining_date) personalScore += 7;
  if (p?.prior_experience_years !== undefined || p?.prior_experience_months !== undefined) personalScore += 5;
  if (p?.designation) personalScore += 5;

  score += personalScore;
  if (personalScore < 35) {
    missing.push('Personal & Experience Details');
  }

  // 2. Educational Details (20% total)
  const edu = profile.education;
  let eduScore = 0;
  if (edu?.highest_qualification) eduScore += 6;
  if (edu?.university) eduScore += 5;
  if (edu?.year_of_passing) eduScore += 4;
  if (edu?.specialization) eduScore += 5;

  score += eduScore;
  if (eduScore < 20) {
    missing.push('Educational Qualifications');
  }

  // 3. Certifications (15% total)
  if (profile.certifications && profile.certifications.length > 0) {
    score += 15;
  } else {
    missing.push('Certifications (Industry / NPTEL)');
  }

  // 4. Conferences / Workshops / FDPs (10% total)
  if (profile.activities && profile.activities.length > 0) {
    score += 10;
  } else {
    missing.push('Conferences / Workshops / FDPs');
  }

  // 5. Publications (10% total)
  if (profile.publications && profile.publications.length > 0) {
    score += 10;
  } else {
    missing.push('Publications (SCI / SCOPUS / Patents)');
  }

  // 6. Domain Expertise (10% total)
  if (profile.domains && profile.domains.length > 0) {
    score += 10;
  } else {
    missing.push('Domain Expertise Tags');
  }

  const percentage = Math.min(100, Math.round(score));
  return {
    percentage,
    missingSections: missing,
    isComplete: percentage === 100,
  };
}
