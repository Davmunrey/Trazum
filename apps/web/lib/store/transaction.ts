import type { SqlClient } from './postgres';

/**
 * Run `fn` as one transaction, and refuse to run it as anything less.
 *
 * Used where a count decides whether a write may happen: the per-account
 * ceilings and the next version number. Each of those was a read followed by
 * a write in separate statements, so two saves arriving together could both
 * read 199 and both write, or both read version 4 and both try to be 5, the
 * second failing on the unique constraint as a 500.
 *
 * A transaction alone does not stop that under Postgres's default isolation;
 * the callers also lock a row first (the account, or the prompt), so the
 * second save waits, and its count, read after the wait in a statement of its
 * own, sees the first one's row.
 *
 * Throws rather than falling back to running `fn` without a transaction: a
 * fallback would keep every test passing and lose the guarantee silently.
 */
export function inTransaction<T>(sql: SqlClient, fn: (tx: SqlClient) => Promise<T>): Promise<T> {
  if (typeof sql.begin !== 'function') {
    throw new Error('trazum: this database client cannot open a transaction');
  }
  return sql.begin(fn);
}
