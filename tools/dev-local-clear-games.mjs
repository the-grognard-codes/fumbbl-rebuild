// Version-independent match maintenance for the isolated dev-local database.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverName = 'ffb-match-review-server-1';
const databaseName = 'ffb-match-review-database-1';
const gameTables = [
  'ffb_match_recovery', 'ffb_match_spectator_consent', 'ffb_v2_preparation_requests',
  'ffb_v2_preparation_invites', 'ffb_v2_match_members', 'ffb_prepared_matches',
];
const retainedTables = [
  'ffb_local_schema', 'ffb_saved_teams', 'ffb_v2_account', 'ffb_v2_identity',
  'ffb_v2_account_scope', 'ffb_v2_saved_teams',
];
const optionalTable = 'ffb_match_spectator_consent';
const historicalTables = ['ffb_coaches', 'ffb_player_markers', 'ffb_team_setups', 'ffb_user_settings', 'ffb_games_info', 'ffb_games_serialized'];
const sqlCommand = 'export MYSQL_PWD; IFS= read -r MYSQL_PWD < /run/secrets/db_root_password; '
  + 'exec mariadb --user=root --database=ffb_local --batch --skip-column-names';
const defaultRun = (file, args, options) => execFileSync(file, args, {
  encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024, ...options,
});

function requireLocalDocker(run, environment) {
  // An explicit context overrides DOCKER_HOST, just as it does in Docker's CLI.
  const endpoint = environment.DOCKER_CONTEXT || !environment.DOCKER_HOST
    ? JSON.parse(run('docker', ['context', 'inspect', ...(environment.DOCKER_CONTEXT ? [environment.DOCKER_CONTEXT] : [])]))[0]?.Endpoints?.docker?.Host
    : environment.DOCKER_HOST;
  if (typeof endpoint !== 'string' || !/^(unix:\/\/\/|npipe:\/\/\/+\.\/pipe\/)/.test(endpoint))
    throw Error('LOCAL_DOCKER_REQUIRED');
}

function inspect(run, name, service) {
  const [container] = JSON.parse(run('docker', ['inspect', '--type', 'container', name]));
  if (container?.Name !== `/${name}` || !/^[0-9a-f]{64}$/.test(container.Id ?? '')
    || typeof container.State?.Running !== 'boolean'
    || container.Config?.Labels?.['com.docker.compose.project'] !== 'ffb-match-review'
    || container.Config.Labels['com.docker.compose.service'] !== service)
    throw Error('REVIEW_CONTAINER_MISMATCH');
  return container;
}

function requireDatabase(database) {
  const mounts = database.Mounts?.filter(mount => mount.Destination === '/var/lib/mysql') ?? [];
  const ports = database.HostConfig?.PortBindings?.['3306/tcp'] ?? [];
  if (!database.State.Running || mounts.length !== 1 || mounts[0].Type !== 'volume'
    || mounts[0].Name !== 'ffb-match-review_database' || mounts[0].RW !== true
    || ports.length !== 1 || ports[0].HostIp !== '127.0.0.1' || ports[0].HostPort !== '23317'
    || !database.Config.Env?.includes('MARIADB_DATABASE=ffb_local')) throw Error('REVIEW_DATABASE_MISMATCH');
}

function counts(query, tables) {
  const output = query(tables.map(table => `SELECT '${table}', COUNT(*) FROM \`${table}\`;`).join('\n'));
  const rows = output.trim().split(/\r?\n/).map(line => line.split('\t'));
  if (rows.length !== tables.length || rows.some(([name, count], index) => name !== tables[index] || !/^\d+$/.test(count)))
    throw Error('REVIEW_COUNTS_INVALID');
  return Object.fromEntries(rows);
}

