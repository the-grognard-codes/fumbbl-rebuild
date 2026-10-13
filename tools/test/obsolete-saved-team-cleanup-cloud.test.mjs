import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const helper = join(root, 'deployment/game-service/cleanup-obsolete-teams-host.sh');
const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const testRoot = join(root, '.tools');
mkdirSync(testRoot, { recursive: true });

function withFixture(run) {
  const fixture = mkdtempSync(join(testRoot, 'cloud-cleanup-test-'));
  try {
    const script = join(fixture, 'tools/obsolete-saved-team-cleanup-cloud.ps1');
    mkdirSync(dirname(script), { recursive: true });
    copyFileSync(join(root, 'tools/obsolete-saved-team-cleanup-cloud.ps1'), script);
    const sources = ['ObsoleteSavedTeamCleanupMain', 'ObsoleteSavedTeamCleanup', 'JdbcObsoleteSavedTeamStore'].map(name =>
      join(fixture, `ffb-server/src/main/java/com/fumbbl/ffb/server/team/${name}.java`));
    for (const source of sources) { mkdirSync(dirname(source), { recursive: true }); writeFileSync(source, '// fixture'); }
    const archive = join(fixture, 'ffb-server/target/ffb-server.zip');
    mkdirSync(dirname(archive), { recursive: true }); writeFileSync(archive, 'fixture archive');
    const host = join(fixture, 'deployment/game-service/cleanup-obsolete-teams-host.sh');
    mkdirSync(dirname(host), { recursive: true }); copyFileSync(helper, host);
    run({ fixture, script, sources, archive });
  } finally {
    assert.ok(resolve(fixture).startsWith(resolve(testRoot) + sep));
    rmSync(fixture, { recursive: true, force: true });
  }
}

function cloud(script, args) {
  return spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args, '-PrintCommands'],
    { encoding: 'utf8', windowsHide: true, timeout: 10000 });
}

test('cloud upload reaches the SSH-created home directory without SFTP tilde expansion', () => withFixture(({ fixture, script, archive }) => {
  const remoteHome = join(fixture, 'remote-home'); mkdirSync(remoteHome);
  const launcher = join(fixture, 'mock-cloud.ps1');
  writeFileSync(launcher, String.raw`
$ErrorActionPreference = 'Stop'
function global:gcloud {
    $cloudArguments = @($args)
    $remoteHome = $env:MUTP_CLEANUP_TEST_REMOTE_HOME
    if ($cloudArguments[1] -eq 'scp') {
        $destination = $cloudArguments[4] -replace '^moles-game:', ''
        # SFTP interprets paths literally; it does not run a shell to expand ~.
        $directory = Join-Path $remoteHome $destination
        if (!(Test-Path -LiteralPath $directory -PathType Container)) {
            [Console]::Error.WriteLine('pscp: remote filespec ' + $destination + ': not a directory')
            $global:LASTEXITCODE = 1
            return
        }
        Copy-Item -LiteralPath $cloudArguments[2], $cloudArguments[3] -Destination $directory
        Write-Output 'UPLOAD_COMPLETE'
    } elseif ($cloudArguments[1] -eq 'ssh') {
        $command = $cloudArguments[([Array]::IndexOf($cloudArguments, '--command') + 1)]
        if ($command -match 'mkdir -p -- "\$HOME/(?<upload>[^"/]+)"') {
            New-Item -ItemType Directory -Force -Path (Join-Path $remoteHome $Matches.upload) | Out-Null
        } elseif ($command -match 'bash "\$HOME/(?<upload>[^"/]+)/cleanup-obsolete-teams-host.sh"') {
            $directory = Join-Path $remoteHome $Matches.upload
            foreach ($name in @('cleanup-obsolete-teams-host.sh', 'ffb-server.zip')) {
                if (!(Test-Path -LiteralPath (Join-Path $directory $name) -PathType Leaf)) {
                    throw "Missing uploaded file: $name"
                }
            }
            Write-Output 'HOST_COMPLETE'
        } else { throw 'Unexpected SSH command' }
    } else { throw 'Unexpected gcloud command' }
    $global:LASTEXITCODE = 0
}
& $env:MUTP_CLEANUP_TEST_WRAPPER -Environment dev -Mode plan
exit $LASTEXITCODE
`);
  const result = spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcher],
    { encoding: 'utf8', windowsHide: true, timeout: 10000,
      env: { ...process.env, MUTP_CLEANUP_TEST_REMOTE_HOME: remoteHome, MUTP_CLEANUP_TEST_WRAPPER: script } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /UPLOAD_COMPLETE[\s\S]*HOST_COMPLETE/);
  const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
  assert.deepEqual(readFileSync(join(remoteHome, `.mutp-team-cleanup-${digest}`, 'ffb-server.zip')), readFileSync(archive));
  assert.deepEqual(readFileSync(join(remoteHome, `.mutp-team-cleanup-${digest}`, 'cleanup-obsolete-teams-host.sh')), readFileSync(helper));
}));

