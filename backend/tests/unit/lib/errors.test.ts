/**
 * tests/unit/lib/errors.test.ts
 * Unit tests for the typed error class hierarchy and globalErrorHandler.
 */

import { Request, Response, NextFunction } from 'express';
import {
  ApiError,
  ValidationError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalError,
  DatabaseError,
  globalErrorHandler,
  asyncHandler,
} from '../../../src/lib/errors';

// ─── Error Class Tests ────────────────────────────────────────────────────────

describe('ApiError base class', () => {
  it('should set correct defaults', () => {
    const err = new ApiError('test error');
    expect(err.message).toBe('test error');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(Error);
  });

  it('should accept custom statusCode and code', () => {
    const err = new ApiError('custom', 418, 'IM_A_TEAPOT');
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('IM_A_TEAPOT');
  });
});

describe('HTTP error subclasses', () => {
  const cases: [new (...args: any[]) => ApiError, number, string][] = [
    [ValidationError,   400, 'VALIDATION_ERROR'],
    [BadRequestError,   400, 'BAD_REQUEST'],
    [UnauthorizedError, 401, 'UNAUTHORIZED'],
    [ForbiddenError,    403, 'FORBIDDEN'],
    [NotFoundError,     404, 'NOT_FOUND'],
    [ConflictError,     409, 'CONFLICT'],
    [RateLimitError,    429, 'RATE_LIMITED'],
    [InternalError,     500, 'INTERNAL_ERROR'],
    [DatabaseError,     500, 'DB_ERROR'],
  ];

  test.each(cases)('%s has correct statusCode and code', (ErrorClass, expectedStatus, expectedCode) => {
    const err = new ErrorClass('test');
    expect(err.statusCode).toBe(expectedStatus);
    expect(err.code).toBe(expectedCode);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(ErrorClass);
  });

  it('should use default message when none provided', () => {
    const err = new NotFoundError();
    expect(err.message).toBe('Resource not found');
  });

  it('should use custom message when provided', () => {
    const err = new NotFoundError('Student 22B81A0566 not found');
    expect(err.message).toBe('Student 22B81A0566 not found');
  });
});

// ─── globalErrorHandler Tests ─────────────────────────────────────────────────

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('globalErrorHandler', () => {
  const req = {} as Request;
  const next = jest.fn() as NextFunction;

  it('should return correct status and body for NotFoundError', () => {
    const err = new NotFoundError('Student not found');
    const res = mockRes();

    globalErrorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Student not found',
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });

  it('should return 500 for unknown Error', () => {
    const err = new Error('Some random crash');
    const res = mockRes();

    globalErrorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INTERNAL_ERROR', statusCode: 500 })
    );
  });

  it('should return correct status for ValidationError', () => {
    const err = new ValidationError('Invalid email format');
    const res = mockRes();

    globalErrorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid email format',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });
});

// ─── asyncHandler Tests ───────────────────────────────────────────────────────

describe('asyncHandler', () => {
  it('should forward thrown error to next()', async () => {
    const err = new NotFoundError('test');
    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn();

    const handler = asyncHandler(async (_req, _res, _next) => {
      throw err;
    });

    await handler(req, res, next);
    expect(next).toHaveBeenCalledWith(err);
  });

  it('should not call next() when handler resolves normally', async () => {
    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn();

    const handler = asyncHandler(async (_req, _res, _next) => {
      // no-op success
    });

    await handler(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});
