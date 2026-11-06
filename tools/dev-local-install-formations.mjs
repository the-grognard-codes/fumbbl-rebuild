// Explicit, repeatable installation of the approved formation revision into dev-local teams.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeTeamFormations, starterFormations } from '../browser-client/src/team-formations.ts';

const tables = ['ffb_saved_teams', 'ffb_v2_saved_teams'];
const databaseName = 'ffb-match-review-database-1';
const sqlCommand = 'export MYSQL_PWD; IFS= read -r MYSQL_PWD < /run/secrets/db_root_password; '
  + 'exec mariadb --user=root --database=ffb_local --batch --skip-column-names --raw';
const run = (args, options = {}) => execFileSync('docker', args, {
  encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...options,
});
const hash = text => createHash('sha256').update(text).digest('hex');

/** Only this explicit migration adds new presets to existing, intentionally edited groups. */
export function installFormationRevision(document) {
  const next = structuredClone(document);
  const draft = next.draft;
  const starters = starterFormations(draft.players.map(player => ({ jerseyNumber: player.jerseyNumber ?? player.slot })));
  if (starters.offense.length !== 2 || starters.defense.length !== 2) throw Error('ELEVEN_ROSTER_NUMBERS_REQUIRED');
  if (draft.formations === undefined) draft.formations = starters;
  else {
    decodeTeamFormations(draft.formations);
    const chevron = starters.defense[0];
    draft.formations.defense = draft.formations.defense.map(formation => formation.name === chevron.name ? chevron : formation);
    for (const role of ['offense', 'defense']) {
      const addition = starters[role][1];
      if (!draft.formations[role].some(formation => formation.name === addition.name)) draft.formations[role].push(addition);
      if (draft.formations[role].length > 3) throw Error('FORMATION_SLOTS_FULL');
    }
  }
  decodeTeamFormations(draft.formations);
  if (JSON.stringify(draft.formations) === JSON.stringify(document.draft.formations)) return null;
  if (!Number.isSafeInteger(next.documentVersion) || next.documentVersion < 1 || next.documentVersion >= 2147483646)
    throw Error('INVALID_DOCUMENT_VERSION');
  next.documentVersion++;
  return next;
}

/** A stale row aborts the batch connection before COMMIT, rolling back every update. */
export function formationInstallSql(changes) {
  const statements = [
    'CREATE TEMPORARY TABLE formation_install_assertion (changed INT NOT NULL CHECK (changed = 1));',
    'START TRANSACTION;',
    'SELECT version FROM ffb_local_schema FOR UPDATE;',
  ];
  for (const change of changes) {
    if (!tables.includes(change.table) || !/^[a-f0-9-]{36}$/.test(change.before.teamId)
      || change.before.teamId !== change.after.teamId || change.before.documentVersion + 1 !== change.after.documentVersion)
      throw Error('INVALID_FORMATION_CHANGE');
    const encoded = Buffer.from(JSON.stringify(change.after)).toString('hex');
    statements.push(`UPDATE ${change.table} SET document_version=${change.after.documentVersion},`
      + `document_json=CONVERT(0x${encoded} USING utf8mb4) WHERE team_id='${change.before.teamId}'`
      + ` AND document_version=${change.before.documentVersion} AND SHA2(document_json,256)='${hash(change.original)}';`);
    statements.push('INSERT INTO formation_install_assertion VALUES (ROW_COUNT());');
  }
  statements.push('COMMIT;');
  return statements.join('\n');
}

function requireLocalDatabase() {
  const endpoint = process.env.DOCKER_CONTEXT || !process.env.DOCKER_HOST
    ? JSON.parse(run(['context', 'inspect', ...(process.env.DOCKER_CONTEXT ? [process.env.DOCKER_CONTEXT] : [])]))[0]?.Endpoints?.docker?.Host
    : process.env.DOCKER_HOST;
  if (typeof endpoint !== 'string' || !/^(unix:\/\/\/|npipe:\/\/\/+\.\/pipe\/)/.test(endpoint)) throw Error('LOCAL_DOCKER_REQUIRED');
  const [database] = JSON.parse(run(['inspect', '--type', 'container', databaseName]));
  const mounts = database.Mounts.filter(mount => mount.Destination === '/var/lib/mysql');
  const ports = database.HostConfig.PortBindings['3306/tcp'] ?? [];
  if (database.Name !== `/${databaseName}` || !database.State.Running
    || database.Config.Labels['com.docker.compose.project'] !== 'ffb-match-review'
    || database.Config.Labels['com.docker.compose.service'] !== 'database'
    || mounts.length !== 1 || mounts[0].Type !== 'volume' || mounts[0].Name !== 'ffb-match-review_database'
    || ports.length !== 1 || ports[0].HostIp !== '127.0.0.1' || ports[0].HostPort !== '23317') throw Error('REVIEW_DATABASE_MISMATCH');
}

function query(input) {
  return run(['exec', '-i', databaseName, 'sh', '-c', sqlCommand], { input });
}

function readTeams() {
  const output = query(tables.map(table => `SELECT '${table}', document_version, HEX(document_json) FROM ${table} ORDER BY team_id;`).join('\n'));
  return output.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const [table, version, encoded] = line.split('\t');
    const original = Buffer.from(encoded, 'hex').toString('utf8');
    const before = JSON.parse(original);
    if (String(before.documentVersion) !== version) throw Error('DOCUMENT_VERSION_MISMATCH');
    return { table, original, before };
  });
}

function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply') || args.length > 1) throw Error('Usage: node tools/dev-local-install-formations.mjs [--apply]');
  requireLocalDatabase();
  const rows = readTeams();
  const changes = rows.flatMap(row => {
    const after = installFormationRevision(row.before);
    return after ? [{ ...row, after }] : [];
  });
  console.log(`Dev-local formation revision: ${rows.length} stored teams; ${changes.length} updates; ${rows.length - changes.length} already current.`);
  if (!args.includes('--apply') || !changes.length) return;
  const backupDirectory = fileURLToPath(new URL('../.tools/formation-backups/', import.meta.url));
  mkdirSync(backupDirectory, { recursive: true });
  const backup = resolve(backupDirectory, `${new Date().toISOString().replaceAll(':', '-')}.json`);
  writeFileSync(backup, JSON.stringify(rows, null, 2), { flag: 'wx', mode: 0o600 });
  query(formationInstallSql(changes));
  const actual = new Map(readTeams().map(row => [`${row.table}/${row.before.teamId}`, row.before]));
  for (const row of rows) {
    const expected = changes.find(change => change.table === row.table && change.before.teamId === row.before.teamId)?.after ?? row.before;
    if (JSON.stringify(actual.get(`${row.table}/${row.before.teamId}`)) !== JSON.stringify(expected)) throw Error('POST_INSTALL_VERIFICATION_FAILED');
  }
  console.log(`Updated ${changes.length} teams; verified complete documents and retained all unrelated data. Backup: ${backup}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (failure) { console.error(failure.message); process.exitCode = 1; }
}
