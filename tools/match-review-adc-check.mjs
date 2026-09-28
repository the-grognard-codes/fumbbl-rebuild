// Local-only preflight for the Firebase Admin credential mounted by the isolated review server.
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const containerName = 'ffb-match-review-server-1';
const mountDestination = '/run/adc/application_default_credentials.json';
const project = 'dev-moles-under-the-pitch-org';

export async function checkAdc(credentialText, fetchImpl = fetch) {
  let credential;
  try { credential = JSON.parse(credentialText); } catch { return 'INVALID_ADC_FILE'; }
  if (credential?.type !== 'authorized_user' || !credential.client_id || !credential.client_secret || !credential.refresh_token) {
    return 'INVALID_ADC_FILE';
  }
  let refresh;
  try {
    refresh = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: credential.client_id,
        client_secret: credential.client_secret,
        refresh_token: credential.refresh_token,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch { return 'REFRESH_UNAVAILABLE'; }
  const tokenReply = await refresh.json().catch(() => null);
  if (!refresh.ok) {
    if (tokenReply?.error === 'invalid_grant' && tokenReply?.error_subtype === 'invalid_rapt') return 'SESSION_EXPIRED';
    return tokenReply?.error === 'invalid_grant' ? 'REAUTHENTICATION_REQUIRED' : `REFRESH_HTTP_${refresh.status}`;
  }
  if (typeof tokenReply?.access_token !== 'string' || !tokenReply.access_token) return 'INVALID_REFRESH_RESPONSE';

  let lookup;
  try {
    lookup = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:lookup`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenReply.access_token}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': project,
      },
      body: JSON.stringify({ localId: ['__ffb_match_review_adc_check__'] }),
      signal: AbortSignal.timeout(10000),
    });
  } catch { return 'FIREBASE_UNAVAILABLE'; }
  return lookup.ok ? 'OK' : `FIREBASE_HTTP_${lookup.status}`;
}

async function main() {
  try {
    const { stdout } = await run('docker', ['inspect', '--type', 'container', containerName],
      { windowsHide: true, maxBuffer: 1024 * 1024 });
    const [container] = JSON.parse(stdout);
    if (!container?.State?.Running) throw Error('REVIEW_SERVER_UNAVAILABLE');
    const mounts = container.Mounts.filter(mount => mount.Destination === mountDestination);
    if (mounts.length !== 1 || mounts[0].Type !== 'bind' || mounts[0].RW !== false) throw Error('ADC_MOUNT_UNAVAILABLE');
    // Read through the running container: an atomically replaced host path can differ from its live bind mount.
    const { stdout: mountedCredential } = await run('docker', ['exec', containerName, 'cat', mountDestination],
      { windowsHide: true, maxBuffer: 32 * 1024 });
    const result = await checkAdc(mountedCredential);
    console.log(`Review Firebase ADC: ${result}`);
    if (result !== 'OK') process.exitCode = 1;
  } catch (failure) {
    const code = ['REVIEW_SERVER_UNAVAILABLE', 'ADC_MOUNT_UNAVAILABLE'].includes(failure.message)
      ? failure.message : 'PREFLIGHT_UNAVAILABLE';
    console.error(`Review Firebase ADC: ${code}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
