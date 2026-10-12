import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const archive = join(root, 'ffb-server', 'target', 'ffb-server.zip');
const sources = ['ObsoleteSavedTeamCleanupMain.java', 'ObsoleteSavedTeamCleanup.java', 'JdbcObsoleteSavedTeamStore.java']
  .map(name => join(root, 'ffb-server', 'src', 'main', 'java', 'com', 'fumbbl', 'ffb', 'server', 'team', name));
const [mode, environment, planFile, digest] = process.argv.slice(2);
if (!['inventory', 'plan', 'apply'].includes(mode) || !/^[A-Za-z0-9_-]{1,80}$/.test(environment ?? '')
  || (mode === 'inventory' ? process.argv.length !== 4 : mode === 'plan' ? process.argv.length !== 5 : process.argv.length !== 6)
  || (mode === 'apply' && !/^[0-9a-f]{64}$/.test(digest ?? ''))) {
  process.stderr.write('Usage: node tools/obsolete-saved-team-cleanup.mjs inventory ENV | plan ENV PLAN_FILE | apply ENV PLAN_FILE PLAN_SHA256\n');
  process.exit(2);
}

let runtime;
let executingJava = false;
try {
  if (sources.some(source => statSync(archive).mtimeMs < statSync(source).mtimeMs)) throw Error('Stale server distribution');
  runtime = mkdtempSync(join(tmpdir(), 'mutp-obsolete-team-'));
  execFileSync('tar', ['-xf', archive, '-C', runtime], { stdio: 'pipe', windowsHide: true });
  const classpath = [join(runtime, 'FantasyFootballServer.jar'), join(runtime, 'lib', '*')].join(delimiter);
  const args = ['-cp', classpath, 'com.fumbbl.ffb.server.team.ObsoleteSavedTeamCleanupMain', mode, environment];
  if (planFile) args.push(resolve(planFile));
  if (digest) args.push(digest);
  executingJava = true;
  execFileSync('java', args, { stdio: 'inherit', windowsHide: true });
} catch (failure) {
  if (!executingJava || typeof failure.status !== 'number') {
    process.stderr.write('CLEANUP_TOOL_FAILED: build the current ffb-server distribution and check the configured database connection.\n');
  }
  process.exitCode = executingJava && typeof failure.status === 'number' ? failure.status : 2;
} finally {
  if (runtime) {
    const absolute = resolve(runtime);
    const tempRoot = resolve(tmpdir()) + sep;
    if (!absolute.startsWith(tempRoot)) throw Error('Temporary cleanup path escaped the temp directory');
    rmSync(absolute, { recursive: true, force: true });
  }
}
