import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const databaseName = 'ffb-match-review-database-1';
const indexQuery = "SELECT SEQ_IN_INDEX,NON_UNIQUE,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ffb_v2_match_members' AND INDEX_NAME='ffb_v2_match_members_account' ORDER BY SEQ_IN_INDEX;";
const expected = '1\t1\taccount_id\n2\t1\tmatchid';

/** Explicit maintenance for the verified local review database, never the runtime identity. */
export function ensureReviewCurrentMatchesIndex(run = (file, args, options) => execFileSync(file, args, {
  encoding: 'utf8', windowsHide: true, ...options
})) {
  const [database] = JSON.parse(run('docker', ['inspect', '--type', 'container', databaseName]));
  if (database?.Name !== `/${databaseName}` || !database.State?.Running
    || database.Config?.Labels?.['com.docker.compose.project'] !== 'ffb-match-review'
    || database.Config.Labels['com.docker.compose.service'] !== 'database') throw Error('REVIEW_DATABASE_MISMATCH');
  const query = input => run('docker', ['exec', '-i', databaseName, 'sh', '-c',
    'export MYSQL_PWD; IFS= read -r MYSQL_PWD < /run/secrets/db_root_password; exec mariadb --user=root --database=ffb_local --batch --skip-column-names'], { input });
  if (query('SELECT version FROM ffb_local_schema;').trim() !== '7') throw Error('REVIEW_SCHEMA_MISMATCH');
  const indexes = query(indexQuery).trim().replaceAll('\r\n', '\n');
  if (indexes === expected) return false;
  if (indexes) throw Error('REVIEW_CURRENT_MATCH_INDEX_MISMATCH');
  query(readFileSync(new URL('../ffb-server/src/main/resources/local-schema/007-current-matches-index.sql', import.meta.url), 'utf8'));
  if (query(indexQuery).trim().replaceAll('\r\n', '\n') !== expected) throw Error('REVIEW_CURRENT_MATCH_INDEX_MISMATCH');
  return true;
}
