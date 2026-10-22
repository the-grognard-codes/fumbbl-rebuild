import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { clearDevLocalGames } from '../dev-local-clear-games.mjs';

const games = ['ffb_match_recovery', 'ffb_match_spectator_consent', 'ffb_v2_preparation_requests',
  'ffb_v2_preparation_invites', 'ffb_v2_match_members', 'ffb_prepared_matches', 'ffb_games_serialized', 'ffb_games_info'];
const retained = ['ffb_coaches', 'ffb_player_markers', 'ffb_team_setups', 'ffb_user_settings',
  'ffb_local_schema', 'ffb_saved_teams', 'ffb_v2_account', 'ffb_v2_identity', 'ffb_v2_account_scope', 'ffb_v2_saved_teams'];

function fixture({ running = true, consent = true } = {}) {
  const container = service => ({
    Name: `/ffb-match-review-${service}-1`, Id: (service === 'server' ? 'a' : 'b').repeat(64),
    State: { Running: service === 'server' ? running : true },
    Config: { Env: ['MARIADB_DATABASE=ffb_local'], Labels: {
      'com.docker.compose.project': 'ffb-match-review', 'com.docker.compose.service': service,
    } },
  });
  const database = { ...container('database'),
    Mounts: [{ Destination: '/var/lib/mysql', Type: 'volume', Name: 'ffb-match-review_database', RW: true }],
    HostConfig: { PortBindings: { '3306/tcp': [{ HostIp: '127.0.0.1', HostPort: '23317' }] } },
  };
  const server = container('server');
  const tables = [...games.filter(name => consent || name !== 'ffb_match_spectator_consent'), ...retained];
  const rows = Object.fromEntries(tables.map(name => [name, name === 'ffb_local_schema' ? '1' : '3']));
  const state = { endpoint: 'npipe:////./pipe/docker_engine', marker: '7', triggers: '0',
    inventory: tables.sort().map(name => `${name}\tInnoDB`).join('\n'), sqlFailure: false,
    stopFailure: false, stillRunning: false, unexpectedRows: false, retainedChanged: false, replacement: false };
  const operations = [];
  const logs = [];
  const run = (file, args, options = {}) => {
    assert.equal(file, 'docker');
    operations.push({ args, input: options.input });
    if (args[0] === 'context') return JSON.stringify([{ Endpoints: { docker: { Host: state.endpoint } } }]);
    if (args[0] === 'inspect') return JSON.stringify([args.at(-1).includes('-database-') ? database : server]);
    if (args[0] === 'stop') {
      assert.equal(args.at(-1), server.Id);
      if (state.stopFailure) throw Error('STOP_FAILED');
      server.State.Running = state.stillRunning;
      if (state.replacement) server.Id = 'c'.repeat(64);
      return '';
    }
    if (args[0] === 'start') { assert.equal(args.at(-1), server.Id); server.State.Running = true; return ''; }
    assert.deepEqual(args.slice(0, 4), ['exec', '-i', database.Id, 'sh']);
    assert.match(args.at(-1), /MYSQL_PWD.*\/run\/secrets\/db_root_password.*--database=ffb_local/);
    const sql = options.input;
    if (sql.startsWith('SELECT version')) return state.marker;
    if (sql.startsWith('SELECT TABLE_NAME')) return state.inventory;
    if (sql.startsWith('SELECT COUNT(*) FROM information_schema.TRIGGERS')) return state.triggers;
    if (sql.startsWith('START TRANSACTION;')) {
      assert.equal(server.State.Running, false, 'writes require a stopped server');
      assert.match(sql, /\nCOMMIT;$/);
      if (state.sqlFailure) throw Error('SQL_FAILED');
      for (const match of sql.matchAll(/DELETE FROM `([^`]+)`;/g)) {
        assert.ok(games.includes(match[1]) || match[1] === 'ffb_match_recovery_journal', 'only game data may be deleted');
        rows[match[1]] = state.unexpectedRows ? '1' : '0';
      }
      if (state.retainedChanged) rows.ffb_v2_saved_teams = '0';
      return '';
    }
    return [...sql.matchAll(/SELECT '([^']+)', COUNT\(\*\) FROM `([^`]+)`;/g)]
      .map(([, name, table]) => { assert.equal(name, table); return `${name}\t${rows[name]}`; }).join('\n');
  };
  const invoke = (apply = false, environment = {}) => clearDevLocalGames({ apply, run, environment, log: line => logs.push(line) });
  return { invoke, database, server, state, rows, operations, logs };
}

test('default dry run reports games without stopping services or modifying data', () => {
  const f = fixture();
  assert.equal(f.invoke().ffb_prepared_matches, '3');
  assert.ok(f.logs.some(line => line.includes('Dry run')));
  assert.ok(f.operations.every(({ args, input }) => !['stop', 'start'].includes(args[0]) && !input?.includes('DELETE')));
});

test('apply clears all game storage after shutdown and preserves accounts, teams and IDs', () => {
  const f = fixture();
  const before = Object.fromEntries(retained.map(name => [name, f.rows[name]]));
  const result = f.invoke(true);
  assert.deepEqual(Object.keys(result), games);
  assert.ok(Object.values(result).every(count => count === '0'));
  assert.deepEqual(Object.fromEntries(retained.map(name => [name, f.rows[name]])), before);
  assert.equal(f.server.State.Running, true);
  const stop = f.operations.findIndex(({ args }) => args[0] === 'stop');
  const deletion = f.operations.findIndex(({ input }) => input?.includes('DELETE FROM'));
  const start = f.operations.findIndex(({ args }) => args[0] === 'start');
  assert.ok(stop < deletion && deletion < start);
  assert.equal(f.operations.filter(({ input }) => input?.includes('DELETE FROM')).length, 1);
  assert.doesNotMatch(f.operations[deletion].input, /TRUNCATE|ALTER|DROP|FOREIGN_KEY_CHECKS/);
});

test('supports an absent optional consent table and leaves an already stopped server stopped', () => {
  const f = fixture({ running: false, consent: false });
  assert.equal(f.invoke(true).ffb_match_spectator_consent, undefined);
  assert.ok(f.operations.every(({ args }) => !['stop', 'start'].includes(args[0])));
  assert.equal(f.server.State.Running, false);
});

test('marker eight preserves account skill use preferences and rejects missing policy storage', () => {
  const f = fixture(); f.state.marker = '8';
  f.state.inventory += '\nffb_v2_skill_use_preferences\tInnoDB';
  f.rows.ffb_v2_skill_use_preferences = '18';
  f.invoke(true);
  assert.equal(f.rows.ffb_v2_skill_use_preferences, '18');
  assert.ok(f.operations.some(({ input }) => input?.includes("SELECT 'ffb_v2_skill_use_preferences'")));
  assert.ok(f.operations.every(({ input }) => !input?.includes('DELETE FROM `ffb_v2_skill_use_preferences`')));
  const missing = fixture(); missing.state.marker = '8';
  assert.throws(() => missing.invoke(true), /REVIEW_TABLES_MISMATCH/);
  assert.ok(missing.operations.every(({ args }) => args[0] !== 'stop'));
});

test('rejects wrong targets and unsupported schemas before stopping or deleting', () => {
  const mutations = [
    f => { f.state.endpoint = 'ssh://remote'; },
    f => { f.database.Name = '/ffb-current-dev-database-1'; },
    f => { f.server.Config.Labels['com.docker.compose.project'] = 'ffb-current-dev'; },
    f => { f.database.Mounts[0].Name = 'ffb-current-dev_database'; },
    f => { f.database.HostConfig.PortBindings['3306/tcp'][0].HostIp = '0.0.0.0'; },
    f => { f.database.State.Running = false; },
    f => { f.database.Config.Env = ['MARIADB_DATABASE=prod']; },
    f => { f.state.marker = '6'; },
    f => { f.state.inventory += '\nffb_new_match_table\tInnoDB'; },
    f => { f.state.inventory = f.state.inventory.replace('ffb_match_recovery\tInnoDB', 'ffb_match_recovery\tMyISAM'); },
    f => { f.state.inventory = f.state.inventory.split('\n').filter(line => !line.startsWith('ffb_v2_match_members\t')).join('\n'); },
    f => { f.state.triggers = '1'; },
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f);
    assert.throws(() => f.invoke(true), /REQUIRED|MISMATCH|PRESENT/);
    assert.ok(f.operations.every(({ args, input }) => args[0] !== 'stop' && !input?.includes('DELETE')));
  }
});

