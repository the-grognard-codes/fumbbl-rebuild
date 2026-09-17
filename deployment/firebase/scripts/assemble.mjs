import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configurationScript, resolveEnvironment } from './environment.mjs';
import { hostingConfiguration } from './hosting-policy.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const output = new URL('../hosting/', import.meta.url);
const configuration = resolveEnvironment(process.argv.slice(2), process.env);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const useWindowsNpmCli = process.platform === 'win32' && command === 'npm';
    const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const executable = useWindowsNpmCli ? process.execPath : command;
    const parameters = useWindowsNpmCli ? [npmCli, ...args] : args;
    const child = spawn(executable, parameters, { cwd: repository, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`)));
  });
}

await run('npm', ['run', 'build', '--prefix', 'site']);
if (configuration.environment === 'local') await run('npm', ['run', 'build', '--prefix', 'browser-client']);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('../../../site/dist/', import.meta.url), output, { recursive: true });
if (configuration.environment === 'local') {
  await cp(new URL('../../../browser-client/dist/', import.meta.url), new URL('../hosting/play/', import.meta.url), { recursive: true });
}
await writeFile(new URL('../hosting/firebase-web-config.js', import.meta.url), configurationScript(configuration), 'utf8');
const base = JSON.parse(await readFile(new URL('../../../firebase.json', import.meta.url), 'utf8'));
await writeFile(new URL('../../../firebase.generated.json', import.meta.url), JSON.stringify(hostingConfiguration(base, configuration), null, 2) + '\n');
console.log(`Assembled ${configuration.environment} Firebase Hosting artifact at ${fileURLToPath(output)}`);
