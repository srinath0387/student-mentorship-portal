/**
 * tests/unit/services/passwordService.test.ts
 * Unit tests for the password service extracted in Phase 1.1
 */

import { compareAndUpgradePassword, hashPassword, BCRYPT_ROUNDS } from '../../../src/services/passwordService';
import bcrypt from 'bcryptjs';

describe('passwordService', () => {

  describe('BCRYPT_ROUNDS', () => {
    it('should be 10 (secure but not too slow)', () => {
      expect(BCRYPT_ROUNDS).toBe(10);
    });
  });

  describe('hashPassword()', () => {
    it('should return a bcrypt hash starting with $2b$', async () => {
      const hash = await hashPassword('TestPassword123');
      expect(hash).toMatch(/^\$2[ab]\$/);
    });

    it('should produce a different hash each call (salt randomisation)', async () => {
      const h1 = await hashPassword('same');
      const h2 = await hashPassword('same');
      expect(h1).not.toBe(h2);
    });

    it('should produce a hash that verifies correctly', async () => {
      const hash = await hashPassword('MyS3cretPassword!');
      const match = await bcrypt.compare('MyS3cretPassword!', hash);
      expect(match).toBe(true);
    });
  });

  describe('compareAndUpgradePassword()', () => {

    describe('bcrypt stored passwords', () => {
      it('should return true for correct bcrypt password', async () => {
        const hash = await bcrypt.hash('correctPass', 10);
        const result = await compareAndUpgradePassword('correctPass', hash);
        expect(result).toBe(true);
      });

      it('should return false for wrong bcrypt password', async () => {
        const hash = await bcrypt.hash('correctPass', 10);
        const result = await compareAndUpgradePassword('wrongPass', hash);
        expect(result).toBe(false);
      });

      it('should NOT call upgradeCallback for already-bcrypt passwords', async () => {
        const hash = await bcrypt.hash('pass', 10);
        const upgrade = jest.fn();
        await compareAndUpgradePassword('pass', hash, upgrade);
        expect(upgrade).not.toHaveBeenCalled();
      });
    });

    describe('legacy plaintext stored passwords', () => {
      it('should return true for matching plaintext', async () => {
        const result = await compareAndUpgradePassword('myOldPass', 'myOldPass');
        expect(result).toBe(true);
      });

      it('should return false for non-matching plaintext', async () => {
        const result = await compareAndUpgradePassword('wrongPass', 'myOldPass');
        expect(result).toBe(false);
      });

      it('should call upgradeCallback with new bcrypt hash on successful plaintext match', async () => {
        const upgrade = jest.fn().mockResolvedValue(undefined);
        await compareAndUpgradePassword('myOldPass', 'myOldPass', upgrade);
        expect(upgrade).toHaveBeenCalledTimes(1);
        const newHash = upgrade.mock.calls[0][0];
        expect(newHash).toMatch(/^\$2[ab]\$/);
        // Verify the new hash actually matches the original password
        const isValid = await bcrypt.compare('myOldPass', newHash);
        expect(isValid).toBe(true);
      });

      it('should NOT call upgradeCallback when plaintext does not match', async () => {
        const upgrade = jest.fn();
        await compareAndUpgradePassword('wrong', 'myOldPass', upgrade);
        expect(upgrade).not.toHaveBeenCalled();
      });

      it('should not throw if upgradeCallback fails', async () => {
        const upgrade = jest.fn().mockRejectedValue(new Error('DB down'));
        // Should NOT throw — upgrade failure is handled gracefully
        await expect(
          compareAndUpgradePassword('myOldPass', 'myOldPass', upgrade)
        ).resolves.toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should return false for empty entered password', async () => {
        const result = await compareAndUpgradePassword('', 'storedPass');
        expect(result).toBe(false);
      });

      it('should return false for empty stored password', async () => {
        const result = await compareAndUpgradePassword('entered', '');
        expect(result).toBe(false);
      });

      it('should return false for both empty', async () => {
        const result = await compareAndUpgradePassword('', '');
        expect(result).toBe(false);
      });
    });
  });
});