test('marker nine requires journal inventory and clears it before its parent without changing preferences', () => {
  const f = fixture(); f.state.marker = '9';
  f.state.inventory += '\nffb_v2_skill_use_preferences\tInnoDB\nffb_match_recovery_journal\tInnoDB';
  f.rows.ffb_v2_skill_use_preferences = '18'; f.rows.ffb_match_recovery_journal = '12';
  const result = f.invoke(true);
  assert.equal(result.ffb_match_recovery_journal, '0');
  assert.equal(f.rows.ffb_v2_skill_use_preferences, '18');
  const deletion = f.operations.find(({ input }) => input?.includes('DELETE FROM')).input;
  assert.ok(deletion.indexOf('DELETE FROM `ffb_match_recovery_journal`') < deletion.indexOf('DELETE FROM `ffb_match_recovery`'));
  const missing = fixture(); missing.state.marker = '9';
  missing.state.inventory += '\nffb_v2_skill_use_preferences\tInnoDB';
  assert.throws(() => missing.invoke(true), /REVIEW_TABLES_MISMATCH/);
  assert.ok(missing.operations.every(({ args }) => args[0] !== 'stop'));
});

test('honors Docker endpoint precedence and rejects remote DOCKER_HOST before any inspection', () => {
  const f = fixture();
  assert.throws(() => f.invoke(true, { DOCKER_HOST: 'tcp://remote:2375' }), /LOCAL_DOCKER_REQUIRED/);
  assert.equal(f.operations.length, 0);
  f.invoke(false, { DOCKER_CONTEXT: 'desktop-linux', DOCKER_HOST: 'tcp://ignored:2375' });
  assert.deepEqual(f.operations[0].args, ['context', 'inspect', 'desktop-linux']);
});

