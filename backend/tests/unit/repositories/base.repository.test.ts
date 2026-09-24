/**
 * tests/unit/repositories/base.repository.test.ts
 * Unit tests for the base repository helpers — no DB needed.
 */

import {
  buildWhereClause,
  buildUpdateSet,
  parsePagination,
  toUpperOrNull,
} from '../../../src/repositories/base.repository';

describe('base.repository', () => {

  describe('buildWhereClause()', () => {
    it('should return empty clause when no filters provided', () => {
      const { clause, values } = buildWhereClause({});
      expect(clause).toBe('');
      expect(values).toEqual([]);
    });

    it('should skip null and undefined values', () => {
      const { clause, values } = buildWhereClause({ department: null, year: undefined, section: 'A' });
      expect(clause).toBe('WHERE section = $1');
      expect(values).toEqual(['A']);
    });

    it('should build clause for multiple filters', () => {
      const { clause, values } = buildWhereClause({ department: 'CSE', year: '3rd Year' });
      expect(clause).toBe('WHERE department = $1 AND year = $2');
      expect(values).toEqual(['CSE', '3rd Year']);
    });

    it('should use custom start index', () => {
      const { clause, values } = buildWhereClause({ name: 'Alice' }, 5);
      expect(clause).toBe('WHERE name = $5');
      expect(values).toEqual(['Alice']);
    });
  });

  describe('buildUpdateSet()', () => {
    it('should build SET clause from updates', () => {
      const { setClause, values } = buildUpdateSet({ name: 'Bob', department: 'CSE' });
      expect(setClause).toBe('name = $1, department = $2');
      expect(values).toEqual(['Bob', 'CSE']);
    });

    it('should skip undefined values', () => {
      const { setClause, values } = buildUpdateSet({ name: 'Alice', year: undefined });
      expect(setClause).toBe('name = $1');
      expect(values).toEqual(['Alice']);
    });

    it('should include null values (explicit null means clear field)', () => {
      const { setClause, values } = buildUpdateSet({ phone: null });
      expect(setClause).toBe('phone = $1');
      expect(values).toEqual([null]);
    });

    it('should return empty clause and values when all undefined', () => {
      const { setClause, values } = buildUpdateSet({ a: undefined, b: undefined });
      expect(setClause).toBe('');
      expect(values).toEqual([]);
    });
  });

  describe('parsePagination()', () => {
    it('should return defaults for empty query', () => {
      const result = parsePagination({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should parse page and limit from query', () => {
      const result = parsePagination({ page: '2', limit: '20' });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(20);
    });

    it('should cap limit at maxLimit', () => {
      const result = parsePagination({ limit: '9999' });
      expect(result.limit).toBe(500);
    });

    it('should use custom defaultLimit', () => {
      const result = parsePagination({}, 100);
      expect(result.limit).toBe(100);
    });

    it('should floor page at 1 even for negative values', () => {
      const result = parsePagination({ page: '-5' });
      expect(result.page).toBe(1);
      expect(result.offset).toBe(0);
    });
  });

  describe('toUpperOrNull()', () => {
    it('should uppercase a string', () => {
      expect(toUpperOrNull('22b81a0566')).toBe('22B81A0566');
    });

    it('should trim whitespace', () => {
      expect(toUpperOrNull('  22b81a0566  ')).toBe('22B81A0566');
    });

    it('should return null for null', () => {
      expect(toUpperOrNull(null)).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(toUpperOrNull(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(toUpperOrNull('')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      expect(toUpperOrNull('   ')).toBeNull();
    });
  });
});
