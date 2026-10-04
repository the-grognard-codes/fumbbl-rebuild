// Starts the isolated schema-only real-Firebase match acceptance server. It never removes volumes.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeEnvironment } from './dev-local.mjs';
import { checkAdc } from './match-review-adc-check.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const composeFile = join(root, 'containers', 'local', 'compose.v2-acceptance.yaml');
const project = 'ffb-v2-acceptance';
const signingAccount = 'coach-ui-acceptance@dev-moles-under-the-pitch-org.iam.gserviceaccount.com';
const tokenDirectory = join(root, '.tools', 'coach-oriented-match-ui');
const tokenFile = join(tokenDirectory, 'coach-tokens.json');
const reviewServer = 'ffb-match-review-server-1';
const reviewDatabase = 'ffb-match-review-database-1';
const acceptanceDatabase = 'ffb-v2-acceptance-database-1';
const acceptanceServer = 'ffb-v2-acceptance-server-1';

function run(file, args, options = {}) {
  return execFileSync(file, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024, ...options });
}

function inspectContainer(name, expectedProject, service) {
  const [container] = JSON.parse(run('docker', ['inspect', '--type', 'container', name]));
  const labels = container?.Config?.Labels ?? {};
  if (container?.Name !== `/${name}` || labels['com.docker.compose.project'] !== expectedProject
    || labels['com.docker.compose.service'] !== service) throw new Error('ACCEPTANCE_CONTAINER_MISMATCH');
  return container;
}

function existingReviewEnvironment() {
  const server = inspectContainer(reviewServer, 'ffb-match-review', 'server');
  const database = inspectContainer(reviewDatabase, 'ffb-match-review', 'database');
  return composeEnvironment(server, database);
}

function compose(environment, args) {
  return run('docker', ['compose', '-f', composeFile, ...args], { env: environment, stdio: 'inherit' });
}

function verifyAcceptanceVolume() {
  const names = run('docker', ['volume', 'ls', '--format', '{{.Name}}']).split(/\r?\n/);
  const volumeName = `${project}_database`;
  if (!names.includes(volumeName)) return;
  const [volume] = JSON.parse(run('docker', ['volume', 'inspect', volumeName]));
  if (volume?.Name !== volumeName || volume.Labels?.['com.docker.compose.project'] !== project
    || volume.Labels?.['com.docker.compose.volume'] !== 'database') throw new Error('ACCEPTANCE_VOLUME_MISMATCH');
}

export function acceptanceUids(uuid = randomUUID) {
  return ['home', 'away', 'spectator'].map(role => `acceptance-${role}-${uuid().toLowerCase()}`);
}

/** Reuses only synthetic acceptance identities so a retained native match can be resumed. */
export function retainedAcceptanceUids(json) {
  let record;
  try { record = JSON.parse(json); } catch { throw new Error('ACCEPTANCE_IDENTITIES_INVALID'); }
  const values = ['home', 'away', 'spectator'].map(role => record?.[role]?.uid);
  if (values.some((uid, index) => typeof uid !== 'string' || !new RegExp(`^acceptance-${['home', 'away', 'spectator'][index]}-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$`).test(uid))) {
    throw new Error('ACCEPTANCE_IDENTITIES_INVALID');
  }
  return values;
}

function standardAdcFile() {
  if (process.platform === 'win32') {
    if (!process.env.APPDATA) throw new Error('ACCEPTANCE_ADC_UNAVAILABLE');
    return join(process.env.APPDATA, 'gcloud', 'application_default_credentials.json');
  }
  return join(homedir(), '.config', 'gcloud', 'application_default_credentials.json');
}

/** Verifies the refreshed standard gcloud ADC and returns only its path, never its contents. */
export async function verifiedAcceptanceAdc({ source = standardAdcFile(), read = readFileSync, verify = checkAdc } = {}) {
  let credential;
  try { credential = read(source, 'utf8'); } catch { throw new Error('ACCEPTANCE_ADC_UNAVAILABLE'); }
  const status = await verify(credential);
  if (status !== 'OK') throw new Error(`ACCEPTANCE_ADC_${status}`);
  return source;
}

async function waitHealthy(name, service, timeoutSeconds = 180) {
  for (let attempt = 0; attempt < timeoutSeconds / 2; attempt++) {
    const container = inspectContainer(name, project, service);
    if (service === 'database') {
      const data = container.Mounts?.filter(mount => mount.Destination === '/var/lib/mysql') ?? [];
      if (data.length !== 1 || data[0].Type !== 'volume' || data[0].Name !== `${project}_database`) {
        throw new Error('ACCEPTANCE_DATABASE_VOLUME_MISMATCH');
      }
    }
    if (container.State?.Health?.Status === 'healthy') return;
    if (container.State?.Status === 'exited' || container.State?.Status === 'dead') throw new Error(`ACCEPTANCE_${service.toUpperCase()}_EXITED`);
    await new Promise(resolveWait => setTimeout(resolveWait, 2000));
  }
  throw new Error(`ACCEPTANCE_${service.toUpperCase()}_UNHEALTHY`);
}

/** Starts the dedicated DB/server and returns the ignored file consumed by the real-browser driver. */
export async function startAcceptanceServer({ identitiesFile } = {}) {
  const identities = identitiesFile ? retainedAcceptanceUids(readFileSync(identitiesFile, 'utf8')) : acceptanceUids();
  const adcFile = await verifiedAcceptanceAdc();
  const environment = { ...process.env, ...existingReviewEnvironment(),
    M6_ADC_FILE: adcFile,
    ACCEPTANCE_SIGNING_SERVICE_ACCOUNT: process.env.ACCEPTANCE_SIGNING_SERVICE_ACCOUNT || signingAccount };
  verifyAcceptanceVolume();
  mkdirSync(tokenDirectory, { recursive: true });
  // Token mint replaces this file atomically only after success. Retain the
  // old identity source if build/bootstrap/signing fails during a resume.
  compose(environment, ['config', '--quiet']);
  compose(environment, ['build', 'server']);
  compose(environment, ['up', '-d', 'database']);
  await waitHealthy(acceptanceDatabase, 'database');
  verifyAcceptanceVolume();
  compose(environment, ['--profile', 'bootstrap', 'run', '--rm', 'schema-bootstrap']);
  const [homeUid, awayUid, spectatorUid] = identities;
  compose(environment, ['--profile', 'tokens', 'run', '--rm', 'token-mint', '/output/coach-tokens.json', homeUid, awayUid, spectatorUid]);
  compose(environment, ['up', '-d', 'server']);
  await waitHealthy(acceptanceServer, 'server');
  return { tokenFile: resolve(tokenFile), homeUid, awayUid, spectatorUid };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const resume = process.argv.length === 5 && process.argv[3] === '--resume-identities';
  if (process.argv[2] !== '--start' || (process.argv.length !== 3 && !resume)) {
    console.error('Usage: node tools/acceptance-local-server.mjs --start [--resume-identities ignored-token-file]');
    process.exitCode = 2;
  } else {
    try {
      const result = await startAcceptanceServer({ identitiesFile: resume ? resolve(process.argv[4]) : undefined });
      console.log(`Acceptance server ready at ws://127.0.0.1:22235/browser/v2`);
      console.log(`COACH_ACCEPTANCE_TOKENS_FILE=${result.tokenFile}`);
    } catch (failure) {
      const code = /^[A-Z][A-Z_]+$/.test(failure.message) ? failure.message : 'ACCEPTANCE_SERVER_START_FAILED';
      console.error(`Acceptance server: ${code}`);
      process.exitCode = 1;
    }
  }
}
