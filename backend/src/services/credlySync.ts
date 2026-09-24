import { db } from '../db';

/**
 * Normalizes certification names to a canonical format.
 */
export function normalizeCertName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses public Credly profile badge metadata.
 * Fetches JSON metadata for public badges or user profile.
 */
export async function syncStudentCredlyCertifications(rollNumber: string, credlyUrl: string) {
  if (!credlyUrl || !credlyUrl.includes('credly.com')) return { synced: 0 };

  try {
    const cleanUrl = credlyUrl.trim().replace(/\/badges\/?$/, '').replace(/\/$/, '');
    const userSlug = cleanUrl.split('/').filter(Boolean).pop();

    if (!userSlug) return { synced: 0 };

    const response = await fetch(`https://www.credly.com/users/${userSlug}/badges.json`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Advitiyans-Portal-Sync/1.0' }
    });

    if (!response.ok) return { synced: 0 };

    const data: any = await response.json();
    const badges = data?.data || [];
    let count = 0;

    for (const badge of badges) {
      const badgeName = badge.badge_template?.name;
      const issuerName = badge.badge_template?.issuer?.name || badge.issuer?.summary || 'Credly';
      const issueDate = badge.issued_at_date;
      const badgeUrl = `https://www.credly.com/badges/${badge.id}/public_url`;
      const imageUrl = badge.badge_template?.image_url;

      if (!badgeName) continue;

      const canonical = normalizeCertName(badgeName);

      // Upsert into master catalog
      const catRes = await db.query(
        `INSERT INTO certification_catalogs (canonical_name, display_name, issuer)
         VALUES ($1, $2, $3)
         ON CONFLICT (canonical_name) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`,
        [canonical, badgeName, issuerName]
      );
      const catalogId = catRes.rows[0]?.id;

      // Upsert into student certifications (source = 'credly')
      await db.query(
        `INSERT INTO student_certifications (
          catalog_id, roll_number, certificate_name, issuer, issue_date, 
          verification_url, badge_image_url, source, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'credly', 'verified')
        ON CONFLICT (roll_number, certificate_name, issue_date) 
        DO UPDATE SET 
          verification_url = EXCLUDED.verification_url,
          badge_image_url = EXCLUDED.badge_image_url,
          status = 'verified'`,
        [catalogId, rollNumber.toUpperCase(), badgeName, issuerName, issueDate || null, badgeUrl, imageUrl || null]
      );
      count++;
    }
    return { synced: count };
  } catch (err) {
    console.error(`Credly sync error for ${rollNumber}:`, err);
    return { synced: 0, error: String(err) };
  }
}