test('cloud plans bind DEV and PROD explicitly without executing gcloud', () => withFixture(({ script }) => {
  for (const [environment, project] of [['DEV', 'dev-moles-under-the-pitch-org'], ['prod', 'molesunderthepitch-dotorg']]) {
    const result = cloud(script, ['-Environment', environment, '-Mode', 'plan']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.match(/^gcloud /gm)?.length, 3);
    assert.match(result.stdout, new RegExp(`'--project' '${project}'`));
    assert.match(result.stdout, /'--zone' 'us-central1-a' '--tunnel-through-iap'/);
    assert.match(result.stdout, new RegExp(`cleanup-obsolete-teams-host.sh" ${environment.toLowerCase()} plan `));
    assert.doesNotMatch(result.stdout, /systemctl| apply /);
  }
}));

test('cloud apply rejects missing/malformed digests before any cloud command', () => withFixture(({ script }) => {
  for (const digest of [undefined, 'invalid', 'a'.repeat(64) + '; command']) {
    const result = cloud(script, ['-Environment', 'prod', '-Mode', 'apply', ...(digest ? ['-PlanSha256', digest] : [])]);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /^gcloud /m);
    assert.match(result.stderr, /Apply requires/);
  }
  const valid = cloud(script, ['-Environment', 'prod', '-Mode', 'apply', '-PlanSha256', 'a'.repeat(64)]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, / prod apply .* a{64}'/);
}));

test('cloud wrapper rejects a newer classifier even when Main is unchanged', () => withFixture(({ script, sources, archive }) => {
  const newer = new Date(Date.now() + 5000);
  utimesSync(sources[1], newer, newer);
  const result = cloud(script, ['-Environment', 'dev']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /package is stale/);
  assert.doesNotMatch(result.stdout, /^gcloud /m);
  assert.ok(readFileSync(archive).equals(Buffer.from('fixture archive')));
}));

function host(fixture, { environment = 'dev', mode = 'plan', state = 'active', foreign = false, digest = true,
  backupFailure = false, applyStatus = 0, existingPlan = false } = {}) {
  const plan = join(fixture, 'plan.json');
  if (existingPlan === 'directory') mkdirSync(plan);
  else if (mode === 'apply' || existingPlan) writeFileSync(plan, '{}');
  else rmSync(plan, { force: true });
  const planDigest = createHash('sha256').update('{}').digest('hex');
  const project = environment === 'dev' ? 'dev-moles-under-the-pitch-org' : 'molesunderthepitch-dotorg';
  const script = `
source "$1"
fixture_dir=$2
id() { printf '0\\n'; }
curl() {
  local endpoint="\${@: -1}"
  case "$endpoint" in
    */project/project-id) printf '%s' '${foreign ? 'foreign-project' : project}' ;;
    */instance/name) printf 'moles-game' ;;
    */instance/zone) printf 'projects/123/zones/us-central1-a' ;;
    *) return 99 ;;
  esac
}
bind_database() { printf 'PROFILE\\n'; }
systemctl() { case "$*" in *LoadState*) printf 'loaded' ;; *ActiveState*) printf '${state}' ;; *) return 99 ;; esac; }
prepare_bundle() { cleanup_work="$fixture_dir"; cleanup_plan="$fixture_dir/plan.json"; printf 'PACKAGE\\n'; }
backup_saved_teams() { printf 'BACKUP\\n'; return ${backupFailure ? 1 : 0}; }
run_cleanup() {
  printf 'CLASSIFIER:%s\\n' "$*"
  if [[ $1 == plan && -e "$cleanup_plan" ]]; then printf 'CLEANUP_FAILED DATABASE_OR_PLAN_ERROR\\n' >&2; return 2; fi
  if [[ $1 == apply ]]; then return ${applyStatus}; fi
}
main '${environment}' '${mode}' fixture.zip '${'b'.repeat(64)}' ${mode === 'apply' && digest ? planDigest : ''}
`;
  return spawnSync(bash, ['-c', script, 'host-test', helper.replaceAll('\\', '/'), fixture.replaceAll('\\', '/')],
    { encoding: 'utf8', windowsHide: true, timeout: 10000 });
}

