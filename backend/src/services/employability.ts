export interface EmployabilityData {
  academics?: { semester_gpa: number | string; attendance_pct?: number | string }[];
  codingProfiles?: {
    platform: string;
    handle?: string;
    score_rating?: number | string;
    commits_count?: number;
    streak?: number;
    easy_count?: number;
    medium_count?: number;
    hard_count?: number;
    contest_rating?: number;
    repositories_count?: number;
    prs_merged?: number;
    followers_count?: number;
    stars_count?: number;
    top_language?: string;
  }[];
  certifications?: {
    title?: string;
    certificate_name?: string;
    provider?: string;
    issuer?: string;
    verified?: boolean;
    status?: string;
    suggested?: boolean;
  }[];
  attendance?: { attendance_pct?: number | string; total_held?: number; total_present?: number };
}

export interface RPGLevel {
  levelNumber: number;
  title: string;
  badge: string;
  minXp: number;
  maxXp: number;
  color: string;
  textColor: string;
  bgGradient: string;
}

export const RPG_LEVELS: RPGLevel[] = [
  { levelNumber: 10, title: 'Mythic Grandmaster', badge: '👑', minXp: 900, maxXp: 1000, color: '#A855F7', textColor: 'text-purple-400', bgGradient: 'from-purple-900/40 via-fuchsia-900/30 to-purple-950/50' },
  { levelNumber: 9,  title: 'Legendary Master',   badge: '⚔️', minXp: 800, maxXp: 899,  color: '#EF4444', textColor: 'text-rose-400',   bgGradient: 'from-rose-900/40 via-red-900/30 to-rose-950/50' },
  { levelNumber: 8,  title: 'Diamond Artisan',    badge: '💎', minXp: 700, maxXp: 799,  color: '#06B6D4', textColor: 'text-cyan-400',   bgGradient: 'from-cyan-900/40 via-teal-900/30 to-cyan-950/50' },
  { levelNumber: 7,  title: 'Platinum Veteran',   badge: '🛡️', minXp: 600, maxXp: 699,  color: '#6366F1', textColor: 'text-indigo-400', bgGradient: 'from-indigo-900/40 via-blue-900/30 to-indigo-950/50' },
  { levelNumber: 6,  title: 'Gold Adventurer',    badge: '⚡', minXp: 500, maxXp: 599,  color: '#F59E0B', textColor: 'text-amber-400',  bgGradient: 'from-amber-900/40 via-yellow-900/30 to-amber-950/50' },
  { levelNumber: 5,  title: 'Silver Specialist',  badge: '🏹', minXp: 400, maxXp: 499,  color: '#94A3B8', textColor: 'text-slate-300',  bgGradient: 'from-slate-800/50 via-slate-900/40 to-slate-950/50' },
  { levelNumber: 4,  title: 'Bronze Practitioner', badge: '🌿', minXp: 300, maxXp: 399,  color: '#B45309', textColor: 'text-amber-600',  bgGradient: 'from-amber-950/40 via-orange-950/30 to-amber-900/20' },
  { levelNumber: 3,  title: 'Apprentice Novice III', badge: '🐣', minXp: 200, maxXp: 299, color: '#64748B', textColor: 'text-zinc-400',   bgGradient: 'from-zinc-900/40 via-zinc-800/30 to-zinc-950/50' },
  { levelNumber: 2,  title: 'Apprentice Novice II',  badge: '🐣', minXp: 100, maxXp: 199, color: '#52525B', textColor: 'text-zinc-400',   bgGradient: 'from-zinc-900/40 via-zinc-800/30 to-zinc-950/50' },
  { levelNumber: 1,  title: 'Apprentice Novice I',   badge: '🐣', minXp: 0,   maxXp: 99,  color: '#3F3F46', textColor: 'text-zinc-500',   bgGradient: 'from-zinc-900/40 via-zinc-800/30 to-zinc-950/50' },
];

