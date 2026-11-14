/**
 * Faculty Selection — additive, idempotent migration (CREATE TABLE / INDEX IF NOT EXISTS only).
 * Never alters existing tables. Safe to run any number of times.
 *
 *   cd backend && npm run fs:migrate
 *
 * Not required for normal deploys: the API also creates these tables on first use.
 */
import { FS_DDL } from '../repositories/facultySelection.schema';
import { runStatements } from './faculty-selection-db';

runStatements('fs:migrate', FS_DDL).catch(err => {
  console.error('[fs:migrate] failed:', err.message);
  process.exit(1);
});
