/**
 * Faculty Selection — rollback.
 *  1. Removes the subject_rosters rows this module created (listed in fs_created_rows).
 *  2. Removes the subject_allotments rows this module created, only when no roster rows and
 *     no attendance sessions use them any more.
 *  3. Drops every fs_ table.
 * Rows created by the existing attendance setup are never touched.
 *
 *   cd backend && npm run fs:rollback -- --confirm
 */
import { FS_ROLLBACK } from '../repositories/facultySelection.schema';
import { runStatements } from './faculty-selection-db';

if (!process.argv.includes('--confirm')) {
  console.error('This deletes all faculty-selection data and the rosters it created. Re-run with --confirm to proceed.');
  process.exit(1);
}

runStatements('fs:rollback', FS_ROLLBACK).catch(err => {
  console.error('[fs:rollback] failed:', err.message);
  process.exit(1);
});