test('failed shutdown or a replaced/running server prevents deletion', () => {
  for (const condition of ['stopFailure', 'stillRunning', 'replacement']) {
    const f = fixture(); f.state[condition] = true;
    assert.throws(() => f.invoke(true), /STOP_FAILED|REVIEW_SERVER_NOT_STOPPED/);
    assert.ok(f.operations.every(({ input }) => !input?.includes('DELETE')));
  }
});

test('SQL or post-delete verification failure leaves the server stopped', () => {
  for (const condition of ['sqlFailure', 'unexpectedRows', 'retainedChanged']) {
    const f = fixture(); f.state[condition] = true;
    assert.throws(() => f.invoke(true), /SQL_FAILED|REVIEW_GAMES_NOT_EMPTY|REVIEW_RETAINED_COUNTS_CHANGED/);
    assert.equal(f.server.State.Running, false);
    assert.ok(f.operations.every(({ args }) => args[0] !== 'start'));
    assert.ok(f.logs.some(line => line.includes('left stopped')));
  }
});

test('CLI help and invalid arguments never access Docker', () => {
  const script = fileURLToPath(new URL('../dev-local-clear-games.mjs', import.meta.url));
  for (const [args, status] of [[['--help'], 0], [['--force'], 2], [['--apply', '--dry-run'], 2]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, status);
    assert.match(result.stdout + result.stderr, /Usage:/);
  }
});
