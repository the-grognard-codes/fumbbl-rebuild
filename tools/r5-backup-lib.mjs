import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const MANIFEST_FORMAT = 'ffb-current-runtime-backup-manifest/v1';
export const EXPECTED_SCHEMA_MARKER = 6;
export const EXPECTED_RUNTIME = 'ffb-3.4.0-bb2025-r4.1';
export const EXPECTED_ENGINE = 'ffb-3.4.0-bb2025-m3d.1';
export const EXPECTED_RECOVERY_FORMAT = 3;
export const EXPECTED_REPLAY_FORMAT = 1;
export const EXPECTED_TABLES = Object.freeze([
  'ffb_coaches', 'ffb_games_info', 'ffb_games_serialized', 'ffb_local_schema',
  'ffb_match_recovery', 'ffb_player_markers', 'ffb_prepared_matches', 'ffb_saved_teams',
  'ffb_team_setups', 'ffb_user_settings', 'ffb_v2_account', 'ffb_v2_account_scope',
  'ffb_v2_identity', 'ffb_v2_match_members', 'ffb_v2_preparation_invites',
  'ffb_v2_preparation_requests', 'ffb_v2_saved_teams'
]);

export class BackupContractError extends Error {
  constructor(message) { super(message); this.name = 'BackupContractError'; }
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function manifestDigest(manifest) {
  const unsigned = { ...manifest };
  delete unsigned.manifestSha256;
  return sha256(canonicalJson(unsigned));
}

export function assertNewDestination(destination) {
  return access(destination, constants.F_OK).then(
    () => { throw new BackupContractError(`Backup destination already exists: ${destination}`); },
    error => { if (error.code !== 'ENOENT') throw error; }
  );
}

export async function writeFailedOutput(destination, reason) {
  await mkdir(destination, { recursive: true });
  await writeFile(resolve(destination, 'FAILED.json'), `${JSON.stringify({
    format: MANIFEST_FORMAT,
    status: 'FAILED',
    reason: String(reason).replace(/[\r\n]/g, ' ').slice(0, 300)
  }, null, 2)}\n`, { flag: 'wx' });
}

export async function fileDigest(path) {
  return sha256(await readFile(path));
}

export async function validateManifest(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const fail = message => { throw new BackupContractError(message); };
  if (manifest.format !== MANIFEST_FORMAT || manifest.status !== 'COMPLETE') fail('Manifest is not a complete R5 backup manifest');
  if (manifest.schema?.marker !== EXPECTED_SCHEMA_MARKER) fail('Unsupported database schema marker');
  if (manifest.runtime?.adapter !== EXPECTED_RUNTIME) fail('Unsupported runtime adapter');
  if (manifest.runtime?.engine !== EXPECTED_ENGINE || manifest.formats?.replay !== EXPECTED_REPLAY_FORMAT || manifest.formats?.recovery !== EXPECTED_RECOVERY_FORMAT || manifest.formats?.browserProtocol !== '/browser/v2') fail('Unknown runtime format identifier');
  if (!Array.isArray(manifest.boundary?.tables) || manifest.boundary.tables.join('|') !== EXPECTED_TABLES.join('|')) fail('Unsupported schema table set');
  if (manifest.manifestSha256 !== manifestDigest(manifest)) fail('Manifest integrity hash does not match');
  if (!Array.isArray(manifest.files) || manifest.files.length !== 1) fail('Backup output is incomplete');
  const raw = manifest.files[0];
  if (raw.name !== 'database.sql' || !Number.isSafeInteger(raw.bytes) || raw.bytes <= 0 || !/^[a-f0-9]{64}$/.test(raw.sha256 ?? '')) fail('Backup payload metadata is invalid');
  const rawPath = resolve(dirname(manifestPath), raw.name);
  const content = await readFile(rawPath).catch(() => fail('Backup payload is missing'));
  if (content.length !== raw.bytes || sha256(content) !== raw.sha256) fail('Backup payload is corrupt or truncated');
  if (!Array.isArray(manifest.fixtures) || !manifest.fixtures.some(fixture => fixture.kind === 'paused-server-decision') || !manifest.fixtures.some(fixture => fixture.kind === 'completed-match')) fail('Required paused/completed fixtures are absent');
  return manifest;
}