test('host rejects foreign projects before profile reads or filesystem/database operations', () => withFixture(({ fixture }) => {
  const result = host(fixture, { foreign: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Wrong cloud project/);
  assert.doesNotMatch(result.stdout, /PROFILE|PACKAGE|BACKUP|CLASSIFIER/);
}));

test('repeated cloud plan reports the existing private plan without overwriting it', () => withFixture(({ fixture }) => {
  const result = host(fixture, { environment: 'prod', existingPlan: true });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /CLEANUP_FAILED PLAN_ALREADY_EXISTS/);
  assert.match(result.stdout, /CLASSIFIER:inventory prod/);
  assert.ok(result.stdout.includes('existingPlanSha256=' + createHash('sha256').update('{}').digest('hex')));
  assert.doesNotMatch(result.stdout, /CLASSIFIER:plan|CLASSIFIER:apply|BACKUP/);
  assert.equal(readFileSync(join(fixture, 'plan.json'), 'utf8'), '{}');
}));

test('existing non-file plan path is rejected before inventory or digest reporting', () => withFixture(({ fixture }) => {
  const result = host(fixture, { environment: 'prod', existingPlan: 'directory' });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /CLEANUP_FAILED PLAN_PATH_UNSAFE/);
  assert.doesNotMatch(result.stdout, /CLASSIFIER|existingPlanSha256|BACKUP/);
}));

test('host plan is read-only while apply requires an inactive native service and exact digest', () => withFixture(({ fixture }) => {
  for (const environment of ['dev', 'prod']) {
    const plan = host(fixture, { environment });
    assert.equal(plan.status, 0, plan.stderr);
    assert.match(plan.stdout, new RegExp(`CLASSIFIER:plan ${environment}`));
    assert.doesNotMatch(plan.stdout, /BACKUP|CLASSIFIER:apply/);
    for (const state of ['active', 'activating', 'deactivating']) {
      const apply = host(fixture, { environment, mode: 'apply', state });
      assert.notEqual(apply.status, 0);
      assert.match(apply.stderr, /Apply requires.*stopped/);
      assert.doesNotMatch(apply.stdout, /PACKAGE|BACKUP|CLASSIFIER/);
    }
    const noDigest = host(fixture, { environment, mode: 'apply', state: 'inactive', digest: false });
    assert.notEqual(noDigest.status, 0);
    assert.doesNotMatch(noDigest.stdout, /PROFILE|PACKAGE|BACKUP|CLASSIFIER/);
  }
}));

test('host apply preflights and backs up before invoking the scoped Java deletion', () => withFixture(({ fixture }) => {
  const result = host(fixture, { environment: 'prod', mode: 'apply', state: 'inactive' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CLASSIFIER:inventory prod\nBACKUP\nCLASSIFIER:apply prod .*plan.json [0-9a-f]{64}/);
}));

test('failed backup prevents deletion and uncertain commit status survives the host helper', () => withFixture(({ fixture }) => {
  const failed = host(fixture, { mode: 'apply', state: 'inactive', backupFailure: true });
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /BACKUP/);
  assert.doesNotMatch(failed.stdout, /CLASSIFIER:apply/);
  const uncertain = host(fixture, { mode: 'apply', state: 'inactive', applyStatus: 3 });
  assert.equal(uncertain.status, 3);
  assert.match(uncertain.stdout, /CLASSIFIER:apply/);
}));