/** Dry-run by default; never accepts a database, project or remote endpoint override. */
export function clearDevLocalGames({ apply = false, run = defaultRun, environment = process.env, log = console.log } = {}) {
  requireLocalDocker(run, environment);
  const database = inspect(run, databaseName, 'database');
  const server = inspect(run, serverName, 'server');
  requireDatabase(database);
  // Use immutable container IDs after checking names/labels/mounts.
  const query = input => run('docker', ['exec', '-i', database.Id, 'sh', '-c', sqlCommand], { input });
  const marker = query('SELECT version FROM ffb_local_schema;').trim();
  if (!['7', '8', '9'].includes(marker)) throw Error('REVIEW_SCHEMA_MISMATCH');
  const retainedForSchema = marker !== '7' ? [...retainedTables, 'ffb_v2_skill_use_preferences'] : retainedTables;
  const gamesForSchema = marker === '9' ? ['ffb_match_recovery_journal', ...gameTables] : gameTables;
  const inventory = query('SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME;')
    .trim().split(/\r?\n/).map(line => line.split('\t'));
  const expected = [...gamesForSchema, ...retainedForSchema];
  const names = inventory.map(([name]) => name);
  if (new Set(names).size !== names.length || names.some(name => !expected.includes(name) && !historicalTables.includes(name))
    || expected.filter(name => name !== optionalTable).some(name => !names.includes(name))
    || inventory.some(([name, engine]) => gamesForSchema.includes(name) && engine !== 'InnoDB'))
    throw Error('REVIEW_TABLES_MISMATCH');
  const selected = gamesForSchema.filter(name => names.includes(name));
  const tableList = selected.map(name => `'${name}'`).join(',');
  if (query(`SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE IN (${tableList});`).trim() !== '0')
    throw Error('REVIEW_TRIGGERS_PRESENT');
  log('Target: dev-local / ffb-match-review / ffb_local (127.0.0.1:23317)');
  const before = counts(query, selected);
  for (const [name, count] of Object.entries(before)) log(`${name}: ${count}`);
  if (!apply) {
    log('Dry run: no changes. Run with --apply to permanently delete these game records.');
    return before;
  }

  let stopped = false;
  try {
    if (server.State.Running) {
      log('Stopping dev-local game server and draining pending writes...');
      run('docker', ['stop', '--time', '30', server.Id]);
      stopped = true;
    }
    const current = inspect(run, serverName, 'server');
    if (current.Id !== server.Id || current.State.Running) throw Error('REVIEW_SERVER_NOT_STOPPED');
    const currentDatabase = inspect(run, databaseName, 'database');
    requireDatabase(currentDatabase);
    if (currentDatabase.Id !== database.Id) throw Error('REVIEW_DATABASE_MISMATCH');
    const retainedPresent = [...retainedForSchema, ...historicalTables.filter(name => names.includes(name))];
    const retained = counts(query, retainedPresent);
    // No TRUNCATE, schema changes or ID resets: a failed SQL batch rolls back on disconnect.
    query(`START TRANSACTION;\n${selected.map(table => `DELETE FROM \`${table}\`;`).join('\n')}\nCOMMIT;`);
    const after = counts(query, selected);
    if (Object.values(after).some(count => count !== '0')) throw Error('REVIEW_GAMES_NOT_EMPTY');
    if (JSON.stringify(counts(query, retainedPresent)) !== JSON.stringify(retained)) throw Error('REVIEW_RETAINED_COUNTS_CHANGED');
    log('All database game records removed; accounts, saved teams, settings and backup files retained.');
    if (stopped) {
      run('docker', ['start', server.Id]);
      log('Dev-local game server restarted. Reload Play to create a new game.');
    } else log('Dev-local game server remains stopped.');
    return after;
  } catch (failure) {
    if (stopped) log('Cleanup failed; the dev-local game server was left stopped. Inspect the failure before restarting it.');
    throw failure;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node tools/dev-local-clear-games.mjs [--dry-run|--apply]');
  } else if (args.length > 1 || (args.length === 1 && !['--dry-run', '--apply'].includes(args[0]))) {
    console.error('Usage: node tools/dev-local-clear-games.mjs [--dry-run|--apply]');
    process.exitCode = 2;
  } else {
    try { clearDevLocalGames({ apply: args[0] === '--apply' }); }
    catch (failure) {
      const safe = /^[A-Z][A-Z_]+$/.test(failure.message) ? failure.message : 'DEV_LOCAL_CLEAR_GAMES_FAILED';
      console.error(`Dev-local game cleanup: ${safe}`);
      process.exitCode = 1;
    }
  }
}
