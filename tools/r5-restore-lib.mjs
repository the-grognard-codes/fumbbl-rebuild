import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BackupContractError, EXPECTED_SCHEMA_MARKER, EXPECTED_TABLES, sha256, validateManifest } from './r5-backup-lib.mjs';

export function assertEmptyDestination(tables) {
  if (!Array.isArray(tables) || tables.length !== 0) throw new BackupContractError('Restore destination is populated');
}

export function assertCompatibleRuntime(manifest, image, imageId, mariadbVersion) {
  if (manifest.schema.marker !== EXPECTED_SCHEMA_MARKER || manifest.runtime.artifact.image !== image || manifest.runtime.artifact.imageId !== imageId) throw new BackupContractError('Restore runtime image is incompatible with manifest');
  if (manifest.schema.database.mariadb !== mariadbVersion) throw new BackupContractError('Restore MariaDB version is incompatible with manifest');
}

export function assertDistinctMounts(sourceMounts, destinationMounts) {
  const identities = mounts => new Set(mounts.map(mount => `${mount.type ?? mount.Type}:${mount.name ?? mount.Name ?? mount.source ?? mount.Source}`));
  const source = identities(sourceMounts); const destination = identities(destinationMounts);
  if ([...destination].some(identity => source.has(identity))) throw new BackupContractError('Restore storage aliases retained source storage');
}

export async function rawBackup(manifestPath) {
  const manifest = await validateManifest(manifestPath);
  const raw = await readFile(new URL(manifest.files[0].name, `file://${manifestPath.replaceAll('\\', '/')}`));
  if (sha256(raw) !== manifest.files[0].sha256) throw new BackupContractError('Backup artifact changed before restore');
  return { manifest, raw };
}

export function assertDumpParity(raw, manifest) {
  if (raw.length !== manifest.files[0].bytes || sha256(raw) !== manifest.files[0].sha256) throw new BackupContractError('Restored database dump differs from retained backup');
}

export function sanitizedTableDigest(rows) {
  return createHash('sha256').update(rows.join('\n')).digest('hex');
}

export { EXPECTED_TABLES };
