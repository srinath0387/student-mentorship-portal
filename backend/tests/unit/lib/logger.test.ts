/**
 * tests/unit/lib/logger.test.ts
 * Unit tests for the structured logger.
 */

import { logger } from '../../../src/lib/logger';

describe('logger', () => {
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.LOG_LEVEL = 'debug';
    // NODE_ENV is set to 'test' in setup.ts so pretty-print mode is used
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('should have debug, info, warn, error methods', () => {
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('should have child() method', () => {
    const child = logger.child('attendance');
    expect(typeof child.info).toBe('function');
    expect(typeof child.error).toBe('function');
  });

  it('should not throw when logging plain messages', () => {
    expect(() => logger.info('test message')).not.toThrow();
    expect(() => logger.warn('test warning')).not.toThrow();
    expect(() => logger.error('test error')).not.toThrow();
    expect(() => logger.debug('test debug')).not.toThrow();
  });

  it('should not throw when logging with payload', () => {
    expect(() => logger.info('with data', { roll: '22B81A0566' })).not.toThrow();
    expect(() => logger.error('with error', new Error('boom'))).not.toThrow();
  });

  it('child logger should not throw', () => {
    const log = logger.child('students');
    expect(() => log.info('student fetched', { count: 5 })).not.toThrow();
    expect(() => log.error('query failed', new Error('DB error'))).not.toThrow();
  });
});
