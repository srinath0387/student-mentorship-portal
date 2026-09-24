/**
 * logger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Structured logging wrapper for the RGM ManageBAC backend.
 *
 * Why not console.log directly?
 *   - Adds log levels (debug / info / warn / error) with filtering by env
 *   - Emits JSON-structured logs in Lambda (CloudWatch picks them up natively)
 *   - Emits pretty-printed logs locally for developer readability
 *   - Automatically includes timestamp, level, service name, and request context
 *
 * USAGE:
 *   import { logger } from '../lib/logger';
 *   logger.info('Student created', { roll_number, department });
 *   logger.error('DB query failed', error);
 *   logger.warn('Cache miss for platform', { platform: 'leetcode', handle });
 *   logger.debug('Fetched rows', { count: rows.length });
 * ─────────────────────────────────────────────────────────────────────────────
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogPayload = Record<string, unknown> | Error | string | null | undefined;

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  data?: unknown;
  error?: {
    message: string;
    name: string;
    stack?: string;
  };
}

// ─── Log Level Priority ───────────────────────────────────────────────────────

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ─── Config ───────────────────────────────────────────────────────────────────

const SERVICE_NAME = 'advitiyans-api';

// In production Lambda, NODE_ENV=production → JSON logs for CloudWatch
// In local dev, NODE_ENV=development → pretty-printed logs
const IS_LAMBDA = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
const IS_PROD = process.env.NODE_ENV === 'production' || IS_LAMBDA;

// Control minimum log level via LOG_LEVEL env var (default: info)
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function serializePayload(payload: LogPayload): { data?: unknown; error?: LogEntry['error'] } {
  if (payload instanceof Error) {
    return {
      error: {
        name: payload.name,
        message: payload.message,
        stack: IS_PROD ? undefined : payload.stack,
      },
    };
  }
  if (payload !== null && payload !== undefined) {
    return { data: payload };
  }
  return {};
}

// ─── Emitters ────────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // Cyan
  info:  '\x1b[32m', // Green
  warn:  '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
};
const RESET = '\x1b[0m';

function emit(level: LogLevel, message: string, payload?: LogPayload): void {
  if (!shouldLog(level)) return;

  const timestamp = new Date().toISOString();
  const extra = payload !== undefined ? serializePayload(payload) : {};

  if (IS_PROD) {
    // JSON for CloudWatch / structured log aggregators
    const entry: LogEntry = {
      timestamp,
      level,
      service: SERVICE_NAME,
      message,
      ...extra,
    };
    const output = JSON.stringify(entry);
    if (level === 'error') {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  } else {
    // Pretty-print for local development
    const color = LEVEL_COLORS[level];
    const prefix = `${color}[${level.toUpperCase()}]${RESET} ${timestamp} |`;
    const parts: unknown[] = [prefix, message];
    if (extra.data !== undefined) parts.push(extra.data);
    if (extra.error !== undefined) parts.push(extra.error);
    if (level === 'error') {
      console.error(...parts);
    } else if (level === 'warn') {
      console.warn(...parts);
    } else {
      console.log(...parts);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const logger = {
  debug: (message: string, payload?: LogPayload) => emit('debug', message, payload),
  info:  (message: string, payload?: LogPayload) => emit('info',  message, payload),
  warn:  (message: string, payload?: LogPayload) => emit('warn',  message, payload),
  error: (message: string, payload?: LogPayload) => emit('error', message, payload),

  /**
   * Create a child logger with a fixed context prefix in every message.
   * Useful for tagging all logs within a specific route module.
   *
   * USAGE:
   *   const log = logger.child('attendance');
   *   log.info('Session saved', { sessionId });
   *   // emits: "[INFO] ... | [attendance] Session saved"
   */
  child: (context: string) => ({
    debug: (msg: string, payload?: LogPayload) => emit('debug', `[${context}] ${msg}`, payload),
    info:  (msg: string, payload?: LogPayload) => emit('info',  `[${context}] ${msg}`, payload),
    warn:  (msg: string, payload?: LogPayload) => emit('warn',  `[${context}] ${msg}`, payload),
    error: (msg: string, payload?: LogPayload) => emit('error', `[${context}] ${msg}`, payload),
  }),
};