export interface ScoreBreakdown {
  // 1000-Point RPG primary fields
  overallScore: number;     // 0 - 1000 XP
  levelNumber: number;      // 1 - 10
  levelTitle: string;
  badge: string;
  nextLevelXp: number;
  progressPercentage: number;

  // 4 Pillars (No tech skills)
  codingScore: number;      // Max 350 XP
  githubScore: number;      // Max 200 XP
  academicsScore: number;   // Max 250 XP
  certsScore: number;       // Max 200 XP

  // Detailed sub-breakdown
  codingBreakdown: {
    easyCount: number;
    easyPoints: number;
    mediumCount: number;
    mediumPoints: number;
    hardCount: number;
    hardPoints: number;
    contestRating: number;
    contestPoints: number;
    streak: number;
    streakPoints: number;
    platformCount: number;
    platformPoints: number;
  };

  githubBreakdown: {
    topLanguage: string;
    languagePoints: number;
    reposCount: number;
    repoPoints: number;
    commitsCount: number;
    commitPoints: number;
    prsMerged: number;
    prPoints: number;
    starsCount: number;
    starPoints: number;
    followersCount: number;
    followerPoints: number;
  };

  academicsBreakdown: {
    cgpa: number;
    gpaPoints: number;
    trendPoints: number;
    attendancePct: number;
    attendancePoints: number;
  };

  certsBreakdown: {
    totalCerts: number;
    platinumCount: number;
    goldCount: number;
    silverCount: number;
    bronzeCount: number;
    verifiedCount: number;
  };

  // Quests & Guidance
  feedback: string[];
  quests: { title: string; rewardXp: number; category: string }[];
}

