import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureReviewCurrentMatchesIndex } from '../review-current-matches-index.mjs';

function fixture({ marker = '7', indexes = '', container = {} } = {}) {
  let shape = indexes;
  const writes = [];
  const run = (file, args, options) => {
    assert.equal(file, 'docker');
    if (args[0] === 'inspect') return JSON.stringify([{ Name: '/ffb-match-review-database-1', State: { Running: true },
      Config: { Labels: { 'com.docker.compose.project': 'ffb-match-review', 'com.docker.compose.service': 'database' } }, ...container }]);
    assert.equal(args[2], 'ffb-match-review-database-1');
    assert.ok(args.includes('export MYSQL_PWD; IFS= read -r MYSQL_PWD < /run/secrets/db_root_password; exec mariadb --user=root --database=ffb_local --batch --skip-column-names'));
    if (options.input.startsWith('SELECT version')) return marker;
    if (options.input.startsWith('SELECT SEQ_IN_INDEX')) return shape;
    writes.push(options.input); shape = '1\t1\taccount_id\n2\t1\tmatchid'; return '';
  };
  return { run, writes };
}
test('provisions the missing current-games index and verifies it, then startup is read-only', () => {
  const database = fixture();
  assert.equal(ensureReviewCurrentMatchesIndex(database.run), true);
  assert.equal(database.writes.length, 1);
  assert.match(database.writes[0], /CREATE INDEX ffb_v2_match_members_account ON ffb_v2_match_members \(account_id, matchid\)/);
  assert.equal(ensureReviewCurrentMatchesIndex(database.run), false);
  assert.equal(database.writes.length, 1);
});
test('rejects another container, unsupported schema marker and malformed existing index without writes', () => {
  for (const options of [{ container: { Name: '/another-database' } }, { marker: '6' },
    { indexes: '1\t1\tmatchid\n2\t1\taccount_id' }, { indexes: '1\t0\taccount_id\n2\t0\tmatchid' }]) {
    const database = fixture(options);
    assert.throws(() => ensureReviewCurrentMatchesIndex(database.run), /MISMATCH/);
    assert.equal(database.writes.length, 0);
  }
});
