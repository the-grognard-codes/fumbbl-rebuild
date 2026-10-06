// Starts the existing isolated review containers with a verified Firebase Admin ADC.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { checkAdc } from './match-review-adc-check.mjs';
import { reviewMountSource } from './review-mount-source.mjs';

const serverName = 'ffb-match-review-server-1';
const databaseName = 'ffb-match-review-database-1';
const adcDestination = '/run/adc/application_default_credentials.json';
const quotaProject = 'dev-moles-under-the-pitch-org';
const renewalStatuses = new Set(['SESSION_EXPIRED', 'REAUTHENTICATION_REQUIRED', 'INVALID_ADC_FILE', 'INVALID_REFRESH_RESPONSE']);

function docker(...args) {
  return execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 });
}

function container(name, service) {
  const [value] = JSON.parse(docker('inspect', '--type', 'container', name));
  if (value?.Name !== `/${name}` || value.Config?.Labels?.['com.docker.compose.project'] !== 'ffb-match-review'
    || value.Config.Labels['com.docker.compose.service'] !== service) throw Error('REVIEW_CONTAINER_MISMATCH');
  return value;
}

async function checkedCredential(text) {
  const status = await checkAdc(text);
  if (status !== 'OK') throw Error(`ADC_${status}`);
}

function standardAdcFile() {
  if (process.platform === 'win32') {
    if (!process.env.APPDATA) throw Error('STANDARD_ADC_UNAVAILABLE');
    return join(process.env.APPDATA, 'gcloud', 'application_default_credentials.json');
  }
  return join(homedir(), '.config', 'gcloud', 'application_default_credentials.json');
}

function loginForAdc() {
  console.log('Review ADC expired. Opening Google sign-in for Application Default Credentials.');
  const login = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'gcloud auth application-default login'], { stdio: 'inherit', windowsHide: false })
    : spawnSync('gcloud', ['auth', 'application-default', 'login'], { stdio: 'inherit' });
  if (login.status !== 0) throw Error('ADC_LOGIN_FAILED');
}

export async function recoverCredential(target, { source, verify = checkAdc, login = loginForAdc } = {}) {
  let mounted;
  try { mounted = readFileSync(target, 'utf8'); } catch { throw Error('ADC_MOUNT_UNAVAILABLE'); }
  const mountedStatus = await verify(mounted);
  if (mountedStatus === 'OK') return false;
  if (!renewalStatuses.has(mountedStatus)) throw Error(`ADC_${mountedStatus}`);

  const sourceFile = source ?? standardAdcFile();
  let refreshed;
  try { refreshed = readFileSync(sourceFile, 'utf8'); } catch { /* The interactive login can create it. */ }
  const sourceStatus = refreshed ? await verify(refreshed) : 'INVALID_ADC_FILE';
  if (sourceStatus !== 'OK') {
    if (!renewalStatuses.has(sourceStatus)) throw Error(`ADC_${sourceStatus}`);
    login();
    refreshed = readFileSync(sourceFile, 'utf8');
  }
  if (await verify(refreshed) !== 'OK') throw Error('ADC_RENEWAL_INVALID');
  const credential = JSON.parse(refreshed);
  if (credential.type !== 'authorized_user' || !credential.client_id || !credential.client_secret || !credential.refresh_token)
    throw Error('ADC_INVALID_FILE');
  credential.quota_project_id = quotaProject;
  writeFileSync(target, JSON.stringify(credential), { encoding: 'utf8', flag: 'w' });
  return true;
}

async function waitHealthy(name) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (container(name, name === serverName ? 'server' : 'database').State?.Health?.Status === 'healthy') return;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw Error(name === serverName ? 'REVIEW_SERVER_UNHEALTHY' : 'REVIEW_DATABASE_UNHEALTHY');
}

export async function startReview() {
  const server = container(serverName, 'server');
  const database = container(databaseName, 'database');
  const target = reviewMountSource(server, adcDestination, 'ADC_MOUNT_UNAVAILABLE');
  const updated = await recoverCredential(target);
  if (!database.State?.Running) docker('start', databaseName);
  await waitHealthy(databaseName);
  if (!server.State?.Running) docker('start', serverName);
  else if (updated || server.State.Health?.Status !== 'healthy') docker('restart', serverName);
  await waitHealthy(serverName);
  await checkedCredential(docker('exec', serverName, 'cat', adcDestination));
  console.log('Isolated review database and game server are healthy; Firebase ADC: OK.');
}

if (process.argv[1] && process.argv[1].endsWith('match-review-start.mjs')) {
  try { await startReview(); }
  catch (failure) {
    const code = /^([A-Z][A-Z_]+|ADC_[A-Z_0-9]+)$/.test(failure.message) ? failure.message : 'REVIEW_START_FAILED';
    console.error(`Review startup: ${code}`);
    process.exitCode = 1;
  }
}
