/**
 * services/passwordService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 1.1 extraction — moved from api.ts lines 33–70
 *
 * Handles bcrypt password comparison with seamless legacy-plaintext upgrade.
 * Extracted so it can be independently unit-tested and reused across
 * auth routes without being buried in the 11k-line monolith.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import bcrypt from 'bcryptjs';

export const BCRYPT_ROUNDS = 10;

/**
 * Compare an entered plaintext password against a stored password.
 *
 * Supports two storage formats:
 *   1. bcrypt hash (starts with $2a$, $2b$, $2y$) — compared via bcrypt.compare()
 *   2. Legacy plaintext — compared directly, then silently upgraded to bcrypt
 *      via `upgradeCallback` if provided.
 *
 * @param entered         The plaintext password the user just typed
 * @param stored          The stored password (may be bcrypt hash or plaintext)
 * @param upgradeCallback Optional async function that persists the new bcrypt hash to DB
 * @returns true if passwords match, false otherwise
 */
export async function compareAndUpgradePassword(
  entered: string,
  stored: string,
  upgradeCallback?: (newHash: string) => Promise<void>
): Promise<boolean> {
  if (!entered || !stored) return false;

  let isMatch = false;
  const isBcrypt =
    stored.startsWith('$2a$') ||
    stored.startsWith('$2b$') ||
    stored.startsWith('$2y$');

  if (isBcrypt) {
    try {
      isMatch = await bcrypt.compare(entered, stored);
    } catch {
      isMatch = false;
    }
  } else {
    // Legacy plaintext match
    isMatch = entered === stored;
    // If matched, seamlessly upgrade to bcrypt in the background
    if (isMatch && upgradeCallback) {
      try {
        const newHash = await bcrypt.hash(entered, BCRYPT_ROUNDS);
        await upgradeCallback(newHash);
      } catch (upgradeErr: any) {
        console.warn('[Bcrypt Upgrade Notice]:', upgradeErr.message);
      }
    }
  }

  return isMatch;
}

/**
 * Hash a plaintext password with bcrypt.
 * Use this when setting a new password (registration, password reset).
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}