export function calculateRPGScore(data: EmployabilityData): ScoreBreakdown {
  const quests: { title: string; rewardXp: number; category: string }[] = [];
  const feedback: string[] = [];

  // ──────────────────────────────────────────────────────────────────────────
  // 1. CODING MASTERY (Max 350 XP)
  // ──────────────────────────────────────────────────────────────────────────
  let easyCount = 0;
  let mediumCount = 0;
  let hardCount = 0;
  let maxContestRating = 0;
  let maxStreak = 0;
  let linkedCodingPlatforms = 0;

  if (data.codingProfiles && data.codingProfiles.length > 0) {
    for (const cp of data.codingProfiles) {
      const plat = (cp.platform || '').toLowerCase();
      if (plat === 'github') continue; // GitHub is handled separately in Pillar 2

      if (cp.handle && cp.handle !== 'Not Linked' && cp.handle.trim() !== '') {
        linkedCodingPlatforms++;
      }

      easyCount += Number(cp.easy_count || 0);
      mediumCount += Number(cp.medium_count || 0);
      hardCount += Number(cp.hard_count || 0);

      const rating = Number(cp.contest_rating || 0);
      if (rating > maxContestRating) maxContestRating = rating;

      const strk = Number(cp.streak || 0);
      if (strk > maxStreak) maxStreak = strk;
    }
  }

  // Easy: 1 pt each (cap 50 XP)
  const easyPoints = Math.min(50, easyCount * 1);
  // Medium: 3 pts each (cap 120 XP)
  const mediumPoints = Math.min(120, mediumCount * 3);
  // Hard: 6 pts each (cap 90 XP)
  const hardPoints = Math.min(90, hardCount * 6);

  // Contest Rating Bonus (Max 60 XP)
  let contestPoints = 0;
  if (maxContestRating >= 1800) contestPoints = 60;
  else if (maxContestRating >= 1600) contestPoints = 50;
  else if (maxContestRating >= 1400) contestPoints = 35;
  else if (maxContestRating >= 1200) contestPoints = 20;

  // Streak Bonus (Max 40 XP)
  let streakPoints = 0;
  if (maxStreak >= 60) streakPoints = 40;
  else if (maxStreak >= 30) streakPoints = 30;
  else if (maxStreak >= 15) streakPoints = 20;
  else if (maxStreak >= 7) streakPoints = 10;

  // Multi-Platform Diversity Bonus (Max 30 XP)
  let platformPoints = 0;
  if (linkedCodingPlatforms >= 3) platformPoints = 30;
  else if (linkedCodingPlatforms === 2) platformPoints = 15;
  else if (linkedCodingPlatforms === 1) platformPoints = 5;

  const rawCoding = easyPoints + mediumPoints + hardPoints + contestPoints + streakPoints + platformPoints;
  const codingScore = Math.min(350, Math.round(rawCoding * 10) / 10);

  if (mediumCount < 15) {
    quests.push({ title: 'Solve 10 more Medium problems on LeetCode/GFG', rewardXp: 30, category: 'Coding' });
  }
  if (hardCount < 3) {
    quests.push({ title: 'Solve 3 Hard DSA problems to boost problem mastery', rewardXp: 18, category: 'Coding' });
  }
  if (maxStreak < 15) {
    quests.push({ title: 'Achieve a 15-day continuous coding streak', rewardXp: 20, category: 'Coding' });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. GITHUB PROJECTS & TECH STACK (Max 200 XP)
  // ──────────────────────────────────────────────────────────────────────────
  let topLang = '';
  let reposCount = 0;
  let commitsCount = 0;
  let prsMerged = 0;
  let starsCount = 0;
  let followersCount = 0;

  const ghProfile = data.codingProfiles?.find(p => (p.platform || '').toLowerCase() === 'github');
  if (ghProfile) {
    topLang = ghProfile.top_language || '';
    reposCount = Number(ghProfile.repositories_count || 0);
    commitsCount = Number(ghProfile.commits_count || 0);
    prsMerged = Number(ghProfile.prs_merged || 0);
    starsCount = Number(ghProfile.stars_count || 0);
    followersCount = Number(ghProfile.followers_count || 0);
  }

  // Language & Stack Evaluation (Max 90 XP)
  const TIER_1_LANGS = ['python', 'c++', 'java', 'typescript', 'go', 'rust', 'react', 'node.js', 'next.js', 'flutter', 'docker'];
  const TIER_2_LANGS = ['c', 'javascript', 'c#', 'php', 'swift', 'kotlin', 'sql', 'ruby'];

  const normalizedLang = topLang.toLowerCase().trim();
  let languagePoints = 0;
  if (normalizedLang && TIER_1_LANGS.some(t => normalizedLang.includes(t))) {
    languagePoints = 90;
  } else if (normalizedLang && TIER_2_LANGS.some(t => normalizedLang.includes(t))) {
    languagePoints = 60;
  } else if (normalizedLang) {
    languagePoints = 30; // Basic HTML/CSS/Shell
  } else if (reposCount > 0) {
    languagePoints = 40; // Has repos but language uncategorized
  }

  // Repositories: 5 XP each, max 30 XP (6 repos)
  const repoPoints = Math.min(30, reposCount * 5);
  // Commits: 1 XP per 5 commits, max 25 XP (125 commits)
  const commitPoints = Math.min(25, Math.floor(commitsCount / 5));
  // PRs: 5 XP per merged PR, max 15 XP
  const prPoints = Math.min(15, prsMerged * 5);
  // Stars: 5 XP per star, max 30 XP
  const starPoints = Math.min(30, starsCount * 5);
  // Followers: 2 XP per follower, max 10 XP
  const followerPoints = Math.min(10, followersCount * 2);

  const rawGithub = languagePoints + repoPoints + commitPoints + prPoints + starPoints + followerPoints;
  const githubScore = Math.min(200, Math.round(rawGithub * 10) / 10);

  if (reposCount < 3) {
    quests.push({ title: 'Publish 2 full-stack / core engineering projects on GitHub', rewardXp: 30, category: 'GitHub' });
  }
  if (!normalizedLang || languagePoints < 90) {
    quests.push({ title: 'Build a project using Python, C++, Java, or TypeScript', rewardXp: 30, category: 'GitHub' });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. ACADEMICS & GPA CONSISTENCY (Max 250 XP)
  // ──────────────────────────────────────────────────────────────────────────
  let gpaPoints = 0;
  let trendPoints = 0;
  let cgpa = 0;

  if (data.academics && data.academics.length > 0) {
    const gpas = data.academics
      .map(a => Number(a.semester_gpa || 0))
      .filter(g => g > 0);

    if (gpas.length > 0) {
      cgpa = gpas.reduce((s, g) => s + g, 0) / gpas.length;
      cgpa = Math.round(cgpa * 100) / 100;

      // Cumulative GPA: (CGPA / 10) * 200 (Max 200 XP)
      gpaPoints = Math.min(200, (cgpa / 10) * 200);

      // Trend Bonus (Max 30 XP)
      if (gpas.length >= 2) {
        const last = gpas[gpas.length - 1];
        const prev = gpas[gpas.length - 2];
        if (last >= prev || last >= 8.5) {
          trendPoints = 30;
        } else if (last >= 7.5) {
          trendPoints = 15;
        }
      } else if (cgpa >= 8.0) {
        trendPoints = 20;
      }
    }
  }

  // Attendance Discipline (Max 20 XP)
  let attPct = 0;
  if (data.attendance?.attendance_pct != null) {
    attPct = Number(data.attendance.attendance_pct);
  } else if (data.academics && data.academics.length > 0) {
    const attVals = data.academics
      .map(a => Number(a.attendance_pct || 0))
      .filter(p => p > 0);
    if (attVals.length > 0) {
      attPct = attVals.reduce((s, a) => s + a, 0) / attVals.length;
    }
  }

  let attendancePoints = 0;
  if (attPct >= 85) attendancePoints = 20;
  else if (attPct >= 75) attendancePoints = 10;

  const rawAcademics = gpaPoints + trendPoints + attendancePoints;
  const academicsScore = Math.min(250, Math.round(rawAcademics * 10) / 10);

  if (cgpa < 8.0) {
    quests.push({ title: 'Aim for ≥ 8.0 GPA in upcoming semester exams', rewardXp: 30, category: 'Academics' });
  }
  if (attPct < 85 && attPct > 0) {
    quests.push({ title: 'Boost attendance above 85% for full discipline points', rewardXp: 10, category: 'Academics' });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. INDUSTRY CERTIFICATIONS & CREDENTIALS (Max 200 XP)
  // ──────────────────────────────────────────────────────────────────────────
  let platinumCount = 0;
  let goldCount = 0;
  let silverCount = 0;
  let bronzeCount = 0;
  let verifiedCount = 0;

  const PLATINUM_PROVIDERS = ['aws', 'amazon', 'google', 'gcp', 'azure', 'microsoft', 'cisco', 'oracle', 'redhat'];
  const GOLD_PROVIDERS = ['meta', 'ibm', 'coursera', 'edx', 'salesforce'];
  const SILVER_PROVIDERS = ['nptel', 'swayam', 'infosys', 'springboard', 'eduskills', 'hackerrank', 'aicte'];

  if (data.certifications && data.certifications.length > 0) {
    for (const cert of data.certifications) {
      if (cert.suggested) continue;

      const provider = (cert.provider || cert.issuer || '').toLowerCase();
      const isVerified = Boolean(cert.verified || cert.status === 'verified');
      if (isVerified) verifiedCount++;

      if (PLATINUM_PROVIDERS.some(p => provider.includes(p))) {
        platinumCount++;
      } else if (GOLD_PROVIDERS.some(p => provider.includes(p))) {
        goldCount++;
      } else if (SILVER_PROVIDERS.some(p => provider.includes(p))) {
        silverCount++;
      } else {
        bronzeCount++;
      }
    }
  }

  const certPointsRaw =
    platinumCount * 50 +
    goldCount * 35 +
    silverCount * 25 +
    bronzeCount * 10 +
    verifiedCount * 10;

  const certsScore = Math.min(200, Math.round(certPointsRaw * 10) / 10);

  if (platinumCount === 0) {
    quests.push({ title: 'Earn a Cloud / Networking certification (AWS, Google, Cisco)', rewardXp: 50, category: 'Certifications' });
  }
  if (silverCount === 0 && goldCount === 0 && platinumCount === 0) {
    quests.push({ title: 'Complete an NPTEL or Coursera technical certification', rewardXp: 25, category: 'Certifications' });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TOTAL XP & LEVEL CALCULATION
  // ──────────────────────────────────────────────────────────────────────────
  const overallScore = Math.min(1000, Math.round((codingScore + githubScore + academicsScore + certsScore) * 10) / 10);

  // Find level
  const currentLevel = RPG_LEVELS.find(lvl => overallScore >= lvl.minXp && overallScore <= lvl.maxXp) || RPG_LEVELS[RPG_LEVELS.length - 1];

  let nextLevelXp = 1000;
  const nextLvl = RPG_LEVELS.find(lvl => lvl.levelNumber === currentLevel.levelNumber + 1);
  if (nextLvl) {
    nextLevelXp = nextLvl.minXp;
  }

  const rangeSpan = Math.max(1, currentLevel.maxXp - currentLevel.minXp);
  const progressPercentage = Math.min(100, Math.round(((overallScore - currentLevel.minXp) / rangeSpan) * 100));

  if (overallScore >= 800) {
    feedback.push('Outstanding engineering profile! You qualify for Tier-1 Super Dream placements.');
  } else if (overallScore >= 600) {
    feedback.push('Strong competitive profile. Level up by adding Hard DSA problems and Cloud certs.');
  } else if (overallScore >= 400) {
    feedback.push('Solid foundation. Link more platforms and publish active GitHub projects to climb ranks.');
  } else {
    feedback.push('Begin linking your LeetCode and GitHub profiles to rapidly gain initial levels.');
  }

  return {
    overallScore,
    levelNumber: currentLevel.levelNumber,
    levelTitle: currentLevel.title,
    badge: currentLevel.badge,
    nextLevelXp,
    progressPercentage,

    codingScore,
    githubScore,
    academicsScore,
    certsScore,

    codingBreakdown: {
      easyCount,
      easyPoints,
      mediumCount,
      mediumPoints,
      hardCount,
      hardPoints,
      contestRating: maxContestRating,
      contestPoints,
      streak: maxStreak,
      streakPoints,
      platformCount: linkedCodingPlatforms,
      platformPoints,
    },

    githubBreakdown: {
      topLanguage: topLang || 'Not specified',
      languagePoints,
      reposCount,
      repoPoints,
      commitsCount,
      commitPoints,
      prsMerged,
      prPoints,
      starsCount,
      starPoints,
      followersCount,
      followerPoints,
    },

    academicsBreakdown: {
      cgpa,
      gpaPoints: Math.round(gpaPoints * 10) / 10,
      trendPoints,
      attendancePct: Math.round(attPct * 10) / 10,
      attendancePoints,
    },

    certsBreakdown: {
      totalCerts: platinumCount + goldCount + silverCount + bronzeCount,
      platinumCount,
      goldCount,
      silverCount,
      bronzeCount,
      verifiedCount,
    },

    feedback,
    quests: quests.slice(0, 3),
  };
}

// Backward-compatible alias used by existing endpoints
export function calculateEmployabilityScore(data: any): any {
  const rpg = calculateRPGScore(data);
  return {
    ...rpg,
    // Aliases so existing frontend components looking for old field names do not crash
    techSkillsScore: 0,
    softSkillsScore: 0,
    achievementsScore: 0,
  };
}
