/**
 * errors.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Typed error class hierarchy for the RGM ManageBAC backend.
 *
 * USAGE (in route handlers / services):
 *   throw new NotFoundError('Student not found');
 *   throw new ValidationError('Invalid roll number format');
 *   throw new ForbiddenError('Only HOD can access this resource');
 *
 * The centralized Express error handler in api.ts catches these and
 * serializes them into consistent { error, code, statusCode } JSON responses.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Request, Response, NextFunction } from 'express';

// ─── Base Class ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  /** HTTP status code to send to the client */
  public readonly statusCode: number;
  /** Machine-readable error code (used by frontend for conditional handling) */
  public readonly code: string;
  /** Whether this error should be logged as an internal server error */
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── 400 Bad Request ─────────────────────────────────────────────────────────

export class ValidationError extends ApiError {
  constructor(message: string = 'Validation failed', code: string = 'VALIDATION_ERROR') {
    super(message, 400, code);
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string = 'Bad request', code: string = 'BAD_REQUEST') {
    super(message, 400, code);
  }
}

// ─── 401 Unauthorized ────────────────────────────────────────────────────────

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Authentication required', code: string = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

// ─── 403 Forbidden ───────────────────────────────────────────────────────────

export class ForbiddenError extends ApiError {
  constructor(message: string = 'Insufficient permissions', code: string = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

// ─── 404 Not Found ───────────────────────────────────────────────────────────

export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found', code: string = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

// ─── 409 Conflict ────────────────────────────────────────────────────────────

export class ConflictError extends ApiError {
  constructor(message: string = 'Resource already exists', code: string = 'CONFLICT') {
    super(message, 409, code);
  }
}

// ─── 422 Unprocessable Entity ────────────────────────────────────────────────

export class UnprocessableError extends ApiError {
  constructor(message: string = 'Unprocessable request', code: string = 'UNPROCESSABLE') {
    super(message, 422, code);
  }
}

// ─── 429 Too Many Requests ───────────────────────────────────────────────────

export class RateLimitError extends ApiError {
  constructor(message: string = 'Too many requests. Please try again later.', code: string = 'RATE_LIMITED') {
    super(message, 429, code);
  }
}

// ─── 500 Internal Server Error ───────────────────────────────────────────────

export class InternalError extends ApiError {
  constructor(message: string = 'Internal server error', code: string = 'INTERNAL_ERROR') {
    super(message, 500, code, false);
  }
}

export class DatabaseError extends ApiError {
  constructor(message: string = 'Database operation failed', code: string = 'DB_ERROR') {
    super(message, 500, code, false);
  }
}

export class ExternalServiceError extends ApiError {
  constructor(message: string = 'External service unavailable', code: string = 'EXTERNAL_SERVICE_ERROR') {
    super(message, 502, code, false);
  }
}

// ─── Centralized Express Error Handler ───────────────────────────────────────

/**
 * Global Express error-handling middleware.
 *
 * Must be registered LAST in api.ts with:
 *   app.use(globalErrorHandler);
 *
 * Catches all errors thrown in route handlers or passed via next(err).
 */
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Operational errors (ApiError subclasses): send structured response
  if (err instanceof ApiError) {
    if (!err.isOperational) {
      // Log non-operational errors (unexpected failures) at error level
      console.error(`[ERROR] ${err.code} | ${err.message}`, err.stack);
    }
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      statusCode: err.statusCode,
    });
    return;
  }

  // Unknown/programmer errors: log fully and return generic 500
  console.error('[UNHANDLED ERROR]', err.message, err.stack);
  res.status(500).json({
    error: 'An unexpected error occurred. Please try again later.',
    code: 'INTERNAL_ERROR',
    statusCode: 500,
  });
}

// ─── Helper: wrap async route handlers ───────────────────────────────────────

/**
 * Wraps an async Express handler so unhandled Promise rejections
 * are automatically forwarded to the global error handler.
 *
 * USAGE:
 *   router.get('/students', asyncHandler(async (req, res) => {
 *     // any thrown error → globalErrorHandler
 *   }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
