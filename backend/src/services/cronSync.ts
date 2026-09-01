import { db } from '../db';
import https from 'https';

interface SyncResult {
  totalProcessed: number;
  leetcodeUpdated: number;
  githubUpdated: number;
  timestamp: string;
}

export function cleanLeetCodeHandle(handle: string): string {
  if (!handle) return '';
  return handle
    .trim()
    .replace(/^https?:\/\/(www\.)?leetcode\.com\/(u\/|profile\/)?/i, '')
    .replace(/^https?:\/\/(www\.)?leetcode\.cn\/(u\/|profile\/)?/i, '')
    .replace(/^u\//i, '')
    .replace(/^profile\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    .trim();
}

export function cleanGitHubHandle(handle: string): string {
  if (!handle) return '';
  return handle
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    .trim();
}

export function cleanEduSkillsHandle(handle: string): string {
  if (!handle) return '';
  return handle
    .trim()
    .replace(/^https?:\/\/(www\.)?credly\.com\/(users|earner\/earned\/badge)?\/?/i, '')
    .replace(/^https?:\/\/(www\.)?eduskillsfoundation\.org\/(verify|student)?\/?/i, '')
    .replace(/^u\//i, '')
    .replace(/^users\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    .trim();
}

export interface EduSkillsBadgeItem {
  id: string;
  title: string;
  issuer: string;
  issuedAt: string | null;
  badgeUrl: string;
  verifyUrl: string;
  category: string;
}

export interface EduSkillsResult {
  totalCertificates: number;
  badges: EduSkillsBadgeItem[];
  categories: Record<string, number>;
  username: string;
}

export async function fetchEduSkillsStatsDirect(handle: string): Promise<EduSkillsResult | null> {
  const cleanHandle = cleanEduSkillsHandle(handle);
  if (!cleanHandle || cleanHandle.toLowerCase() === 'not linked') return null;

  try {
    const credlyRes: any = await new Promise((resolve) => {
      const opts = {
        hostname: 'www.credly.com',
        path: `/users/${encodeURIComponent(cleanHandle)}/badges.json`,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      };

      const req = https.request(opts, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(raw));
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.setTimeout(6000, () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    });

    const rawBadges = Array.isArray(credlyRes?.data) ? credlyRes.data : [];
    const categories: Record<string, number> = {
      'Cloud Computing': 0,
      'Cybersecurity': 0,
      'Data & AI': 0,
      'RPA & Automation': 0,
      'Networking & Systems': 0,
      'Other': 0,
    };

    const badges: EduSkillsBadgeItem[] = rawBadges.map((b: any) => {
      const template = b.badge_template || {};
      const title = template.name || 'EduSkills Certified Course';
      const issuer = template.issuer?.name || b.issuer?.name || 'EduSkills / Partner Academy';
      const issuedAt = b.issued_at_date || b.issued_at || null;
      const badgeUrl = template.image_url || b.image_url || '';
      const verifyUrl = `https://www.credly.com/badges/${b.id}`;

      // Auto-categorize by certification title
      const lower = title.toLowerCase();
      let cat = 'Other';
      if (lower.includes('aws') || lower.includes('cloud') || lower.includes('azure') || lower.includes('google cloud')) {
        cat = 'Cloud Computing';
      } else if (lower.includes('security') || lower.includes('palo alto') || lower.includes('fortinet') || lower.includes('cyber')) {
        cat = 'Cybersecurity';
      } else if (lower.includes('alteryx') || lower.includes('data') || lower.includes('machine learning') || lower.includes('ai') || lower.includes('analytics')) {
        cat = 'Data & AI';
      } else if (lower.includes('blue prism') || lower.includes('automation') || lower.includes('rpa') || lower.includes('uipath') || lower.includes('celonis')) {
        cat = 'RPA & Automation';
      } else if (lower.includes('red hat') || lower.includes('cisco') || lower.includes('network') || lower.includes('linux')) {
        cat = 'Networking & Systems';
      }
      categories[cat] = (categories[cat] || 0) + 1;

      return {
        id: b.id || String(Date.now()),
        title,
        issuer,
        issuedAt,
        badgeUrl,
        verifyUrl,
        category: cat,
      };
    });

    return {
      totalCertificates: badges.length,
      badges,
      categories,
      username: cleanHandle,
    };
  } catch (err: any) {
    console.warn(`[EduSkills Sync] Error for ${cleanHandle}:`, err?.message || err);
    return null;
  }
}

// Fetch live LeetCode stats with GraphQL and multi-proxy fallback
export async function fetchLeetCodeStatsDirect(handle: string): Promise<{ solved: number; easy: number; medium: number; hard: number; ranking?: number; streak?: number } | null> {
  const cleanHandle = cleanLeetCodeHandle(handle);
  if (!cleanHandle || cleanHandle.toLowerCase() === 'not linked') return null;

  // 1. Try official LeetCode GraphQL
  try {
    const gql = `
      query userProblemsSolved($username: String!) {
        matchedUser(username: $username) {
          username
          profile { ranking reputation }
          userCalendar { streak }
          submitStats: submitStatsGlobal {
            acSubmissionNum { difficulty count }
          }
        }
      }
    `;

    const postData = JSON.stringify({ query: gql, variables: { username: cleanHandle } });

    const graphRes: any = await new Promise((resolve) => {
      const opts = {
        hostname: 'leetcode.com',
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
          'Referer': 'https://leetcode.com',
          'Origin': 'https://leetcode.com',
          'Accept': 'application/json',
        },
      };

      const req = https.request(opts, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(raw));
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.setTimeout(5000, () => {
        req.destroy();
        resolve(null);
      });
      req.write(postData);
      req.end();
    });

    const user = graphRes?.data?.matchedUser;
    if (user) {
      const stats = user.submitStats?.acSubmissionNum || [];
      const total = stats.find((s: any) => s.difficulty === 'All')?.count || 0;
      const easy = stats.find((s: any) => s.difficulty === 'Easy')?.count || 0;
      const medium = stats.find((s: any) => s.difficulty === 'Medium')?.count || 0;
      const hard = stats.find((s: any) => s.difficulty === 'Hard')?.count || 0;
      return {
        solved: total || (easy + medium + hard),
        easy,
        medium,
        hard,
        ranking: user.profile?.ranking || 0,
        streak: user.userCalendar?.streak || 0,
      };
    }
  } catch (_) {}

  // 2. Fallback to alfa-leetcode-api
  try {
    const alfaRes: any = await new Promise((resolve) => {
      const req = https.get(
        `https://alfa-leetcode-api.onrender.com/${encodeURIComponent(cleanHandle)}/solved`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => {
            try {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                resolve(JSON.parse(raw));
              } else {
                resolve(null);
              }
            } catch {
              resolve(null);
            }
          });
        }
      );
      req.on('error', () => resolve(null));
      req.setTimeout(6000, () => {
        req.destroy();
        resolve(null);
      });
    });

    if (alfaRes && typeof alfaRes.solvedProblem === 'number') {
      return {
        solved: alfaRes.solvedProblem,
        easy: alfaRes.easySolved || 0,
        medium: alfaRes.mediumSolved || 0,
        hard: alfaRes.hardSolved || 0,
        ranking: 0,
        streak: 0,
      };
    }
  } catch (_) {}

  return null;
}

// Fetch live GitHub stats via GitHub API
export async function fetchGitHubStatsDirect(handle: string): Promise<{ repos: number; followers: number; stars: number; topLanguage: string } | null> {
  try {
    const cleanHandle = cleanGitHubHandle(handle);
    if (!cleanHandle || cleanHandle.toLowerCase() === 'not linked') return null;

    return new Promise((resolve) => {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Advitiyans-CronSync/1.0',
      };
      if (process.env.GITHUB_PAT) {
        headers['Authorization'] = `Bearer ${process.env.GITHUB_PAT}`;
      }

      const req = https.get(`https://api.github.com/users/${encodeURIComponent(cleanHandle)}`, { headers }, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', async () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              const user = JSON.parse(raw);
              if (user && typeof user.public_repos === 'number') {
                const repos = user.public_repos;
                const followers = user.followers || 0;

                // Secondary call for repo stats
                let stars = 0;
                let topLanguage = '';
                try {
                  const repoRes: any[] = await new Promise((rRes, rRej) => {
                    const rReq = https.get(
                      `https://api.github.com/users/${encodeURIComponent(cleanHandle)}/repos?per_page=100&sort=pushed`,
                      { headers },
                      (r) => {
                        let d = '';
                        r.on('data', (c) => (d += c));
                        r.on('end', () => {
                          try { rRes(JSON.parse(d)); } catch { rRes([]); }
                        });
                      }
                    );
                    rReq.on('error', () => rRes([]));
                    rReq.setTimeout(4000, () => { rReq.destroy(); rRes([]); });
                  });

                  if (Array.isArray(repoRes)) {
                    stars = repoRes.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
                    const langCounts: Record<string, number> = {};
                    for (const r of repoRes) {
                      if (r.language) langCounts[r.language] = (langCounts[r.language] || 0) + 1;
                    }
                    topLanguage = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
                  }
                } catch (_) { /* ignore */ }

                resolve({ repos, followers, stars, topLanguage });
                return;
              }
            }
            resolve(null);
          } catch (_) {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.setTimeout(6000, () => {
        req.destroy();
        resolve(null);
      });
    });
  } catch (_) {
    return null;
  }
}

// Batch parallel sync with concurrency limit
export async function runCodingProfileCronSync(limit = 100): Promise<SyncResult> {
  console.log('[CronSync] Starting scheduled coding profile background sync...');
  const result: SyncResult = {
    totalProcessed: 0,
    leetcodeUpdated: 0,
    githubUpdated: 0,
    timestamp: new Date().toISOString(),
  };

  if (db.isMock) {
    console.log('[CronSync] Running in mock mode. Skipped live DB updates.');
    return result;
  }

  try {
    const profilesRes = await db.query(
      `SELECT student_id, platform, handle FROM coding_profiles
       WHERE handle IS NOT NULL AND handle != '' AND handle != 'Not Linked'
       ORDER BY updated_at ASC NULLS FIRST
       LIMIT $1`,
      [limit]
    );

    const rows = profilesRes.rows;
    result.totalProcessed = rows.length;

    // Process in parallel chunks of 8
    const CHUNK_SIZE = 8;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (row) => {
          const { student_id, platform, handle } = row;
          const platLower = String(platform).toLowerCase();

          if (platLower === 'leetcode') {
            const lcData = await fetchLeetCodeStatsDirect(handle);
            if (lcData) {
              await db.query(
                `UPDATE coding_profiles
                 SET score_rating = $1, easy_count = $2, medium_count = $3, hard_count = $4,
                     streak = COALESCE($5, streak), last_synced = CURRENT_TIMESTAMP
                 WHERE student_id = $6 AND LOWER(platform) = 'leetcode'`,
                [lcData.solved, lcData.easy, lcData.medium, lcData.hard, lcData.streak || 0, student_id]
              ).catch(() => {});
              result.leetcodeUpdated++;
            }
          } else if (platLower === 'github') {
            const ghData = await fetchGitHubStatsDirect(handle);
            if (ghData) {
              await db.query(
                `UPDATE coding_profiles
                 SET repositories_count = $1, followers_count = $2, stars_count = $3,
                     top_language = $4, last_synced = CURRENT_TIMESTAMP
                 WHERE student_id = $5 AND LOWER(platform) = 'github'`,
                [ghData.repos, ghData.followers, ghData.stars, ghData.topLanguage, student_id]
              ).catch(() => {});
              result.githubUpdated++;
            }
          } else if (platLower === 'eduskills') {
            const eduData = await fetchEduSkillsStatsDirect(handle);
            if (eduData) {
              await db.query(
                `UPDATE coding_profiles
                 SET score_rating = $1, repositories_count = $1, last_synced = CURRENT_TIMESTAMP
                 WHERE student_id = $2 AND LOWER(platform) = 'eduskills'`,
                [eduData.totalCertificates, student_id]
              ).catch(() => {});
            }
          }
        })
      );
    }
    console.log(`[CronSync] Completed sync. Total: ${result.totalProcessed}, LeetCode: ${result.leetcodeUpdated}, GitHub: ${result.githubUpdated}`);
  } catch (err: any) {
    console.error('[CronSync] Background sync error:', err.message || err);
  }

  return result;
}
